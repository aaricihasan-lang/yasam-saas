// Doğaltaş Kütüphanesi · UZMAN YANITI FİLTRESİ (SAF; IO yok).
//
// Birinci kilit DB'dedir: uzman RPC'leri yalnız `stone_library_published` yüzeyini okur ve o yüzey gerçek kaynak
// kimliği / lisans / ham veri / iç kimlik İÇERMEYECEK biçimde üretilir. Bu dosya İKİNCİ kilittir:
//   1) Beyaz liste: yalnız sözleşmedeki alanlar yeniden kurulur (fazla anahtar sessizce düşer).
//   2) Sızıntı taraması: kurulmuş yanıtta yasak anahtar / desen bulunursa yanıt HİÇ gönderilmez (fail-closed).

import {
  STONE_LIBRARY_EXCERPT_CHARS,
  STONE_LIBRARY_EXCERPT_ELLIPSIS,
  STONE_LIBRARY_FIELDS,
  STONE_LIBRARY_KEYED_FACETS,
  STONE_LIBRARY_LANGS,
  STONE_LIBRARY_SEARCH_LIMITS,
  type StoneLibraryFacetCatalog,
  type StoneLibraryFacetValue,
  type StoneLibraryField,
  type StoneLibraryLang,
  type StoneLibraryListItem,
  type StoneLibrarySearchResult,
  type StoneLibraryStoneDoc,
} from "./contract";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_RE = /^[a-z0-9_]{1,60}$/;
const UUID_ANY_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Kaynak değeri (ad, anahtar kelime): sınırı aşarsa KIRPILMAZ, düşürülür (kod noktası sayımı; kısmi metin gösterilmez). */
const exact = (v: unknown, maxCodePoints: number): string | null =>
  typeof v === "string" && v.length > 0 && Array.from(v).length <= maxCodePoints ? v : null;

export function isStoneLibrarySlug(v: unknown): v is string {
  return typeof v === "string" && v.length <= 80 && SLUG_RE.test(v);
}

// ── İstek ayrıştırma ───────────────────────────────────────────────────────────────────────────
export type StoneLibrarySearchRequest = {
  query: string;
  filters: Record<string, unknown>;
  limit: number;
  offset: number;
};

function listParam(sp: URLSearchParams, name: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const raw of sp.getAll(name)) {
    for (const part of raw.split(",")) {
      const v = part.trim().toLowerCase();
      if (v && re.test(v) && !out.includes(v)) out.push(v);
      if (out.length >= STONE_LIBRARY_SEARCH_LIMITS.filterValuesMax) return out;
    }
  }
  return out;
}

/** URL parametreleri → RPC girdisi (yalnız bilinen filtreler; doğrulanmamış değer RPC'ye gitmez). */
export function parseStoneLibrarySearch(sp: URLSearchParams): StoneLibrarySearchRequest {
  const query = (sp.get("q") ?? "").slice(0, STONE_LIBRARY_SEARCH_LIMITS.queryMax);
  const filters: Record<string, unknown> = {};
  for (const facet of STONE_LIBRARY_KEYED_FACETS) {
    const v = listParam(sp, facet, KEY_RE);
    if (v.length) filters[facet] = v;
  }
  const keywords = sp
    .getAll("keyword")
    .flatMap((x) => x.split(","))
    .map((x) => x.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, STONE_LIBRARY_SEARCH_LIMITS.filterValuesMax);
  if (keywords.length) filters.keyword = keywords;
  const pairs = listParam(sp, "pairs_with", SLUG_RE);
  if (pairs.length) filters.pairs_with = pairs;
  const months = listParam(sp, "birth_month", /^(1[0-2]|[1-9])$/);
  if (months.length) filters.birth_month = months;
  for (const k of ["hardness_min", "hardness_max"] as const) {
    const v = sp.get(k);
    if (v && /^[0-9]{1,2}(\.[0-9]{1,2})?$/.test(v)) filters[k] = v;
  }
  const lim = Number.parseInt(sp.get("limit") ?? "", 10);
  const off = Number.parseInt(sp.get("offset") ?? "", 10);
  return {
    query,
    filters,
    limit: Number.isFinite(lim) ? Math.min(Math.max(lim, 1), STONE_LIBRARY_SEARCH_LIMITS.pageMax) : STONE_LIBRARY_SEARCH_LIMITS.pageDefault,
    offset: Number.isFinite(off) ? Math.min(Math.max(off, 0), STONE_LIBRARY_SEARCH_LIMITS.offsetMax) : 0,
  };
}

// ── Beyaz liste yeniden kurma ──────────────────────────────────────────────────────────────────
function facetValues(v: unknown): StoneLibraryFacetValue[] {
  if (!Array.isArray(v)) return [];
  const out: StoneLibraryFacetValue[] = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const key = str(x.key, 60);
    const tr = str(x.label_tr, 80);
    const en = str(x.label_en, 80);
    if (key && KEY_RE.test(key) && tr && en) out.push({ key, label_tr: tr, label_en: en });
  }
  return out.sort((a, b) => a.label_tr.localeCompare(b.label_tr, "tr"));
}

/**
 * Arama önizlemesi: kaynak metnin ilk 240 KARAKTERİ (kod noktası; Postgres left() ile aynı sayım) + kesildiyse "…".
 * Yalnız arama listesi içindir; taş ayrıntısında metnin tamamı karakteri karakterine gösterilir.
 */
export function buildStoneLibraryExcerpt(text: unknown, truncated: unknown): string | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const cps = Array.from(text);
  const cut = cps.length > STONE_LIBRARY_EXCERPT_CHARS;
  const base = cut ? cps.slice(0, STONE_LIBRARY_EXCERPT_CHARS).join("") : text;
  return truncated === true || cut ? `${base}${STONE_LIBRARY_EXCERPT_ELLIPSIS}` : base;
}

function listItem(v: unknown): StoneLibraryListItem | null {
  if (!isObj(v)) return null;
  const slug = v.slug;
  const nameTr = exact(v.name_tr, 120);
  if (!isStoneLibrarySlug(slug) || !nameTr) return null;
  const f = isObj(v.facets) ? v.facets : {};
  const facets: StoneLibraryListItem["facets"] = {};
  for (const k of ["chakra", "zodiac", "element", "color"] as const) {
    const vals = facetValues(f[k]);
    if (vals.length) facets[k] = vals;
  }
  return {
    slug,
    name_tr: nameTr,
    name_en: exact(v.name_en, 120),
    has_image: v.has_image === true,
    facets,
    excerpt: buildStoneLibraryExcerpt(v.excerpt, v.excerpt_truncated),
    excerpt_attribution: str(v.excerpt_attribution, 500),
  };
}

export function toExpertSearchResult(raw: unknown): StoneLibrarySearchResult | null {
  if (!isObj(raw)) return null;
  const items = Array.isArray(raw.items) ? raw.items.map(listItem).filter((x): x is StoneLibraryListItem => x !== null) : [];
  return {
    total: Math.max(0, Math.trunc(num(raw.total) ?? 0)),
    limit: Math.max(0, Math.trunc(num(raw.limit) ?? 0)),
    offset: Math.max(0, Math.trunc(num(raw.offset) ?? 0)),
    items,
  };
}

const FIELD_SET: ReadonlySet<string> = new Set(STONE_LIBRARY_FIELDS);
const LANG_SET: ReadonlySet<string> = new Set(STONE_LIBRARY_LANGS);

export function toExpertStoneDoc(raw: unknown): StoneLibraryStoneDoc | null {
  if (!isObj(raw)) return null;
  const slug = raw.slug;
  const nameTr = exact(raw.name_tr, 120);
  if (!isStoneLibrarySlug(slug) || !nameTr) return null;
  const f = isObj(raw.facets) ? raw.facets : {};
  const facets: StoneLibraryStoneDoc["facets"] = {};
  for (const k of STONE_LIBRARY_KEYED_FACETS) {
    const vals = facetValues(f[k]);
    if (vals.length) facets[k] = vals;
  }
  if (Array.isArray(f.keyword)) {
    const kw = f.keyword
      .filter(isObj)
      .map((x) => ({ lang: str(x.lang, 5), text: exact(x.text, 200) }))
      .filter((x): x is { lang: string; text: string } => !!x.lang && LANG_SET.has(x.lang) && !!x.text);
    if (kw.length) facets.keyword = kw;
  }
  for (const k of ["birth_month", "numerical_vibration"] as const) {
    if (Array.isArray(f[k])) {
      const vals = (f[k] as unknown[]).map(num).filter((x): x is number => x !== null);
      if (vals.length) facets[k] = [...new Set(vals)].sort((a, b) => a - b);
    }
  }
  const h = isObj(raw.hardness) ? raw.hardness : null;
  const hMin = h ? num(h.min) : null;
  const hMax = h ? num(h.max) : null;
  const pairings = Array.isArray(raw.pairings)
    ? raw.pairings
        .filter(isObj)
        .map((p) => ({ slug: p.slug, name_tr: exact(p.name_tr, 120), name_en: exact(p.name_en, 120) }))
        .filter((p): p is { slug: string; name_tr: string; name_en: string | null } => isStoneLibrarySlug(p.slug) && !!p.name_tr)
    : [];
  const sections = Array.isArray(raw.sections)
    ? raw.sections.filter(isObj).map((s, i) => ({
        key: `s${i + 1}`,
        label: str(s.label, 120),
        attribution: str(s.attribution, 500),
        fields: (Array.isArray(s.fields) ? s.fields : [])
          .filter(isObj)
          .map((x) => ({ field: x.field, lang: x.lang, content: typeof x.content === "string" ? x.content : "", health_related: x.health_related === true }))
          .filter(
            (x): x is { field: StoneLibraryField; lang: StoneLibraryLang; content: string; health_related: boolean } =>
              typeof x.field === "string" && FIELD_SET.has(x.field) && typeof x.lang === "string" && LANG_SET.has(x.lang) && x.content.length > 0,
          ),
      }))
    : [];
  const hn = isObj(raw.health_notice) ? raw.health_notice : {};
  const mn = isObj(raw.medical_notice) ? raw.medical_notice : {};
  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases
        .filter(isObj)
        .map((a) => ({ lang: str(a.lang, 8), name: str(a.name, 120) }))
        .filter((a): a is { lang: string; name: string } => !!a.lang && !!a.name)
    : [];
  const im = isObj(raw.image) ? raw.image : null;
  const imW = im ? num(im.width) : null;
  const imH = im ? num(im.height) : null;
  return {
    slug,
    name_tr: nameTr,
    name_en: exact(raw.name_en, 120),
    image: im && im.available === true && imW !== null && imH !== null ? { available: true, width: imW, height: imH, attribution: str(im.attribution, 500) } : null,
    aliases,
    facets,
    hardness: hMin !== null && hMax !== null ? { min: hMin, max: hMax } : null,
    pairings,
    sections: sections.filter((s) => s.fields.length > 0),
    health_notice: { tr: str(hn.tr, 1000) ?? "", en: str(hn.en, 1000) ?? "" },
    medical_notice: { tr: str(mn.tr, 1000) ?? "", en: str(mn.en, 1000) ?? "" },
    has_health_content: raw.has_health_content === true,
    updated_at: str(raw.updated_at, 40) ?? "",
  };
}

// ── Filtre kataloğu (F3) ───────────────────────────────────────────────────────────────────────
export function toExpertFacetCatalog(raw: unknown): StoneLibraryFacetCatalog | null {
  if (!isObj(raw)) return null;
  const f = isObj(raw.facets) ? raw.facets : {};
  const facets: StoneLibraryFacetCatalog["facets"] = {};
  for (const k of STONE_LIBRARY_KEYED_FACETS) {
    if (!Array.isArray(f[k])) continue;
    const vals = (f[k] as unknown[])
      .filter(isObj)
      .map((x) => ({ key: str(x.key, 60), label_tr: str(x.label_tr, 80), label_en: str(x.label_en, 80), count: num(x.count) }))
      .filter((x): x is StoneLibraryFacetValue & { count: number } =>
        !!x.key && KEY_RE.test(x.key) && !!x.label_tr && !!x.label_en && x.count !== null && x.count > 0);
    if (vals.length) facets[k] = vals;
  }
  const months = Array.isArray(raw.birth_month)
    ? raw.birth_month.filter(isObj).map((x) => ({ value: num(x.value), count: num(x.count) }))
        .filter((x): x is { value: number; count: number } => x.value !== null && Number.isInteger(x.value) && x.value >= 1 && x.value <= 12 && x.count !== null && x.count > 0)
    : [];
  const h = isObj(raw.hardness) ? raw.hardness : null;
  const hMin = h ? num(h.min) : null;
  const hMax = h ? num(h.max) : null;
  return {
    total: Math.max(0, Math.trunc(num(raw.total) ?? 0)),
    facets,
    birth_month: months,
    hardness: hMin !== null && hMax !== null ? { min: hMin, max: hMax } : null,
  };
}

// ── Sızıntı taraması (fail-closed) ─────────────────────────────────────────────────────────────
/** Uzman yanıtında ASLA bulunmaması gereken anahtarlar (iç yönetim / lisans / ham veri / kota). */
export const STONE_LIBRARY_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "id", "stone_id", "source_id", "source_key", "real_name", "provider_code", "display_mode", "display_alias",
  "license_type", "license_ref", "license_terms_url", "license_terms_sha256", "license_valid_until", "commercial_use_ok",
  "image_rights", "notes", "raw", "raw_id", "payload", "payload_sha256", "batch_id", "endpoint", "http_status",
  "quota", "quota_limit", "quota_remaining_before", "quota_remaining_after", "credit_cap", "calls_used", "api_key",
  "external_id", "pair_external_id", "content_sha256", "review_state", "visibility", "health_sensitive",
  "legal_ref", "legal_cleared_by", "created_by", "reviewed_by", "deleted_at", "delete_op_id", "image_url", "imageUrl",
  // F3: owner karar / mod alanları uzmana gitmez
  "legal_cleared_at", "legal_review_ref", "owner_decision_ref", "health_publication_mode", "health_publish_decided_at",
  "health_publish_decided_by", "health_publish_note", "quality_flags", "status", "source_url", "storage_path", "storage_bucket",
]);

/**
 * Değerlerde yasak desenler: sağlayıcı adı / alan adı / API yolu / anahtar biçimi / iç uuid.
 * Sağlayıcı adı KELİME BAŞINDA aranır ("RoxyAPI", "roxyapi.com") → mineral metinlerindeki "hydroxyl", "proxy",
 * "peroxyde" gibi masum kelimeler yanıtı düşürmez.
 */
const FORBIDDEN_VALUE_PATTERNS: readonly RegExp[] = [/\broxy/i, /\/api\/v\d/i, /\bx-api-key\b/i, /\bapi[_-]key\b/i, UUID_ANY_RE];

export type StoneLibraryLeak = { path: string; reason: string };

/**
 * Yanıt nesnesini (owner'ın görünür kıldığı kaynak etiketleri HARİÇ) tarar. `allowedLabels`: o yanıtta meşru
 * olarak gösterilen etiket/atıf metinleri (owner "gerçek adı göster" seçtiyse ad burada geçer).
 */
export function findStoneLibraryLeaks(value: unknown, allowedLabels: ReadonlySet<string> = new Set(), path = "$"): StoneLibraryLeak[] {
  const out: StoneLibraryLeak[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...findStoneLibraryLeaks(v, allowedLabels, `${path}[${i}]`)));
  } else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (STONE_LIBRARY_FORBIDDEN_KEYS.has(k)) out.push({ path: `${path}.${k}`, reason: "forbidden_key" });
      out.push(...findStoneLibraryLeaks(v, allowedLabels, `${path}.${k}`));
    }
  } else if (typeof value === "string") {
    if (!allowedLabels.has(value)) {
      for (const re of FORBIDDEN_VALUE_PATTERNS) {
        if (re.test(value)) {
          out.push({ path, reason: `forbidden_value:${re.source}` });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Arama sonucu: sızıntı içeren öğe tek başına düşürülür (sayfanın geri kalanı servis edilir); düşen öğeler
 * içerik OLMADAN (yalnız yol + neden) döner ki route sunucu log'una yazabilsin.
 */
export function dropLeakingItems(result: StoneLibrarySearchResult): { result: StoneLibrarySearchResult; dropped: StoneLibraryLeak[] } {
  const dropped: StoneLibraryLeak[] = [];
  const items = result.items.filter((item, i) => {
    const allowed = new Set<string>(item.excerpt_attribution ? [item.excerpt_attribution] : []);
    const leaks = findStoneLibraryLeaks(item, allowed, `$.items[${i}]`);
    dropped.push(...leaks);
    return leaks.length === 0;
  });
  return { result: { ...result, items }, dropped };
}

export function stoneDocAllowedLabels(doc: StoneLibraryStoneDoc): Set<string> {
  const s = new Set<string>();
  for (const sec of doc.sections) {
    if (sec.label) s.add(sec.label);
    if (sec.attribution) s.add(sec.attribution);
  }
  if (doc.image?.attribution) s.add(doc.image.attribution);
  return s;
}
