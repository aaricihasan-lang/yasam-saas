/**
 * BİYOENERJİ FAZ 2 — Çakra visible content block CRUD saf-logic (validation + whitelist).
 *
 * Bu modül SAF ve test-edilebilir: DB/HTTP yok. API route (server) bunu kullanır.
 * Güvenlik sözleşmesi:
 *  - Kullanıcı yalnız GÖRÜNÜR (visible) block yaratır/günceller; `source-evidence`
 *    normal editörden OLUŞTURULAMAZ/DÜZENLENEMEZ (provenance layer korunur).
 *  - Yalnız izinli alanlar yazılır: section_key, block_type, block_title, sort_order,
 *    editorial_explanation. Kaynak/provenance alanları (source_ , origin_ ,
 *    editorial_interpretation, expert_note, source_translation) KULLANICI
 *    mutasyonuyla YAZILAMAZ (verbatim provenance korunur).
 *  - section_key yalnız 8 canonical değerden biri; block_type yalnız görünür tiplerden biri.
 */

/** 8 canonical section (bioenergy_chakra_blocks.section_key CHECK ile birebir). */
export const CHAKRA_SECTION_KEYS = [
  "genel-bakis",
  "enerji-anatomisi",
  "nedenler-blokajlar",
  "beden-sistem",
  "duygusal-zihinsel",
  "uygulamalar",
  "taslar-destekleyiciler",
  "notlar-kaynaklar",
] as const;
export type ChakraSectionKey = (typeof CHAKRA_SECTION_KEYS)[number];

/** Kullanıcı editöründe seçilebilir GÖRÜNÜR block tipleri (source-evidence HARİÇ). */
export const VISIBLE_BLOCK_TYPES = [
  "overview",
  "state",
  "variation-summary",
  "claim-summary",
  "application",
  "supporter-note",
] as const;
export type VisibleBlockType = (typeof VISIBLE_BLOCK_TYPES)[number];

/** Gizli provenance tipi — kullanıcı mutasyonuyla ASLA oluşturulamaz. */
export const SOURCE_EVIDENCE_BLOCK_TYPE = "source-evidence";

/** Kullanıcı mutasyonunda yazılabilir alanlar (yalnız bunlar). */
export const USER_WRITABLE_BLOCK_FIELDS = [
  "section_key",
  "block_type",
  "block_title",
  "sort_order",
  "editorial_explanation",
] as const;

export type ChakraBlockWriteFields = {
  section_key?: string;
  block_type?: string;
  block_title?: string | null;
  sort_order?: number;
  editorial_explanation?: string | null;
};

export type ValidateResult =
  | { ok: true; fields: ChakraBlockWriteFields }
  | { ok: false; error: string; status: 400 };

function isPlainString(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * Kullanıcı body'sinden yalnız izinli visible-block alanlarını doğrular ve seçer.
 * mode="create": section_key + block_type + editorial_explanation zorunlu.
 * mode="update": verilen alanlar doğrulanır; hiçbiri zorunlu değil (kısmi güncelleme).
 * Her iki modda: source-evidence block_type ve gizli provenance alanları REDDEDİLİR.
 */
export function validateChakraBlockInput(
  body: Record<string, unknown>,
  mode: "create" | "update",
): ValidateResult {
  const out: ChakraBlockWriteFields = {};

  // Yasak alan enjeksiyonu: gizli provenance/kaynak alanları reddet (sessiz strip değil, açık hata)
  const FORBIDDEN = [
    "source_excerpt",
    "source_translation",
    "source_title",
    "source_author",
    "source_ref",
    "source_url",
    "tradition_frame",
    "editorial_interpretation",
    "expert_note",
    "origin_type",
    "origin_label",
    "origin_source_id",
    "origin_transfer_batch_id",
    "tenant_id",
    "chakra_id",
    "id",
  ];
  for (const f of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      return { ok: false, error: `'${f}' bu editörden değiştirilemez.`, status: 400 };
    }
  }

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  // section_key
  if (has("section_key") || mode === "create") {
    const sk = body["section_key"];
    if (!isPlainString(sk) || !(CHAKRA_SECTION_KEYS as readonly string[]).includes(sk)) {
      return { ok: false, error: "Geçersiz section_key.", status: 400 };
    }
    out.section_key = sk;
  }

  // block_type — yalnız görünür tipler; source-evidence yasak
  if (has("block_type") || mode === "create") {
    const bt = body["block_type"];
    if (bt === SOURCE_EVIDENCE_BLOCK_TYPE) {
      return { ok: false, error: "source-evidence bloğu bu editörden oluşturulamaz.", status: 400 };
    }
    if (!isPlainString(bt) || !(VISIBLE_BLOCK_TYPES as readonly string[]).includes(bt)) {
      return { ok: false, error: "Geçersiz block_type.", status: 400 };
    }
    out.block_type = bt;
  }

  // block_title — opsiyonel (null/boş kabul)
  if (has("block_title")) {
    const t = body["block_title"];
    if (t !== null && !isPlainString(t)) {
      return { ok: false, error: "Geçersiz block_title.", status: 400 };
    }
    const trimmed = t === null ? null : (t as string).trim();
    out.block_title = trimmed && trimmed.length > 0 ? trimmed.slice(0, 300) : null;
  }

  // sort_order — tamsayı
  if (has("sort_order")) {
    const s = body["sort_order"];
    if (typeof s !== "number" || !Number.isFinite(s) || !Number.isInteger(s) || s < 0 || s > 100000) {
      return { ok: false, error: "Geçersiz sort_order.", status: 400 };
    }
    out.sort_order = s;
  }

  // editorial_explanation — görünür içerik (create'te zorunlu, non-empty)
  if (has("editorial_explanation") || mode === "create") {
    const e = body["editorial_explanation"];
    if (!isPlainString(e)) {
      return { ok: false, error: "İçerik (editorial_explanation) gerekli.", status: 400 };
    }
    const trimmed = e.trim();
    if (mode === "create" && trimmed.length === 0) {
      return { ok: false, error: "İçerik boş olamaz.", status: 400 };
    }
    out.editorial_explanation = e; // metni AYNEN sakla (trim etme; içerik sözleşmesi)
  }

  return { ok: true, fields: out };
}

/** Reorder isteği: [{id, sort_order}] — deterministik, section-scoped renumber güvenli. */
export type ReorderItem = { id: string; sort_order: number };

export function validateReorderInput(body: Record<string, unknown>): { ok: true; items: ReorderItem[] } | { ok: false; error: string; status: 400 } {
  const items = body["items"];
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "items gerekli.", status: 400 };
  }
  if (items.length > 2000) {
    return { ok: false, error: "Çok fazla öğe.", status: 400 };
  }
  const out: ReorderItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it !== "object") return { ok: false, error: "Geçersiz reorder öğesi.", status: 400 };
    const id = (it as Record<string, unknown>)["id"];
    const so = (it as Record<string, unknown>)["sort_order"];
    if (!isPlainString(id) || id.trim().length === 0) return { ok: false, error: "Geçersiz reorder id.", status: 400 };
    if (typeof so !== "number" || !Number.isInteger(so) || so < 0 || so > 100000) {
      return { ok: false, error: "Geçersiz reorder sort_order.", status: 400 };
    }
    if (seen.has(id)) return { ok: false, error: "Tekrarlı reorder id.", status: 400 };
    seen.add(id);
    out.push({ id, sort_order: so });
  }
  return { ok: true, items: out };
}

/** Section içinde 10'ar aralıkla deterministik yeniden numaralandırma (reorder helper, UI tarafı). */
export function renumberSortOrders<T extends { id: string }>(orderedIds: T[], step = 10): ReorderItem[] {
  return orderedIds.map((x, i) => ({ id: x.id, sort_order: (i + 1) * step }));
}

/**
 * Silme cascade uyarısı için child breakdown (saf): total/evidence sayımlarından
 * güvenli visible = total - evidence üretir (negatif/ondalık/uyumsuz değerleri klampler).
 */
export function chakraChildBreakdown(total: number, evidence: number): { total: number; visible: number; evidence: number } {
  const t = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const ev = Math.min(t, Math.max(0, Math.floor(Number.isFinite(evidence) ? evidence : 0)));
  return { total: t, evidence: ev, visible: t - ev };
}
