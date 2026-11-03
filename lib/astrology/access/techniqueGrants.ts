// Gökyüzü Atlası — TEKNİK BAZLI İZİN KATALOĞU (SAF; istemci ve sunucu aynı kararı kullanır).
//
// Kayıt: users.astrology_technique_grants (jsonb; migration 20271230000000). Biçim:
//   { "mode": "all" }                                  → katalogdaki (YAYIMLANMIŞ) bütün teknikler; ileride kataloğa eklenen
//                                                        teknikler de otomatik açılır (owner kararı 2026-11-03, madde 2).
//   { "mode": "list", "techniques": ["western.natal"] } → yalnız listelenen ve katalogda bulunan teknikler.
//   NULL / bozuk değer                                 → HİÇBİR teknik (fail-closed). Astroloji anahtarını açmak tek başına
//                                                        teknik açmaz; teknikler admin panelinden seçilip kaydedilir.
//
// YAYIM KURALI: bir teknik ancak bu kataloğa eklendiğinde (owner onayıyla) izin verilebilir hale gelir. Motor kaydına
// (lib/astrology/engine/techniques.ts TECHNIQUE_IDS) eklenip burada bulunmayan teknik HERKESE kapalıdır (owner hariç);
// "mode: all" uzmana da otomatik açılmaz. Statik test (scripts/astrology/technique-grants.harness.ts) iki listeyi eşler.
// Sunucu bayrağıyla kapalı özellikler (ör. Gökyüzü Araçları) izin verilse de bayrak açılana kadar kapalı kalır.

export type AstroGrantCategory = "western" | "vedic" | "kp" | "other";

export type AstroGrantItem = { key: string; label: string; category: AstroGrantCategory };

export const ASTRO_GRANT_CATEGORY_LABELS: Record<AstroGrantCategory, string> = {
  western: "BATI ASTROLOJİSİ",
  vedic: "VEDİK ASTROLOJİ",
  kp: "KP ASTROLOJİ",
  other: "DİĞER",
};

export const ASTRO_GRANT_CATEGORIES: readonly AstroGrantCategory[] = ["western", "vedic", "kp", "other"];

/** Yayımlanmış, izin verilebilir teknikler (sıra = panel ve Atlas sırası). */
export const ASTRO_GRANT_ITEMS: readonly AstroGrantItem[] = Object.freeze([
  { key: "western.natal", label: "Natal", category: "western" },
  { key: "western.transit", label: "Transit (tek an)", category: "western" },
  { key: "western.forecast", label: "Transit takvimi", category: "western" },
  { key: "western.transit_scan", label: "Transit Taraması", category: "western" },
  { key: "western.progression", label: "Secondary progression", category: "western" },
  { key: "western.solar_arc", label: "Solar arc", category: "western" },
  { key: "western.solar_return", label: "Solar return", category: "western" },
  { key: "western.lunar_return", label: "Lunar return", category: "western" },
  { key: "western.planetary_return", label: "Gezegen dönüşleri", category: "western" },
  { key: "western.synastry", label: "Sinastri", category: "western" },
  { key: "western.composite", label: "Composite", category: "western" },
  { key: "western.profections", label: "Yıllık Profeksiyonlar", category: "western" },
  { key: "western.classical_dignities", label: "Klasik Asalet ve Almuten", category: "western" },
  { key: "western.fixed_stars", label: "Sabit yıldızlar", category: "western" },
  { key: "western.extra_points", label: "Ek noktalar", category: "western" },
  { key: "western.declination_parallels", label: "Deklinasyon paralelleri", category: "western" },
  { key: "western.astrocartography", label: "Astrocartography", category: "western" },
  { key: "western.relocation", label: "Relocation", category: "western" },
  { key: "western.local_space", label: "Local Space", category: "western" },
  { key: "vedic.d1", label: "Vedik D1 (Rashi)", category: "vedic" },
  { key: "vedic.varga", label: "Vedik Varga (D9 Navamsa / Dn)", category: "vedic" },
  { key: "vedic.dasha", label: "Vimshottari Dasha", category: "vedic" },
  { key: "vedic.drishti", label: "Graha Drishti", category: "vedic" },
  { key: "vedic.ashtakavarga", label: "Ashtakavarga", category: "vedic" },
  { key: "vedic.shadbala", label: "Shadbala", category: "vedic" },
  { key: "vedic.panchanga", label: "Janma Panchanga", category: "vedic" },
  { key: "vedic.transit", label: "Gochara (Vedik transit)", category: "vedic" },
  { key: "vedic.bhav_chalit", label: "Bhav Chalit", category: "vedic" },
  { key: "vedic.chara_karaka", label: "Chara Karakalar", category: "vedic" },
  { key: "vedic.arudha", label: "Arudha Padalar", category: "vedic" },
  { key: "vedic.bhava_bala", label: "Bhava Bala", category: "vedic" },
  { key: "vedic.gun_milan", label: "Gun Milan (Ashtakoot)", category: "vedic" },
  { key: "vedic.dashakoot", label: "On Porutham (Dashakoot)", category: "vedic" },
  { key: "vedic.papasamyam", label: "Papasamyam", category: "vedic" },
  { key: "vedic.sade_sati", label: "Sade Sati", category: "vedic" },
  { key: "vedic.upagraha", label: "Upagrahalar", category: "vedic" },
  { key: "vedic.heliacal", label: "Graha Asta / Udaya", category: "vedic" },
  { key: "vedic.monthly", label: "Vedik aylık zamanlama", category: "vedic" },
  { key: "kp.chart", label: "KP doğum haritası", category: "kp" },
  { key: "kp.dasha", label: "KP dasha", category: "kp" },
  { key: "kp.ruling", label: "KP ruling planets", category: "kp" },
  { key: "kp.ruling_interval", label: "KP ruling planets zaman taraması", category: "kp" },
  { key: "kp.transit", label: "KP transit", category: "kp" },
  { key: "kp.horary", label: "KP horary (1–249)", category: "kp" },
  { key: "western.horary_lilly", label: "Batı Horary (William Lilly)", category: "other" },
  { key: "sky.ephemeris", label: "Efemeris", category: "other" },
  { key: "sky.lunations", label: "Ay Evreleri ve Tutulmalar", category: "other" },
  { key: "sky.degree_crossings", label: "Derece Geçişleri", category: "other" },
] as const satisfies readonly AstroGrantItem[]);

export const ASTRO_GRANT_KEYS: readonly string[] = Object.freeze(ASTRO_GRANT_ITEMS.map((i) => i.key));

const KEY_SET: ReadonlySet<string> = new Set(ASTRO_GRANT_KEYS);

/** Motor dışı uçların izin anahtarları (rotalar bu sabitleri kullanır). */
export const ASTRO_GRANT_HORARY_LILLY = "western.horary_lilly";
export const ASTRO_GRANT_SKY_EPHEMERIS = "sky.ephemeris";
export const ASTRO_GRANT_SKY_LUNATIONS = "sky.lunations";
export const ASTRO_GRANT_SKY_DEGREES = "sky.degree_crossings";

/** Tek kayıtta en çok teknik (DB fonksiyonu da aynı sınırı uygular). */
export const ASTRO_GRANT_MAX_TECHNIQUES = 64;

export function isAstroGrantKey(v: unknown): v is string {
  return typeof v === "string" && KEY_SET.has(v);
}

export type AstroTechniqueGrants = { mode: "all" } | { mode: "list"; techniques: string[] };

/**
 * DB değeri → izinli teknikler (katalog sırasıyla). NULL / bozuk / bilinmeyen biçim → boş (fail-closed).
 * "list" içindeki katalog dışı anahtarlar (ör. yayından kaldırılmış teknik) yok sayılır.
 */
export function resolveTechniqueGrants(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const r = raw as Record<string, unknown>;
  if (r.mode === "all") return [...ASTRO_GRANT_KEYS];
  if (r.mode !== "list" || !Array.isArray(r.techniques)) return [];
  const picked = new Set(r.techniques.filter((t): t is string => typeof t === "string"));
  return ASTRO_GRANT_KEYS.filter((k) => picked.has(k));
}

/** DB değerini panel için okur (bozuk → null = kayıt yok). */
export function readTechniqueGrants(raw: unknown): AstroTechniqueGrants | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.mode === "all") return { mode: "all" };
  if (r.mode === "list" && Array.isArray(r.techniques)) return { mode: "list", techniques: resolveTechniqueGrants(r) };
  return null;
}

export type TechniqueGrantsValidation = { ok: true; grants: AstroTechniqueGrants } | { ok: false; code: string; error: string };

/**
 * Admin kayıt isteği doğrulaması (sunucu). Yalnız iki biçim; liste katalog anahtarlarından oluşmalı, tekrar yok,
 * en az bir teknik (boş seçim AÇIK uyarıyla reddedilir). "Tümü" seçimi { mode: "all" } olarak saklanır.
 */
export function validateTechniqueGrants(raw: unknown): TechniqueGrantsValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "INVALID_GRANTS", error: "Teknik izinleri nesnesi gerekli." };
  const r = raw as Record<string, unknown>;
  if (r.mode === "all") {
    if (Object.keys(r).some((k) => k !== "mode")) return { ok: false, code: "INVALID_GRANTS", error: "Geçersiz teknik izinleri." };
    return { ok: true, grants: { mode: "all" } };
  }
  if (r.mode !== "list" || !Array.isArray(r.techniques) || Object.keys(r).some((k) => k !== "mode" && k !== "techniques")) {
    return { ok: false, code: "INVALID_GRANTS", error: "Geçersiz teknik izinleri." };
  }
  if (r.techniques.length === 0) return { ok: false, code: "EMPTY_SELECTION", error: "En az bir teknik seçmelisiniz." };
  if (r.techniques.length > ASTRO_GRANT_MAX_TECHNIQUES) return { ok: false, code: "INVALID_GRANTS", error: "Çok fazla teknik." };
  const seen = new Set<string>();
  for (const t of r.techniques) {
    if (!isAstroGrantKey(t)) return { ok: false, code: "UNKNOWN_TECHNIQUE", error: "Bilinmeyen teknik." };
    if (seen.has(t)) return { ok: false, code: "INVALID_GRANTS", error: "Aynı teknik birden çok kez seçilmiş." };
    seen.add(t);
  }
  return { ok: true, grants: { mode: "list", techniques: ASTRO_GRANT_KEYS.filter((k) => seen.has(k)) } };
}

/** Kategori kutusu durumu (panel): hiçbiri / bir kısmı / tamamı. */
export function categoryState(selected: ReadonlySet<string>, category: AstroGrantCategory): "none" | "some" | "all" {
  const keys = ASTRO_GRANT_ITEMS.filter((i) => i.category === category).map((i) => i.key);
  const n = keys.filter((k) => selected.has(k)).length;
  return n === 0 ? "none" : n === keys.length ? "all" : "some";
}
