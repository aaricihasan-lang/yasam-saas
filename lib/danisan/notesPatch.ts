/**
 * client_notes PATCH — alan-bazlı yazım + `notlar` iyimser eşzamanlılık (CAS).
 *
 * Veri kaybı kök nedeni (DY-A): istemci notlar GET'i başarısız olsa bile boş liste
 * üzerinden kayıt yapabiliyor; sunucu da gövdede olmayan alanları `?? null` ile
 * EZİYORDU. Yeni sözleşme:
 *  - Sunucu yalnız gövdede GERÇEKTEN bulunan alanları yazar (`k in body`).
 *  - `notlar_version = sha256(notlar ?? "")` GET/PATCH yanıtlarında döner.
 *  - İstemci `notlar` yazarken `base_version` gönderir; uyuşmazsa 409.
 *  - Yazım atomik koşulludur (`sha256(notlar)` hâlâ base_version ise) — arada değişim → 409.
 *    DY-01: koşul SQL'de (RPC) değerlendirilir; not METNİ hiçbir zaman URL'e konmaz
 *    (eski `.eq("notlar", tamMetin)` ~8.5K karakterde ağ geçidine takılıyordu).
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

/** Atomik CAS'ı SQL'de yapan RPC (migration 20271002000000). */
export const NOTES_CAS_RPC = "client_notes_cas_update";

function isMissingRpc(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST202" || e.code === "42883") return true;
  return typeof e.message === "string" && e.message.includes(NOTES_CAS_RPC) && /could not find|does not exist/i.test(e.message);
}

/**
 * Var olan client_notes satırını alan-bazlı günceller.
 *
 * DY-01: `notlar` CAS koşulu artık not METNİNİ URL'e koymaz. Birincil yol, karşılaştırmayı
 * `sha256(notlar)` ile SQL'de yapan tek-ifadelik RPC'dir (atomik; içerik JSON gövdede).
 * RPC yoksa (migration henüz uygulanmamış) geri düşüş: id/tenant/client filtresiyle
 * güncelleme — sürüm az önce okunan satırla sunucuda doğrulandı (decideNotesWrite), iki
 * sekme çakışması yine 409 olur; yalnız milisaniyelik okuma→yazma penceresi atomik değildir.
 */
async function updateNotesRow(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  noteId: string,
  fields: NoteFields,
  expectedVersion: string | null,
  currentRaw: string | null,
): Promise<{ rows: NoteRow[]; error: unknown }> {
  const rpc = await db.rpc(NOTES_CAS_RPC, {
    p_tenant_id: tenantId,
    p_client_id: clientId,
    p_note_id: noteId,
    p_expected_sha256: expectedVersion,
    p_fields: fields,
  });
  if (!rpc.error) return { rows: ((rpc.data ?? []) as NoteRow[]), error: null };
  if (!isMissingRpc(rpc.error)) return { rows: [], error: rpc.error };

  let q = db
    .from("client_notes")
    .update(fields)
    .eq("id", noteId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  // İçerik taşımayan tek koşul: okunan değer boşsa hâlâ boş olmalı. Dolu metin URL'e KONMAZ.
  if (expectedVersion !== null && currentRaw === null) q = q.is("notlar", null);
  const { data, error } = await q.select();
  return { rows: ((data ?? []) as NoteRow[]), error };
}

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
      const expected = writesNotlar && baseVersion !== null ? baseVersion : null;
      const upd = await updateNotesRow(db, tenantId, clientId, row.id, fields, expected, currentRaw);
      if (upd.error) return { kind: "error", cause: upd.error };
      const list = upd.rows;
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
