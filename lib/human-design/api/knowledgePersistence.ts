// Sprint-4 Aşama-1 — human_design_knowledge_records güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • Yazma alanları allow-list ile süzülür (tenant_id/user_id/id/zaman override edilemez).
//   • Tüm sorgu/insert/update/delete tenant-scoped.
// HD engine/compute/BodyGraph matematiğine DOKUNMAZ — yalnız knowledge_records CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import { HD_CONFLICT_CODE, HD_CONFLICT_MESSAGE } from "./optimistic";
import type {
  HumanDesignKnowledgeRecord,
  HumanDesignKnowledgeRecordInsert,
} from "@/lib/human-design/types";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import { hdXmlSafeLine, hdXmlSafeMultiline } from "@/lib/human-design/reporting/xmlSafeText";
import { HD_CHANNEL_CATEGORY, HD_GATE_CATEGORY, normalizeHdStructuredTitle } from "@/lib/human-design/knowledge/hdNames";

const TABLE = "human_design_knowledge_records";

export type HdKnowledgeEditable = Partial<
  Omit<HumanDesignKnowledgeRecordInsert, "tenant_id" | "user_id">
>;

// client'tan kabul edilen alanlar (tenant_id/user_id/id/created_at yok sayılır).
const EDITABLE_KEYS: (keyof HumanDesignKnowledgeRecord)[] = [
  "category",
  "title",
  "code",
  "content",
  "keywords",
  "related_gates",
  "related_channels",
  "related_centers",
  "tags",
  "sort_order",
  "is_active",
  "expert_notes",
];

// HD-09: Word'e girebilen metin alanlarında XML 1.0'da geçersiz kontrol karakterleri kayda
// girmez (Word'den yapıştırılan Shift+Enter = U+000B vb.). Başlık/kategori tek satır; içerik ve
// özel notlarda satır benzeri ayırıcılar normal satır sonuna dönüşür. Güvenli metin değişmez.
const SINGLE_LINE_TEXT_KEYS = new Set(["category", "title"]);
const MULTILINE_TEXT_KEYS = new Set(["content", "expert_notes"]);

function pick(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) {
    if (!(k in input)) continue;
    const v = input[k];
    if (typeof v === "string" && SINGLE_LINE_TEXT_KEYS.has(k)) out[k] = hdXmlSafeLine(v);
    else if (typeof v === "string" && MULTILINE_TEXT_KEYS.has(k)) out[k] = hdXmlSafeMultiline(v);
    else out[k] = v;
  }
  return out;
}

// Taslak güvenliği (server savunması, "Ya doğru bilgi ya hiç"): AKTİF bir kaydın
// "Bilgi ve Açıklamalar" (content) alanı boş OLAMAZ. Pasif (taslak) kayıt boş içerikle olur.
const ACTIVE_CONTENT_ERROR =
  "Kaydı aktif etmek için Bilgi ve Açıklamalar alanını doldurun.";

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

export const IDENTITY_LOCKED_CODE = "HD_IDENTITY_LOCKED";
const IDENTITY_LOCKED_ERROR =
  "Kapı/kanal kaydının kategorisi ve numarası değiştirilemez; yalnız görünen ad ve açıklama düzenlenebilir.";

const DUPLICATE_CODE_ERROR = "Bu kapı/kanal/başlık için Bilgi Bankanızda zaten bir kayıt var. Mevcut kaydı düzenleyin.";

/**
 * Kapılar/Kanallar: kod resmi kapı/kanal olmalı; başlık koddaki numarayla yeniden kurulur
 * (görünen ad kişiselleştirmesi — numara/çift değiştirilemez, boş ad → hazır ad). Diğer
 * kategorilerde dokunmaz. `picked` yerinde güncellenir.
 */
function applyStructuredTitle(
  picked: Record<string, unknown>,
  effective: { category: unknown; code: unknown; title: unknown },
): string | null {
  if (effective.category !== HD_GATE_CATEGORY && effective.category !== HD_CHANNEL_CATEGORY) return null;
  const r = normalizeHdStructuredTitle(effective.category, effective.code, effective.title);
  if (!r.ok) return r.error;
  picked.title = r.title;
  return null;
}

/** Sunucu kayıt sırası: manuel sort_order ARTIK sırayı belirlemez (istemci/Word hdKnowledgeSort ile
 *  doğal sıralar). Burada yalnız kararlı bir okuma sırası verilir. */
export async function listKnowledge(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: HumanDesignKnowledgeRecord[]; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "listKnowledge")
    .order("category", { ascending: true })
    .order("code", { ascending: true });
  if (error) return { rows: [], error: hdSafeDbError("listKnowledge", error) };
  return { rows: (data ?? []) as HumanDesignKnowledgeRecord[], error: null };
}

/**
 * Kapı/kanal GÖRÜNEN AD okuması — YALNIZ category/code/title (içerik ve Özel Çalışma Notları
 * OKUNMAZ). Aktif/pasif fark etmez (ad, açıklamadan bağımsız). Tenant-scoped.
 */
export async function listKnowledgeNames(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: Array<{ category: string; code: string; title: string }>; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("category, code, title"), tenantId, "listKnowledgeNames")
    .in("category", [HD_GATE_CATEGORY, HD_CHANNEL_CATEGORY]);
  if (error) return { rows: [], error: hdSafeDbError("listKnowledgeNames", error) };
  return { rows: (data ?? []) as Array<{ category: string; code: string; title: string }>, error: null };
}

export async function getKnowledgeById(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: HumanDesignKnowledgeRecord | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "getKnowledgeById")
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("getKnowledgeById", error) };
  if (!data) return { row: null, error: "Kayıt bulunamadı." };
  return { row: data as HumanDesignKnowledgeRecord, error: null };
}

export async function listKnowledgeByCodes(
  db: SupabaseClient,
  tenantId: string,
  codes: string[],
): Promise<{ rows: HumanDesignKnowledgeRecord[]; error: string | null }> {
  if (codes.length === 0) return { rows: [], error: null };
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "listKnowledgeByCodes")
    .eq("is_active", true)
    .in("code", codes)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: hdSafeDbError("listKnowledgeByCodes", error) };
  return { rows: (data ?? []) as HumanDesignKnowledgeRecord[], error: null };
}

/**
 * DANIŞAN RAPORU (Word v2) için Bilgi Bankası okuması — YALNIZ rapora girebilecek kolonlar.
 * "Özel Çalışma Notları" (expert_notes) bu sorguda HİÇ OKUNMAZ → hiçbir seçim/istek onu rapora
 * taşıyamaz. Yalnız bu tenant, yalnız aktif kayıt, yalnız haritanın kodları.
 */
export const KNOWLEDGE_REPORT_COLUMNS = "id, category, title, code, content, is_active, sort_order, created_at";
export type KnowledgeReportRow = Pick<HumanDesignKnowledgeRecord, "id" | "category" | "title" | "code" | "content" | "is_active">;

export async function listKnowledgeForReport(
  db: SupabaseClient,
  tenantId: string,
  codes: string[],
): Promise<{ rows: KnowledgeReportRow[]; error: string | null }> {
  if (codes.length === 0) return { rows: [], error: null };
  const { data, error } = await withTenant(db.from(TABLE).select(KNOWLEDGE_REPORT_COLUMNS), tenantId, "listKnowledgeForReport")
    .eq("is_active", true)
    .in("code", codes)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: hdSafeDbError("listKnowledgeForReport", error) };
  return { rows: (data ?? []) as unknown as KnowledgeReportRow[], error: null };
}

export async function insertKnowledge(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null; existingId?: string }> {
  const picked = pick(input);
  // is_active verilmezse DB default TRUE → aktif kabul edilir.
  const activeEffective = picked.is_active === undefined ? true : picked.is_active === true;
  if (activeEffective && isBlank(picked.content)) {
    return { id: null, error: ACTIVE_CONTENT_ERROR };
  }
  const structErr = applyStructuredTitle(picked, { category: picked.category, code: picked.code, title: picked.title });
  if (structErr) return { id: null, error: structErr };
  // Mükerrer kod (UNIQUE(tenant_id, code)) → anlaşılır red + mevcut kaydın id'si.
  if (typeof picked.code === "string" && picked.code) {
    const { data: dup } = await withTenant(db.from(TABLE).select("id"), tenantId, "insertKnowledge.dup")
      .eq("code", picked.code)
      .maybeSingle();
    if (dup) return { id: null, error: DUPLICATE_CODE_ERROR, existingId: (dup as { id: string }).id };
  }
  const payload = tenantInsertPayload(tenantId, {
    ...picked,
    user_id: userId,
    updated_at: new Date().toISOString(),
  });
  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error || !data) return { id: null, error: error ? hdSafeDbError("insertKnowledge", error) : "Kayıt oluşturulamadı." };
  return { id: (data as { id: string }).id, error: null };
}

export async function updateKnowledge(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  input: Record<string, unknown>,
  opts: { expectedUpdatedAt?: string } = {},
): Promise<{ ok: boolean; error: string | null; status?: number; code?: string; updatedAt?: string | null }> {
  const picked = pick(input);
  // Kısmi payload'da nihai durumu değerlendir: eksik alanlar mevcut kayıttan alınır.
  let activeEffective: boolean;
  let contentEffective: unknown;
  if (picked.is_active === undefined || picked.content === undefined) {
    const { data: existing } = await withTenant(db.from(TABLE).select("is_active, content"), tenantId, "updateKnowledge.existing")
      .eq("id", id)
      .maybeSingle();
    const ex = (existing ?? null) as { is_active?: boolean; content?: string } | null;
    activeEffective =
      picked.is_active === undefined ? ex?.is_active === true : picked.is_active === true;
    contentEffective = picked.content === undefined ? (ex?.content ?? "") : picked.content;
  } else {
    activeEffective = picked.is_active === true;
    contentEffective = picked.content;
  }
  if (activeEffective && isBlank(contentEffective)) {
    return { ok: false, error: ACTIVE_CONTENT_ERROR };
  }

  // Kapı/kanal TEKNİK KİMLİK KİLİDİ (sunucu garantisi; arayüzdeki disabled'a güvenilmez):
  // kimlik alanlarından biri istekte varsa kayıtlı category/code/title VERİTABANINDAN okunur.
  // Kayıt Kapılar/Kanallar ise category ve code DEĞİŞTİRİLEMEZ — yalnız görünen ad (title)
  // ve diğer izinli alanlar. Farklı kimlik gelirse hiçbir şey yazılmadan reddedilir.
  let lockedIdentity: { category: string; code: string } | null = null;
  if (picked.category !== undefined || picked.code !== undefined || picked.title !== undefined) {
    type Identity = { category?: unknown; code?: unknown; title?: unknown };
    const { data: existing } = await withTenant(db.from(TABLE).select("category, code, title"), tenantId, "updateKnowledge.identity")
      .eq("id", id)
      .maybeSingle();
    const ex = (existing ?? null) as Identity | null;
    if (ex && (ex.category === HD_GATE_CATEGORY || ex.category === HD_CHANNEL_CATEGORY)) {
      const categoryChanged = picked.category !== undefined && picked.category !== ex.category;
      const codeChanged = picked.code !== undefined && picked.code !== ex.code;
      if (categoryChanged || codeChanged) {
        return { ok: false, error: IDENTITY_LOCKED_ERROR, status: 400, code: IDENTITY_LOCKED_CODE };
      }
      lockedIdentity = { category: String(ex.category), code: String(ex.code) };
    }
    const structErr = applyStructuredTitle(picked, {
      category: picked.category !== undefined ? picked.category : ex?.category,
      code: picked.code !== undefined ? picked.code : ex?.code,
      title: picked.title !== undefined ? picked.title : ex?.title,
    });
    if (structErr) return { ok: false, error: structErr };
    // Kod değişiyorsa (kilitsiz kategoriler) aynı tenant'ta o kod başka kayıtta olamaz.
    if (typeof picked.code === "string" && ex && picked.code !== ex.code) {
      const { data: dup } = await withTenant(db.from(TABLE).select("id"), tenantId, "updateKnowledge.dup")
        .eq("code", picked.code)
        .maybeSingle();
      if (dup && (dup as { id: string }).id !== id) {
        return { ok: false, error: DUPLICATE_CODE_ERROR, status: 409, code: "DUPLICATE_CODE" };
      }
    }
  }

  const fields = { ...picked, updated_at: new Date().toISOString() };
  // P2-9: beklenen sürüm verildiyse koşullu (atomik) güncelleme — başka oturum ezilmez.
  let q = withTenant(db.from(TABLE).update(fields), tenantId, "updateKnowledge").eq("id", id);
  // Kilitli kimlik: güncelleme yalnız kayıtlı category/code hâlâ aynıysa uygulanır (atomik).
  if (lockedIdentity) q = q.eq("category", lockedIdentity.category).eq("code", lockedIdentity.code);
  if (opts.expectedUpdatedAt) q = q.eq("updated_at", opts.expectedUpdatedAt);
  const { data, error } = await q.select("id, updated_at");
  if (error) return { ok: false, error: hdSafeDbError("updateKnowledge", error) };
  if (!data || data.length === 0) {
    if (opts.expectedUpdatedAt) {
      const { data: still } = await withTenant(db.from(TABLE).select("id"), tenantId, "updateKnowledge.exists").eq("id", id).maybeSingle();
      if (still) return { ok: false, error: HD_CONFLICT_MESSAGE, status: 409, code: HD_CONFLICT_CODE };
    }
    return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil.", status: 404 };
  }
  return { ok: true, error: null, updatedAt: (data[0] as { updated_at?: string | null }).updated_at ?? null };
}

export async function deleteKnowledge(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null; status?: number }> {
  const { data, error } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteKnowledge")
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: hdSafeDbError("deleteKnowledge", error) };
  // HD-27 (GUV-05): silinen satır yoksa başarı DÖNÜLMEZ.
  if (!data || data.length === 0) return { ok: false, error: "Kayıt bulunamadı veya bu hesaba ait değil.", status: 404 };
  return { ok: true, error: null };
}

export async function deleteKnowledgeBulk(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<{ ok: boolean; error: string | null; deletedCount: number }> {
  if (ids.length === 0) return { ok: true, error: null, deletedCount: 0 };
  const { data, error } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteKnowledgeBulk")
    .in("id", ids)
    .select("id");
  if (error) return { ok: false, error: hdSafeDbError("deleteKnowledgeBulk", error), deletedCount: 0 };
  // HD-27 (GUV-05): gerçekten silinen satır sayısı (istenen sayı değil) döner.
  return { ok: true, error: null, deletedCount: (data ?? []).length };
}
