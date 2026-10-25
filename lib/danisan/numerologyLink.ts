/**
 * AŞAMA 2 / DY-005 · DY-006 — Kayıtlı Numeroloji analizi ↔ Danışan Yolculuğu danışanı bağı (sunucu).
 *
 * Kurallar (owner kararı A):
 *  - Bu modüldeki bağ YALNIZ uzmanın açık işlemiyle kurulur; isim/doğum tarihi benzerliğiyle
 *    öneri, otomatik ya da toplu eşleştirme YOK (danışan araması uzmanın yazdığı metinle yapılır).
 *  - Owner kararı (2026-10-24): danışanın KENDİ kaydından üretilen tam analiz ayrıca otomatik
 *    oluşturulup bağlanır (lib/danisan/numerologyAuto — kayıt danışanın girdileriyle üretilir,
 *    benzerlik eşleştirmesi değildir). UI'daki elle Bağla/Kaldır düğmeleri kaldırıldı; bu uçlar ve
 *    mevcut bağlar geriye dönük uyumluluk için korunur.
 *  - Yalnız `numerology_records.client_id` yazılır; analysis_data / ad / doğum tarihi / motor
 *    çıktısı DEĞİŞMEZ.
 *  - Tenant oturumdan gelir; danışan ve kayıt aynı tenant'ta olmalı (DB'de bileşik FK de zorlar).
 *  - Atomik: bağlama yalnız kayıt BAĞSIZKEN, kaldırma yalnız beklenen danışana bağlıyken yazar
 *    (tek koşullu UPDATE; eşzamanlı farklı bağlama → 409).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type NumerologyLinkFail = { ok: false; status: number; code: string; error: string };
export type LinkedClient = { id: string; ad: string; soyad: string; dogum: string | null };

const fail = (status: number, code: string, error: string): NumerologyLinkFail => ({ ok: false, status, code, error });

/** Kolon yok (migration 20271120000300 uygulanmamış) → bağ özelliği kapalı (fail-closed). */
export function isMissingClientIdColumn(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "");
  return err.code === "42703" || err.code === "PGRST204" || (/client_id/.test(msg) && /(does not exist|could not find|column)/i.test(msg));
}

export const LINK_UNAVAILABLE = fail(503, "LINK_UNAVAILABLE", "Danışan bağlantısı şu anda kullanılamıyor.");

function toClient(r: Record<string, unknown>): LinkedClient {
  return {
    id: String(r.id),
    ad: typeof r.ad === "string" ? r.ad : "",
    soyad: typeof r.soyad === "string" ? r.soyad : "",
    dogum: typeof r.dogum === "string" && r.dogum.trim() ? r.dogum : null,
  };
}

/** Kaydın mevcut bağı (+ bağlı danışanın adı). Kayıt bu tenant'ta yoksa 404. */
export async function readRecordLink(
  db: SupabaseClient,
  tenantId: string,
  recordId: string,
): Promise<{ ok: true; clientId: string | null; client: LinkedClient | null } | NumerologyLinkFail> {
  const { data, error } = await db.from("numerology_records").select("id, client_id").eq("tenant_id", tenantId).eq("id", recordId).maybeSingle();
  if (error) return isMissingClientIdColumn(error) ? LINK_UNAVAILABLE : fail(500, "DB_ERROR", "Kayıt okunamadı.");
  if (!data) return fail(404, "NOT_FOUND", "Kayıt bulunamadı.");
  const clientId = (data as { client_id?: string | null }).client_id ?? null;
  if (!clientId) return { ok: true, clientId: null, client: null };
  const { data: c, error: cErr } = await db.from("clients").select("id, ad, soyad, dogum").eq("tenant_id", tenantId).eq("id", clientId).maybeSingle();
  if (cErr) return fail(500, "DB_ERROR", "Danışan okunamadı.");
  return { ok: true, clientId, client: c ? toClient(c as Record<string, unknown>) : null };
}

/** Uzmanın yazdığı metinle danışan arama (yalnız id/ad/soyad/doğum; tenant-kapsamlı). */
export async function searchClientsForLink(
  db: SupabaseClient,
  tenantId: string,
  rawSearch: string,
  limit = 20,
): Promise<{ rows: LinkedClient[]; error: boolean }> {
  const cleaned = rawSearch.replace(/[,()*%\\.:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const tokens = cleaned ? cleaned.split(" ").filter(Boolean) : [];
  const trLower = (s: string) => s.toLocaleLowerCase("tr-TR");
  let q = db.from("clients").select("id, ad, soyad, dogum").eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (tokens.length > 0) {
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0]!;
    q = q.or(`ad.ilike.%${longest}%,soyad.ilike.%${longest}%`);
  }
  const { data, error } = await q.limit(tokens.length > 1 ? 200 : Math.max(1, Math.min(limit, 50)));
  if (error) return { rows: [], error: true };
  const wanted = tokens.map(trLower);
  const rows = ((data ?? []) as Record<string, unknown>[])
    .map(toClient)
    .filter((c) => wanted.every((t) => trLower(`${c.ad} ${c.soyad}`).includes(t)))
    .slice(0, limit);
  return { rows, error: false };
}

/** Bağsız kaydı danışana bağlar (atomik: yalnız client_id NULL iken). Aynı danışana tekrar → ok. */
export async function linkRecordToClient(
  db: SupabaseClient,
  tenantId: string,
  recordId: string,
  clientId: string,
): Promise<{ ok: true; changed: boolean } | NumerologyLinkFail> {
  const { data: c, error: cErr } = await db.from("clients").select("id").eq("tenant_id", tenantId).eq("id", clientId).maybeSingle();
  if (cErr) return fail(500, "DB_ERROR", "Danışan doğrulanamadı.");
  if (!c) return fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı.");
  const { data, error } = await db.from("numerology_records").update({ client_id: clientId })
    .eq("tenant_id", tenantId).eq("id", recordId).is("client_id", null).select("id");
  if (error) {
    if (isMissingClientIdColumn(error)) return LINK_UNAVAILABLE;
    // H-11: danışan doğrulandıktan sonra (eşzamanlı olarak) silindiyse bileşik FK 23503 verir; veri bozulmaz,
    // kullanıcıya anlamlı 404 döner (genel 500 yerine).
    if ((error as { code?: string }).code === "23503") return fail(404, "CLIENT_NOT_FOUND", "Danışan bulunamadı.");
    return fail(500, "DB_ERROR", "Bağlantı kaydedilemedi.");
  }
  if (Array.isArray(data) && data.length === 1) return { ok: true, changed: true };
  const cur = await readRecordLink(db, tenantId, recordId);
  if (!cur.ok) return cur;
  if (cur.clientId === clientId) return { ok: true, changed: false };
  return fail(409, "ALREADY_LINKED", "Bu analiz başka bir danışana bağlı. Önce mevcut bağlantıyı kaldırın.");
}

/** Bağı kaldırır (atomik: yalnız beklenen danışana bağlıyken). Kayıt ve snapshot SİLİNMEZ. */
export async function unlinkRecord(
  db: SupabaseClient,
  tenantId: string,
  recordId: string,
  expectedClientId: string,
): Promise<{ ok: true; changed: boolean } | NumerologyLinkFail> {
  const { data, error } = await db.from("numerology_records").update({ client_id: null })
    .eq("tenant_id", tenantId).eq("id", recordId).eq("client_id", expectedClientId).select("id");
  if (error) return isMissingClientIdColumn(error) ? LINK_UNAVAILABLE : fail(500, "DB_ERROR", "Bağlantı kaldırılamadı.");
  if (Array.isArray(data) && data.length === 1) return { ok: true, changed: true };
  const cur = await readRecordLink(db, tenantId, recordId);
  if (!cur.ok) return cur;
  if (cur.clientId === null) return { ok: true, changed: false };
  return fail(409, "LINK_CHANGED", "Bağlantı başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin.");
}

export type LinkedNumerologyRecord = {
  id: string;
  name: string;
  surname: string;
  birth_date: string | null;
  created_at: string | null;
};

/** Danışana BAĞLI kayıtlı analizler (danışan Word seçim listesi; snapshot taşınmaz). */
export async function listClientNumerologyRecords(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ ok: true; rows: LinkedNumerologyRecord[] } | NumerologyLinkFail> {
  const { data, error } = await db.from("numerology_records")
    .select("id, name, surname, birth_date, created_at")
    .eq("tenant_id", tenantId).eq("client_id", clientId)
    .order("created_at", { ascending: false }).limit(200);
  if (error) return isMissingClientIdColumn(error) ? LINK_UNAVAILABLE : fail(500, "DB_ERROR", "Numeroloji kayıtları okunamadı.");
  return {
    ok: true,
    rows: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
      surname: typeof r.surname === "string" ? r.surname : "",
      birth_date: typeof r.birth_date === "string" ? r.birth_date : null,
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    })),
  };
}
