/**
 * client_notes PATCH — alan-bazlı yazım + `notlar` iyimser eşzamanlılık (CAS).
 *
 * Veri kaybı kök nedeni (DY-A): istemci notlar GET'i başarısız olsa bile boş liste
 * üzerinden kayıt yapabiliyor; sunucu da gövdede olmayan alanları `?? null` ile
 * EZİYORDU. Yeni sözleşme:
 *  - Sunucu yalnız gövdede GERÇEKTEN bulunan alanları yazar (`k in body`).
 *  - `notlar_version = sha256(notlar ?? "")` GET/PATCH yanıtlarında döner.
 *  - İstemci `notlar` yazarken `base_version` gönderir; uyuşmazsa 409.
 *  - Yazım atomik koşulludur (`notlar` hâlâ okunan değerse) — arada değişim → 409.
 *  - `base_version` GÖNDERMEYEN eski istemci geçiş süresince kabul edilir (CAS'sız).
 *
 * Saf modül (node:crypto dışında bağımlılık yok) → route ve harness ortak kullanır.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const NOTE_FIELDS = ["saglik_notu", "adres", "oneriler", "notlar"] as const;
export type NoteField = (typeof NOTE_FIELDS)[number];
export type NoteFields = Partial<Record<NoteField, string | null>>;

export const NOTES_CONFLICT_MESSAGE = "Notlar başka yerde değişti, yenileniyor.";

/** `notlar` içeriğinin sürüm özeti (null ve "" aynı sürümdür). */
export function notesVersion(raw: string | null | undefined): string {
  return createHash("sha256").update(raw ?? "", "utf8").digest("hex");
}

export type BuildFieldsResult =
  | { ok: true; fields: NoteFields; baseVersion: string | null }
  | { ok: false; error: string };

/** Gövdeden yalnız mevcut alanları çıkarır; tip dışı değer → hata. */
export function buildNotesFields(body: unknown): BuildFieldsResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Geçersiz istek gövdesi." };
  }
  const src = body as Record<string, unknown>;
  const fields: NoteFields = {};
  for (const k of NOTE_FIELDS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (v !== null && typeof v !== "string") {
      return { ok: false, error: "Geçersiz alan değeri." };
    }
    fields[k] = v as string | null;
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: "Güncellenecek alan yok." };
  }
  const bv = src.base_version;
  const baseVersion = typeof bv === "string" && bv.trim() ? bv.trim() : null;
  return { ok: true, fields, baseVersion };
}

/**
 * CAS kararı. `notlar` yazılmıyorsa veya istemci base_version göndermiyorsa (eski
 * istemci) kontrol yok → "write". Aksi halde mevcut sürümle eşleşmeli.
 */
export function decideNotesWrite(input: {
  writesNotlar: boolean;
  baseVersion: string | null;
  currentRaw: string | null | undefined;
}): "write" | "conflict" {
  if (!input.writesNotlar || input.baseVersion === null) return "write";
  return notesVersion(input.currentRaw ?? null) === input.baseVersion ? "write" : "conflict";
}

export type NoteRow = {
  id: string;
  notlar?: string | null;
  saglik_notu?: string | null;
  adres?: string | null;
  oneriler?: string | null;
  [k: string]: unknown;
};

export type ApplyNotesResult =
  | { kind: "ok"; note: NoteRow }
  | { kind: "conflict"; note: NoteRow | null }
  | { kind: "error"; cause: unknown };

const UNIQUE_VIOLATION = "23505";

/**
 * Alan-bazlı, CAS korumalı yazım (en çok 2 deneme: ekleme yarışında 23505 →
 * mevcut satır üzerinden güncelleme). tenant_id + client_id her sorguda zorunlu.
 */
export async function applyNotesPatch(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  fields: NoteFields,
  baseVersion: string | null,
): Promise<ApplyNotesResult> {
  const writesNotlar = "notlar" in fields;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: existing, error: readErr } = await db
      .from("client_notes")
      .select("*")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (readErr) return { kind: "error", cause: readErr };

    const row = existing as NoteRow | null;
    const currentRaw = row ? (row.notlar ?? null) : null;

    if (decideNotesWrite({ writesNotlar, baseVersion, currentRaw }) === "conflict") {
      return { kind: "conflict", note: row };
    }

    if (row?.id) {
      let q = db
        .from("client_notes")
        .update(fields)
        .eq("id", row.id)
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId);
      // Atomik koşul: yalnız CAS'lı notlar yazımında okunan değer hâlâ geçerliyse yaz.
      if (writesNotlar && baseVersion !== null) {
        q = currentRaw === null ? q.is("notlar", null) : q.eq("notlar", currentRaw);
      }
      const { data: updated, error: updErr } = await q.select();
      if (updErr) return { kind: "error", cause: updErr };
      const list = (updated ?? []) as NoteRow[];
      if (list.length === 0) {
        // Okuma ile yazma arasında notlar değişti → çakışma; güncel satırı döndür.
        const { data: fresh } = await db
          .from("client_notes")
          .select("*")
          .eq("client_id", clientId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        return { kind: "conflict", note: (fresh as NoteRow | null) ?? null };
      }
      return { kind: "ok", note: list[0] };
    }

    const { data: inserted, error: insErr } = await db
      .from("client_notes")
      .insert({ tenant_id: tenantId, client_id: clientId, ...fields })
      .select()
      .single();
    if (!insErr) return { kind: "ok", note: inserted as NoteRow };
    if ((insErr as { code?: string }).code === UNIQUE_VIOLATION) continue; // yarış → tekrar oku
    return { kind: "error", cause: insErr };
  }
  return { kind: "conflict", note: null };
}
