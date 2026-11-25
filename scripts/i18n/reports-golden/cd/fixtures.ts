/**
 * I18N rapor golden (grup C+D) — SABİT, SENTETİK fikstürler (gerçek danışan/uzman verisi YOK; DB/ağ YOK).
 *
 * Üreticiler (RAPOR-CD): P16 Beslenme Word, P19 Aromaterapi Word (16 rota), P11–P15 Doğaltaş/Mineral/Kombinasyon/Bilgi,
 * P21 Refleksoloji, P22 Biyoenerji, P38–P40 Belge çeviri / Ders notu / Video Word.
 *
 * İki nöbetçi türü (EN belgede ikisi de AYNEN kalmalıdır; EN belgede kalan diğer Türkçe metin sistem sızıntısıdır):
 *   ⟦KULLANICI …⟧ — uzman/danışan girdisi (notlar, plan adı, kayıt adı).
 *   ⟦KATALOG …⟧   — DB'deki standart katalog/ansiklopedi içeriği (yağ/taş/mineral açıklaması). Bu içerik DB'de yalnız TR'dir;
 *                    EN karşılığı yoksa raporda TR kalır → üretici KISMİ (sistem metinleri EN, katalog içeriği TR) raporlanır.
 *
 * Çalışma kipleri (A+B ile aynı):
 *   base → bugünkü (parametresiz) çağrı: route'ta çerez YOK + yayın kapısı kapalı; lib'de `output` verilmez.
 *   tr   → açık Türkçe: route'ta kapı AÇIK + NEXT_LOCALE=tr; lib'de output = reportLocaleFor("tr").
 *   en   → kapı AÇIK + NEXT_LOCALE=en; lib'de output = reportLocaleFor("en").
 */
import { NextRequest } from "next/server";
import type { ReportLocale } from "@/lib/i18n/reportLocale";

export type Mode = "base" | "tr" | "en";
export type Built = { buffer: Buffer; filename: string | null };
export type Fixture = { name: string; producer: string; kind: "docx" | "pdf"; run: (mode: Mode) => Promise<Built> };

const U = (s: string) => `⟦KULLANICI ${s}⟧`;
const K = (s: string) => `⟦KATALOG ${s}⟧`;

const TENANT = "00000000-0000-4000-8000-0000000000cd";
const USER_ID = "00000000-0000-4000-8000-0000000000dc";
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ─── Sahte Supabase istemcisi (yalnız okuma; eq/in filtre + range sayfalama; diğer filtreler yok sayılır) ───
type Row = Record<string, unknown>;
export function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let range: [number, number] | null = null;
    let single = false;
    const b: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
              const data = range ? rows.slice(range[0], range[1] + 1) : rows;
              const out = single ? { data: data[0] ?? null, error: null } : { data, error: null, count: rows.length };
              return Promise.resolve(out).then(res, rej);
            };
          }
          if (prop === "eq") return (c: string, v: unknown) => { rows = rows.filter((r) => !(c in r) || r[c] === v); return b; };
          if (prop === "in") return (c: string, vs: unknown[]) => { rows = rows.filter((r) => !(c in r) || vs.includes(r[c])); return b; };
          if (prop === "range") return (f: number, t: number) => { range = [f, t]; return b; };
          if (prop === "single" || prop === "maybeSingle") return () => { single = true; return b; };
          return () => b;
        },
      },
    );
    return b;
  };
  return {
    from,
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: "yok" } }), createSignedUrl: async () => ({ data: null, error: { message: "yok" } }) }) },
  };
}

export function setGuard(tables: Record<string, Row[]>): void {
  (globalThis as Record<string, unknown>).__RAB_GUARD__ = {
    ok: true,
    db: fakeDb(tables),
    tenantId: TENANT,
    userId: USER_ID,
    email: "zz.rapor.cd@example.test",
    is_demo_account: false,
    profile: { full_name: U("uzman: Şükran Işıl Ağaoğlu"), name: U("uzman: Şükran Işıl Ağaoğlu") },
  };
}

export function withLocale<T>(mode: Mode, fn: (cookie: string | null) => Promise<T>): Promise<T> {
  const prev = process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
  process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = mode === "base" ? "off" : "on";
  const cookie = mode === "base" ? null : `NEXT_LOCALE=${mode}`;
  return fn(cookie).finally(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
    else process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = prev;
  });
}

type RouteMod = { POST: (r: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response> };
export async function callRoute(mod: RouteMod, url: string, body: unknown, cookie: string | null, params?: Record<string, string>, method: "POST" | "GET" = "POST"): Promise<Built> {
  const rl = await import("@/lib/security/rateLimit");
  rl.__resetRateLimitForTest();
  (await import("@/lib/rateLimit")).__resetRateLimitStore();
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (cookie) headers.cookie = cookie;
  const req = new NextRequest(`http://localhost${url}`, { method, headers, ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}) });
  const handler = (mod as unknown as Record<string, RouteMod["POST"]>)[method]!;
  const res = await handler(req, params ? { params: Promise.resolve(params) } : undefined);
  if (res.status !== 200) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]*)"?/.exec(cd);
  return { buffer: Buffer.from(await res.arrayBuffer()), filename: m ? decodeURIComponent(m[1]!) : null };
}

export async function rl(mode: Mode): Promise<ReportLocale | undefined> {
  if (mode === "base") return undefined;
  const { reportLocaleFor } = await import("@/lib/i18n/reportLocale");
  return reportLocaleFor(mode);
}

// ═══ P16 — Beslenme planı Word (saf kurucu; route yalnız dil çözümü + parametre) ═════════════════════
function nutr(kcal: number | null, p: number, c: number, f: number, fib: number) {
  return [
    ...(kcal == null ? [] : [{ nutrient_code: "energy", amount: kcal, unit_code: "kcal" }]),
    { nutrient_code: "protein", amount: p, unit_code: "g" },
    { nutrient_code: "carbohydrate", amount: c, unit_code: "g" },
    { nutrient_code: "total_fat", amount: f, unit_code: "g" },
    { nutrient_code: "fiber", amount: fib, unit_code: "g" },
  ];
}
function beslenmeTree(variant: "full" | "sparse"): Record<string, unknown> {
  if (variant === "sparse") {
    return {
      plan: { id: uid(1601), title: U("plan: Kısa Çağrı"), note: null, start_date: "2026-12-01", end_date: "2026-12-01", daily_energy_target: null, status: "draft", revision_number: null },
      recipientName: null,
      expertName: null,
      logo: null,
      branding: null,
      days: [{ id: uid(1611), plan_date: "2026-12-01", energy_target_override: null, note: null, meals: [] }],
    };
  }
  const item = (n: number, food: string, qty: number | null, portion: string | null, grams: number, nut: ReturnType<typeof nutr>) => ({
    id: uid(1700 + n), food_name_snapshot: food, quantity: qty, portion_label_snapshot: portion, grams, sort_order: n, nutrients: nut,
  });
  return {
    plan: { id: uid(1600), title: U("plan: Kış Dengesi İçin Öğün Planı"), note: U("not: Günde 2 litre su; ılık içecek."), start_date: "2026-11-30", end_date: "2026-12-02", daily_energy_target: 1850, status: "active", revision_number: 3 },
    recipientName: U("danışan: Ayşe Çiğdem Öztürk"),
    expertName: U("uzman: Şükran Işıl Ağaoğlu"),
    logo: null,
    branding: null,
    days: [
      {
        id: uid(1610), plan_date: "2026-11-30", energy_target_override: 2100.4, note: U("gün notu: Antrenman günü"),
        meals: [
          { id: uid(1620), meal_type: "breakfast", label: U("öğün: Kahvaltı"), sort_order: 1, items: [
            item(1, K("besin: Tam buğday ekmeği"), 1.5, "1 dilim", 52.5, nutr(247, 13, 41, 3.4, 7)),
            item(2, K("besin: Beyaz peynir"), 1, "1 porsiyon (30 g)", 30, nutr(310, 17.5, 1.5, 25.2, 0)),
            item(3, K("besin: Ceviz"), 2, "su bardağı", 1234.5, nutr(654, 15.2, 13.7, 65.2, 6.7)),
          ] },
          { id: uid(1621), meal_type: "lunch", label: U("öğün: Öğle"), sort_order: 2, items: [
            item(4, K("besin: Mercimek çorbası"), null, null, 250, nutr(null, 4.1, 9.8, 1.2, 2.1)),
          ] },
          { id: uid(1622), meal_type: "snack", label: "", sort_order: 3, items: [] },
        ],
      },
      { id: uid(1611), plan_date: "2026-12-01", energy_target_override: null, note: null, meals: [] },
      {
        id: uid(1612), plan_date: "2026-12-02", energy_target_override: null, note: null,
        meals: [
          { id: uid(1623), meal_type: "dinner", label: U("öğün: Akşam"), sort_order: 1, items: [
            item(5, K("besin: Izgara somon"), 1, "1 porsiyon", 180, nutr(208, 20, 0, 13, 0)),
          ] },
        ],
      },
    ],
  };
}
function beslenmeFixture(name: string, variant: "full" | "sparse"): Fixture {
  return {
    name, producer: "P16", kind: "docx",
    run: async (mode) => {
      const { buildPlanDocxFromTree } = await import("@/lib/beslenme/word/planDocxBuilder");
      const tree = beslenmeTree(variant);
      const output = await rl(mode);
      const res = await buildPlanDocxFromTree((output ? { ...tree, output } : tree) as never);
      if (!res.ok) throw new Error(`P16 ${name}: ${res.error.code}`);
      return { buffer: res.buffer, filename: res.filename };
    },
  };
}

// ═══ P19 — Aromaterapi Word (16 rota; route üzerinden) ═══════════════════════════════════════════════
function aroOil(n: number, over: Row): Row {
  return {
    id: uid(1900 + n), tenant_id: TENANT, name: K(`yağ ${n}`), latin_name: null, english_name: null,
    oil_type: "essential", category: null, extraction_method: null, plant_part: null, origin: null, shelf_life: null,
    aroma_profile: null, aroma_note: null, color: null, consistency: null, is_photosensitive: null, main_components: null,
    therapeutic_properties: null, emotional_benefits: null, spiritual_benefits: null, physical_benefits: null,
    skin_benefits: null, benefits: null, diffuser_usage: null, massage_usage: null, usage_methods: null, dilution_ratio: null,
    blends_well_with: null, target_systems: null, chakra_connection: null, element_connection: null, safety_notes: null,
    contraindications: null, notes: null, source: null, origin_type: null, origin_label: null, created_at: null, updated_at: null,
    is_active: true, ...over,
  };
}
const ARO_OILS: Row[] = [
  aroOil(1, {
    name: K("yağ: Bergamot Yağı"), latin_name: "Citrus bergamia", english_name: "Bergamot", oil_type: "essential",
    category: K("kategori: Narenciye"), origin: K("menşei: İtalya"), plant_part: K("kabuk"), extraction_method: K("soğuk sıkım"),
    shelf_life: K("12 ay"), aroma_note: K("üst nota"), color: K("yeşilimsi sarı"), consistency: K("akışkan"),
    aroma_profile: K("koku: Taze, narenciye"), main_components: K("Limonen,Linalil asetat"),
    therapeutic_properties: [K("antiseptik"), K("yatıştırıcı")], physical_benefits: K("sindirim"), emotional_benefits: K("ruh hâli"),
    spiritual_benefits: K("ruhsal"), skin_benefits: K("cilt"), benefits: K("genel"), diffuser_usage: K("3–5 damla"),
    massage_usage: K("masaj %1"), usage_methods: K("yöntemler"), dilution_ratio: K("%0,4"), blends_well_with: [K("Lavanta")],
    target_systems: [K("Sinir sistemi")], chakra_connection: K("Kalp"), element_connection: K("Ateş"),
    is_photosensitive: true, safety_notes: K("güvenlik: Güneşten kaçının."), contraindications: K("kontrendikasyon: Fototoksik."),
    notes: U("uzman notu: Akşam kullanımı."), source: K("kaynak: Tisserand 2014"), origin_type: "admin_transfer", origin_label: K("Yönetici aktarımı"),
  }),
  aroOil(2, { name: K("yağ: Jojoba Yağı"), latin_name: "Simmondsia chinensis", oil_type: "carrier", is_photosensitive: false, benefits: K("taşıyıcı") }),
  aroOil(3, { name: K("yağ: Kalendula Maserasyonu"), oil_type: "maceration" }),
  aroOil(4, { name: K("yağ: Gül Hidrosolü"), oil_type: "hydrosol", photosensitivity_status: "unknown" }),
  aroOil(5, { name: K("yağ: Mür Reçinesi"), oil_type: "resin" }),
  aroOil(6, { name: K("yağ: Yasemin Mutlak"), oil_type: "absolute" }),
];
const aroItem = (n: number, name: string, drops: number, photo: boolean, c = "", sn = "") => ({
  oil_id: uid(1950 + n), oil_name: name, latin_name: "Lavandula angustifolia", oil_type: "essential", drops, is_photosensitive: photo, contraindications: c, safety_notes: sn,
});
const ARO_BLENDS: Row[] = [
  {
    id: uid(1960), tenant_id: TENANT, name: U("karışım: Sakinleştirici Şişe"), notes: U("not: Yatmadan önce."), carrier_oil_id: uid(1902),
    carrier_oil_name: K("Jojoba"), carrier_photosensitivity_status: "yes", carrier_contraindications: K("taşıyıcı kontrendikasyon"), carrier_safety_notes: K("taşıyıcı güvenlik"),
    bottle_ml: 30, dilution_percent: 2, drops_per_ml: 20, total_drops: 12,
    items: [aroItem(1, K("Lavanta"), 6, false), aroItem(2, K("Bergamot"), 4, true, K("güneş"), K("cilt testi")), aroItem(3, K("Papatya"), 2, false)],
    is_active: true, created_at: "2026-10-03T08:00:00Z", updated_at: null,
  },
  {
    id: uid(1961), tenant_id: TENANT, name: U("karışım: Boş Uyarı"), notes: null, carrier_oil_id: null, carrier_oil_name: null,
    bottle_ml: 10, dilution_percent: 1, drops_per_ml: 20, total_drops: 2, items: [aroItem(4, K("Lavanta"), 2, false)],
    is_active: true, created_at: null, updated_at: null,
  },
];
const ARO_DATA = {
  taxa: [
    { id: uid(1970), canonical_name: K("Lavandula angustifolia"), genus: "Lavandula", species: "angustifolia", infraspecific_epithet: null, taxon_rank: "species", family: "Lamiaceae", author_citation: "Mill.", is_hybrid: true, status: "verified", primary_common_name_tr: K("Gerçek Lavanta") },
    { id: uid(1971), canonical_name: "", genus: "Salvia", species: null, family: null, author_citation: null, is_hybrid: false, status: "needs_verification", primary_common_name_tr: null },
  ],
  preparations: [
    { id: uid(1972), taxon_id: uid(1970), preparation_type: K("Uçucu Yağ"), plant_part: K("Çiçek başağı"), chemotype: "Linalool", status: "approved", taxon_canonical_name: K("Lavandula angustifolia"), knowledge_record_count: 2 },
    { id: uid(1973), taxon_id: null, preparation_type: "", plant_part: null, chemotype: null, status: "draft", taxon_canonical_name: null },
  ],
  methods: [
    {
      series: { id: uid(1974), method_kind: "faithful_source", method_lang: "tr", source_title: K("Ege Uçucu Yağ El Kitabı"), passage_locator: "s.42", revision_count: 2, verified_revision: 2, revisions: [{ revision: 1, status: "archived", updated_at: "2026-01-01" }, { revision: 2, status: "verified", updated_at: "2026-02-01T10:00:00Z" }] },
      content: { revision: 2, status: "verified", method_text: K("yöntem metni"), steps: [{ order: 1, text: K("adım bir") }, { order: 2, text: K("adım iki") }], plant_part_used: K("çiçek"), material_state: K("taze"), equipment: K("bakır imbik"), amount_ratio: K("1:10"), solvent_carrier: K("su"), duration_text: K("3 saat"), temperature_text: K("100 °C"), filtration: K("süzme"), resting: K("1 gün"), storage: K("koyu şişe"), quality_notes: K("berrak"), safety_notes: K("fotosensitif değil") },
      prepLabel: K("Lavanta Uçucu Yağı"),
    },
    { series: { id: uid(1975), method_kind: "expert", method_lang: null, source_title: K("Uzman defteri"), passage_locator: null, revision_count: 1, verified_revision: null, revisions: [] }, content: null, prepLabel: null },
    { series: { id: uid(1976), method_kind: "editorial", method_lang: null, source_title: null, passage_locator: null, revisions: [] }, content: null, prepLabel: null },
  ],
  knowledge: [
    {
      id: uid(1977), claim_type: "safety", safety_topic: K("hamilelik"), route: "topical", preparation_context: K("bağlam"), conclusion: K("sonuç metni"),
      conclusion_provenance: "source_original", evidence_layer: "traditional", outcome_type: "risk_suspected", rationale: K("gerekçe metni"), rationale_status: "from_source", status: "verified",
      preparation: { taxon_canonical_name: K("Salvia officinalis") },
      routes: [{ route_code: "topical" }, { route_code: "inhalation" }, { route_code: "zz_bilinmeyen_kod" }],
      populations: [{ population_code: "pregnancy", age_min: null, age_max: null }, { population_code: "children", age_min: 2, age_max: null }, { population_code: "elderly", age_min: 65, age_max: 90 }],
      sources: [{ source_id: uid(1980), source_title: K("Botanik Güvenlik Rehberi"), source_role: "primary_support", locator_text: "s.10", source_original_excerpt: K("özgün alıntı"), faithful_translation: K("sadık çeviri") }],
      passages: [{ passage_id: uid(1981), passage_locator_label: K("Bölüm 3"), passage_kind: "excerpt", evidence_relation: "supports" }],
      relations: [{ relation_type: "supports", explanation_tr: K("ilişki açıklaması") }],
    },
    { id: uid(1978), claim_type: "use", safety_topic: null, status: "under_review", preparation: null, routes: [], populations: [], sources: [], passages: [], relations: [] },
  ],
  sources: [
    {
      source: { id: uid(1980), title: K("Botanik Güvenlik Rehberi"), source_type: "book", status: "verified", authors: K("Yılmaz, A."), organization: K("Ege Üniversitesi Yayınları"), publication_year: 2020, doi: "10.1234/abc", pmid: "12345678", isbn: "978-0-00-000000-0", url: "https://example.com/kaynak", document_no: "DN-7", notes: K("kaynak notu") },
      passages: [{ id: uid(1981), source_id: uid(1980), locator_label: K("Bölüm 3"), passage_kind: "excerpt", original_text: K("orijinal metin"), translations: [{ target_lang: "tr", translated_text: K("çeviri metni") }], editorial_explanations: [{ note_text: K("editoryal açıklama") }], editorial_interpretations: [{ note_text: K("editoryal yorum") }] }],
    },
    { source: { id: uid(1982), title: "", source_type: "zz_other", status: "draft", authors: null, organization: null, publication_year: null, doi: null, url: null, notes: null }, passages: [] },
  ],
  glossary: [
    { id: uid(1983), canonical_term_tr: K("Fotosensitivite"), canonical_term_en: "Phototoxicity", short_definition_tr: K("kısa tanım"), professional_definition_tr: K("profesyonel tanım"), status: "verified" },
    { id: uid(1984), canonical_term_tr: "", canonical_term_en: null, short_definition_tr: null, professional_definition_tr: null, status: "archived" },
  ],
};
function aroTables(): Record<string, Row[]> {
  return { aromatherapy_oils: ARO_OILS, aromatherapy_blends: ARO_BLENDS, user_locale_prefs: [], expert_profiles: [] };
}
function aroFixture(name: string, route: string, body: unknown, params?: Record<string, string>): Fixture {
  return {
    name, producer: "P19", kind: "docx",
    run: (mode) =>
      withLocale(mode, async (cookie) => {
        setGuard(aroTables());
        (globalThis as Record<string, unknown>).__RCD_ARO__ = ARO_DATA;
        const mod = await import(`@/app/api/aromaterapi/${route}/route`);
        return callRoute(mod as RouteMod, `/api/aromaterapi/${route}`, body, cookie, params);
      }),
  };
}

export function allFixtures(): Fixture[] {
  return [
    beslenmeFixture("P16-plan-tam", "full"),
    beslenmeFixture("P16-plan-taslak-bos", "sparse"),
    aroFixture("P19-genel", "word-report", {}),
    aroFixture("P19-yaglar-tumu", "oils/word-report", { mode: "all" }),
    aroFixture("P19-yaglar-tip", "oils/word-report", { mode: "all", oilType: "carrier" }),
    aroFixture("P19-yaglar-secili", "oils/word-report", { mode: "selected", ids: [uid(1901), uid(1902)] }),
    aroFixture("P19-yag-tek", "oils/[id]/word-report", {}, { id: uid(1901) }),
    aroFixture("P19-karisimlar", "blends/word-report", { mode: "all" }),
    aroFixture("P19-karisimlar-secili", "blends/word-report", { mode: "selected", ids: [uid(1960), uid(1961)] }),
    aroFixture("P19-karisim-tek", "blends/[id]/word-report", {}, { id: uid(1960) }),
    aroFixture("P19-bitkiler", "plant-taxa/word-report", { mode: "all" }),
    aroFixture("P19-bitki-tek", "plant-taxa/[id]/word-report", {}, { id: uid(1970) }),
    aroFixture("P19-preparatlar", "preparations/word-report", { mode: "all" }),
    aroFixture("P19-preparat-tek", "preparations/[id]/word-report", {}, { id: uid(1972) }),
    aroFixture("P19-yontemler", "methods/word-report", { mode: "all" }),
    aroFixture("P19-yontem-tek", "methods/[seriesId]/word-report", {}, { seriesId: uid(1974) }),
    aroFixture("P19-bilgi", "claims/word-report", { mode: "all" }),
    aroFixture("P19-bilgi-tek", "claims/[id]/word-report", {}, { id: uid(1977) }),
    aroFixture("P19-kaynaklar", "sources/word-report", { mode: "selected", ids: [uid(1980), uid(1982)] }),
    aroFixture("P19-kaynak-tek", "sources/[id]/word-report", {}, { id: uid(1980) }),
    aroFixture("P19-sozluk", "glossary/word-report", { mode: "all" }),
  ];
}
