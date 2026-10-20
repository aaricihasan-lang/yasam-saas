/**
 * ASTROLOJİ AŞAMA 8 — Word / PDF raporları.
 *
 * Analizler GERÇEK akışla üretilir (profil → motor → not / Bilgi Bankası → kayıtlı analiz) ve sağlayıcı
 * yanıtı olarak depodaki golden kayıtları kullanılır (ağ YOK, gerçek Roxy YOK). Raporlar GERÇEK route
 * handler'larıyla (admin + uzman yüzeyi; gerçek requireAstrologyAccess / requireModuleAccess) indirilir;
 * üretilen .docx JSZip ile, .pdf unpdf ile BAĞIMSIZ açılıp içerikleri denetlenir.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/report8.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { NextRequest } from "next/server";
import { createFakeClient, createStore, installFetchShim, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { previewProfileDeletion, deleteProfiles } from "@/lib/astrology/clients/deletion";
import { buildAstroReport, reportTexts, asciiSlug, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { buildWheelSvg, WHEEL_BODY_ABBR, WHEEL_FONT_STACK } from "@/lib/astrology/report/wheelSvg";
import { fontKeyOf, isRenderable } from "@/lib/astrology/report/symbolFonts";
import { kundliMarkup, renderFigurePng, renderFigureSvg } from "@/lib/astrology/report/figurePng";
import { kundliLocalizedTree } from "@/lib/astrology/report/figures";
import { SIGN_IDS as SIGN_ORDER } from "@/lib/astrology/model/western";
import { Resvg } from "@resvg/resvg-js";
import { renderWheelPng } from "@/lib/astrology/report/chartPng";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { __resetRateLimitStore } from "@/lib/rateLimit";
import { COMBINED_REPORT_MAX_BYTES, combinedReportTooLarge } from "@/lib/astrology/report/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const SUPA = "http://astro-fake.local";
const ROXY_BASE = "https://roxy-fake.local/api/v2";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ROXY_API_KEY = "test-roxy-key-report8";
process.env.ROXY_API_BASE_URL = ROXY_BASE;
process.env.ASTROLOGY_MODULE_ENABLED = "true";
process.env.RATE_LIMIT_SECRET = "fake-rl-secret";

const ROOT = join(__dirname, "..", "..");
const DIR = join(__dirname, "fixtures", "golden");
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const GOLDEN: { name: string; endpoint: string; body: J; query?: Record<string, string> | null; response: J }[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }));

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    process.stderr.write(`FAIL ${name}\n     ${(e as Error).stack?.split("\n").slice(0, 3).join("\n     ")}\n`);
  }
}

const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_X = "c8c80001-0000-4000-8000-0000000000aa";
const CLIENT_Y = "c8c80002-0000-4000-8000-0000000000bb";
const U = {
  owner: "e8e8e8e8-0000-4000-8000-000000000001",
  exAI: "e8e8e8e8-0000-4000-8000-000000000002", // astrology + yorum
  exA: "e8e8e8e8-0000-4000-8000-000000000003", // yalnız astrology (aynı tenant, başka uzman)
  exB: "e8e8e8e8-0000-4000-8000-000000000004", // başka tenant
  exNone: "e8e8e8e8-0000-4000-8000-000000000005",
};
type Who = keyof typeof U | "anon";
const tok = (w: keyof typeof U) => `tok-report8-${w}-xxxxxxxxxxxxxx`;
const expert = (id: string, tenant: string, perms: Record<string, unknown>) => ({
  id, role: "expert", active: true, approval_status: "approved", package_type: "premium", is_super_admin: false, is_demo_account: false,
  tenant_id: tenant, email: `${id.slice(-2)}@sentetik.test`, module_permissions: perms,
});
const store: FakeStore = createStore({
  users: [
    { id: U.owner, role: "admin", active: true, approval_status: "approved", is_super_admin: true, is_demo_account: false, tenant_id: TA, email: "owner@sentetik.test", module_permissions: {} },
    expert(U.exAI, TA, { astrology: true, astrology_provider_interp: true }),
    expert(U.exA, TA, { astrology: true }),
    expert(U.exB, TB, { astrology: true, astrology_provider_interp: true }),
    expert(U.exNone, TA, {}),
  ],
  clients: [
    { id: CLIENT_X, tenant_id: TA, ad: "Şükrü Çağrı", soyad: "Işıkgöz", dogum: "1990-07-15", created_at: "2026-01-01T00:00:00Z" },
    { id: CLIENT_Y, tenant_id: TA, ad: "İnci", soyad: "Öğüt", dogum: "1988-03-21", created_at: "2026-01-01T00:00:00Z" },
  ],
});
for (const w of Object.keys(U) as (keyof typeof U)[]) store.sessions.set(tok(w), U[w]);
const setPerms = (id: string, perms: Record<string, unknown>) => {
  store.tables.users.find((u) => u.id === id)!.module_permissions = perms;
};

// Rota içindeki her ağ isteği sahte PostgREST'e gider; Roxy'ye giden olursa sayılır (beklenen: 0).
let roxyFetchHits = 0;
const restore = installFetchShim({
  store,
  supabaseUrl: SUPA,
  roxyBase: ROXY_BASE,
  roxy: () => {
    roxyFetchHits += 1;
    return new Response("{}", { status: 500 });
  },
});

// ─── Sahte sağlayıcı: golden kayıtlar (endpoint + gövde eşleşmesi) ───────────────────────────────
const providerCalls: { endpoint: string; body: J }[] = [];
const score = (a: J, b: J) => Object.keys(b ?? {}).filter((k) => JSON.stringify(a?.[k]) === JSON.stringify(b[k])).length;
const deps: EngineDeps = {
  config: { apiKey: "k-test-8", baseUrl: ROXY_BASE },
  callProvider: async (_c, endpoint, body, o) => {
    providerCalls.push({ endpoint, body });
    if (endpoint === "/astrology/natal-chart") return { ok: true, raw: structuredClone(NATAL), attempts: 1 };
    // Sorgu parametresi olan golden'lar (ör. fixed-stars orb=3 / orb=1) yalnız AYNI sorguyla eşleşir.
    const cands = GOLDEN.filter((g) => g.endpoint === endpoint && (!g.query || JSON.stringify(g.query) === JSON.stringify(o?.query ?? null)));
    if (!cands.length) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
    const best = cands.sort((x, y) => score(body, y.body) - score(body, x.body))[0];
    const r = structuredClone(best.response);
    if (endpoint === "/forecast/transits") {
      const s = String(body.startDate);
      const e = String(body.endDate);
      r.events = (r.events as J[]).filter((x) => x.date >= s && x.date <= e);
      r.period = { ...(r.period ?? {}), start: s, end: e };
    }
    return { ok: true, raw: r, attempts: 1 };
  },
  rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  log: () => undefined,
  now: () => new Date("2026-10-07T09:41:00Z"),
};

const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const ANKARA: ResolvedLocation = { id: "tr-06-ankara", label: "Ankara, Türkiye", timezone: "Europe/Istanbul", latitude: 39.9334, longitude: 32.8597 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : id === ANKARA.id ? ANKARA : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const ctxFor = (userId: string, tenantId = TA, ent = FULL): EngineCtx => ({ db: createFakeClient(store), tenantId, userId, entitlements: ent });

async function mkProfile(ctx: EngineCtx, who: "A" | "B", over: Record<string, unknown> = {}): Promise<string> {
  const base =
    who === "A"
      ? { label: "Şükrü Çağrı (natal)", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }
      : { label: "İnci Öğüt", clientId: CLIENT_Y, birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: ANKARA.id };
  const r = await createAstroProfile(ctx, { ...base, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}

/** Golden gövdeleriyle aynı seçenekler (her tekniğin birimi golden kayıtla eşleşir). */
function selection(id: string, partner?: string): { technique: string; options: Record<string, unknown> } {
  const AT = "2026-10-07T09:00";
  switch (id) {
    case "western.natal":
      return { technique: id, options: { houseSystem: "placidus", nodeType: "true" } };
    case "western.transit":
      return { technique: id, options: { atUtc: AT, nodeType: "true" } };
    case "western.forecast":
      return { technique: id, options: { startDate: "2026-10-01", days: 90 } };
    case "western.progression":
    case "western.solar_arc":
      return { technique: id, options: { targetDate: "2026-10-07", nodeType: "true" } };
    case "western.solar_return":
      return { technique: id, options: { returnYear: 2026, houseSystem: "placidus" } };
    case "western.lunar_return":
      return { technique: id, options: { month: "2026-10", houseSystem: "placidus" } };
    case "western.synastry":
    case "western.composite":
      return { technique: id, options: { partnerProfileId: partner, houseSystem: "placidus", nodeType: "true" } };
    case "western.astrocartography":
      return { technique: id, options: {} };
    case "western.relocation":
      return { technique: id, options: { targetLocationId: "us-ny-new-york", houseSystem: "placidus" } };
    case "western.local_space":
      return { technique: id, options: { referenceLocationId: null } };
    case "western.fixed_stars":
      return { technique: id, options: { nodeType: "true", orb: 1, reportCatalog: true } };
    case "vedic.varga":
      return { technique: id, options: { division: 9 } };
    case "vedic.transit":
      return { technique: id, options: { atUtc: AT } };
    case "kp.chart":
      return { technique: id, options: { ayanamsa: "kp-newcomb", nodeType: "mean" } };
    case "kp.dasha":
      return { technique: id, options: { ayanamsa: "kp-newcomb", nodeType: "mean" } };
    case "kp.ruling":
      return { technique: id, options: { atUtc: AT, nodeType: "mean" } };
    case "kp.transit":
      return { technique: id, options: { atUtc: AT, ayanamsa: "kp-newcomb", nodeType: "mean" } };
    case "kp.horary":
      return { technique: id, options: { atUtc: AT, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean" } };
    default:
      return { technique: id, options: {} };
  }
}

const TECHNIQUES = [
  "western.natal", "western.transit", "western.forecast", "western.progression", "western.solar_arc", "western.solar_return", "western.lunar_return",
  "western.synastry", "western.composite", "western.astrocartography", "western.relocation", "western.local_space", "western.fixed_stars",
  "vedic.d1", "vedic.varga", "vedic.dasha", "vedic.drishti", "vedic.ashtakavarga", "vedic.shadbala", "vedic.panchanga", "vedic.transit",
  "kp.chart", "kp.dasha", "kp.ruling", "kp.transit", "kp.horary",
] as const;

const TR_SAMPLE = "Türkçe denetim: ğüşıöç İĞŞÜÖÇ — Işıl Çağrı'nın değerlendirmesi.";
const LONG_NOTE = Array.from({ length: 40 }, (_, i) => `${i + 1}. paragraf — ${TR_SAMPLE} Uzun not satırı; ılık, şüpheli, göğüs, ağır işçilik.`).join("\n\n");
const FORBIDDEN = /undefined|\[object Object\]|\bNaN\b|\bnull\b/;

function req(surface: "expert" | "admin", path: string, who: Who, ua?: string): NextRequest {
  const base = surface === "admin" ? "/api/admin/astroloji" : "/api/astroloji";
  const h: Record<string, string> = who === "anon" ? {} : { [surface === "admin" ? "x-admin-id" : "x-user-id"]: U[who], "x-session-token": tok(who) };
  if (ua) h["user-agent"] = ua;
  return new NextRequest(`http://localhost${base}${path}`, { method: "GET", headers: h });
}
async function docxText(buf: Buffer): Promise<{ xml: string; text: string; media: string[] }> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return { xml, text, media: Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/")) };
}
async function pdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text: text as string, pages: totalPages };
}
const norm = (s: string) => s.replace(/\s+/g, " ");

async function main() {
  const R = {
    admin: await import("@/app/api/admin/astroloji/analyses/[id]/report/route"),
    expert: await import("@/app/api/astroloji/analyses/[id]/report/route"),
  };
  let resetRl = true;
  const get = async (surface: "expert" | "admin", id: string, who: Who, format: string, extra = "", ua?: string) => {
    if (resetRl) __resetRateLimitStore();
    const res = await (surface === "admin" ? R.admin : R.expert).GET(req(surface, `/analyses/${id}/report?format=${format}${extra}`, who, ua), { params: Promise.resolve({ id }) });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, buf, json: () => JSON.parse(buf.toString("utf8")) };
  };

  // ── Kurulum: exAI uzmanının tüm teknikleri (yorum dahil), not + Bilgi Bankası ─────────────────────
  const ctx = ctxFor(U.exAI);
  const pa = await mkProfile(ctx, "A");
  const pb = await mkProfile(ctx, "B");
  await createKb(ctx, { tradition: "western", topicKey: "planet_in_sign:sun:cancer", title: "Yengeç Güneşi (Bilgi Bankam)", body: `KB gövdesi — ${TR_SAMPLE}`, sourceNote: "Uzmanın kendi kaynağı" });
  await createKb(ctx, { tradition: "vedic", topicKey: "graha_in_rashi:sun:gemini", title: "Vedik Güneş (Bilgi Bankam)", body: "Vedik KB gövdesi" });
  const saved = new Map<string, string>();
  const failures: string[] = [];
  for (const id of TECHNIQUES) {
    const sel = selection(id, pb);
    const run = await runAstrology(ctx, { profileId: pa, selections: [sel] }, deps, { ownerPreviewHideInterp: false });
    if (run.status !== 200) {
      failures.push(`${id}: run ${run.status} ${JSON.stringify(run.body).slice(0, 200)}`);
      continue;
    }
    if (id === "western.natal") {
      const n = await saveExpertNote(ctx, { profileId: pa, technique: id, sectionKey: "overall", body: LONG_NOTE, expectedRevision: null });
      assert.equal(n.status, 201, JSON.stringify(n.body));
    }
    let sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    if (sv.status === 409 && (sv.body as J).code === "PROVIDER_INTERP_UNAVAILABLE") sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    if (sv.status !== 201) {
      failures.push(`${id}: save ${sv.status} ${JSON.stringify(sv.body).slice(0, 200)}`);
      continue;
    }
    saved.set(id, (sv.body as J).analysisId);
  }
  const providerCallsAfterSetup = providerCalls.length;

  await t("kurulum: 25 tekniğin TÜMÜ gerçek akışla (golden yanıt, ağ yok) kaydedildi", () => {
    assert.deepEqual(failures, []);
    assert.equal(saved.size, TECHNIQUES.length);
  });

  const full = async (id: string) => ((await getAnalysis(ctx, id, false)).body as J).analysis as ReportAnalysisInput & J;
  const interpOf = async (tech: string) => {
    const a = await full(saved.get(tech)!);
    return a.interpretation?.visible === true ? a : null;
  };

  // ── Saf rapor modeli: her teknik ───────────────────────────────────────────────────────────────
  const MARKERS: Record<string, string[]> = {
    "western.natal": ["Gezegen yerleşimleri", "Ev başlangıçları (cusp)", "Açılar", "Batı Astrolojisi"],
    "western.transit": ["Transit → natal açılar", "Transit gezegenleri"],
    "western.forecast": ["Takvim", "Dönem"],
    "western.progression": ["İlerletilmiş gezegenler", "Hedef tarih"],
    "western.solar_arc": ["Directed noktalar", "Yay (arc)"],
    "western.solar_return": ["Dönüş haritası gezegenleri", "Solar return (Güneş dönüşü)"],
    "western.lunar_return": ["Lunar return (Ay dönüşü)"],
    "western.synastry": ["Sinastri açıları", "İnci Öğüt · gezegenler", "2. kişi · İnci Öğüt"],
    "western.composite": ["Composite gezegenler", "Orta nokta (midpoint)"],
    "western.astrocartography": ["Gezegen hatları", "MC hattı boylamı"],
    "western.relocation": ["Gezegenler: doğum yeri ↔ hedef", "Hedefte ev"],
    "western.local_space": ["Local space yönleri", "Azimut"],
    "western.fixed_stars": ["Önemli sabit yıldız kavuşumları", "Ekliptik boylam kavuşumu (paran değildir)", "Ek: Sabit yıldız kataloğu", "Zuben Elgenubi", "Deneb Algedi"],
    "vedic.d1": ["Graha yerleşimleri (D1 / Rashi)", "Nakshatra", "Vedik / Jyotish", "Yogalar"],
    "vedic.varga": ["Varga yerleşimleri", "Vargottama"],
    "vedic.dasha": ["Dönemler", "Vimshottari"],
    "vedic.drishti": ["Graha bakışları"],
    "vedic.ashtakavarga": ["Bhinnashtakavarga (BAV)", "SAV"],
    "vedic.shadbala": ["Shadbala (bileşenler virupa; toplam rupa)", "Ishta / Kashta Phala"],
    "vedic.panchanga": ["Tithi", "Karana", "Nitya yoga"],
    "vedic.transit": ["Gochara", "Janma rashisi (natal Ay)"],
    "kp.chart": ["Cusp'lar (Placidus)", "Sub L.", "Ev significator'ları (4 düzey)", "KP (Krishnamurti Paddhati)"],
    "kp.dasha": ["Significator evleri", "Dönemler"],
    "kp.ruling": ["Ruling planets (güç sırası)", "Gün lordu"],
    "kp.transit": ["Transit gezegenleri", "Sub-sub L."],
    "kp.horary": ["Horary sayısı", "Cusp'lar (Placidus)"],
  };
  for (const tech of TECHNIQUES) {
    await t(`model ${tech}: tekniğe özgü bölümler; boş/ham değer yok; ham JSON yok`, async () => {
      const r = buildAstroReport(await full(saved.get(tech)!));
      const texts = reportTexts(r);
      const all = texts.join("\n");
      for (const m of MARKERS[tech]) assert.ok(all.includes(m), `${tech}: "${m}" yok`);
      for (const x of texts) assert.ok(!FORBIDDEN.test(x), `${tech}: yasak değer: ${x.slice(0, 120)}`);
      assert.ok(!/[{}]"|":\s*[\[{"]/.test(all), `${tech}: ham JSON izi`);
      // Gelenek ayrımı: Batı raporunda KP/Vedik tablo başlıkları yok, KP raporunda Batı gezegen tablosu yok.
      if (tech.startsWith("western.")) assert.ok(!all.includes("Sub L.") && !all.includes("Nakshatra lordu"), "Batı raporunda Vedik/KP alanı");
      if (tech.startsWith("kp.")) assert.ok(!all.includes("Gezegen yerleşimleri") && !all.includes("Asalet"), "KP raporunda Batı alanı");
      const tables = r.blocks.filter((b) => b.kind === "table");
      for (const b of tables) if (b.kind === "table") for (const row of b.table.rows) assert.equal(row.length, b.table.columns.length, `${tech}: satır/sütun uyumsuz`);
    });
  }

  // 2026-10-12 (UAT 2. tur, madde L): Progression (tam burç evli tek halka), Transit (natal çerçeve varsa çift halka) ve
  // Sinastri (çift halka) da kayıtlı veriden çizilir; çerçevesi olmayan transit görselsiz kalır.
  // 2026-10-15 (owner onayı): Vedik D1 / Varga ve KP chart / horary / transit haritaları da rapora girer.
  await t("model: harita görseli natal, return, composite, relocation, progression, sinastri, (natal çerçeveli) transit, Vedik D1/Varga, KP chart/horary/transit + (2026-10-15) Dasha çizelgesi ve Shadbala grafiği; diğerleri görselsiz", async () => {
    const withChart = new Set(["western.natal", "western.solar_return", "western.lunar_return", "western.composite", "western.relocation", "western.progression", "western.synastry", "vedic.d1", "vedic.varga", "kp.chart", "kp.horary", "kp.transit", "vedic.dasha", "kp.dasha", "vedic.shadbala", "vedic.transit", "western.astrocartography", "western.local_space"]);
    for (const tech of TECHNIQUES) {
      const a = await full(saved.get(tech)!);
      const r = buildAstroReport(a);
      const expect = tech === "western.transit" ? !!(a.technical as J | null)?.natalFrame : withChart.has(tech);
      assert.equal(r.hasChart, expect, tech);
    }
    const r = buildAstroReport(await full(saved.get("western.natal")!));
    const ch = r.blocks.find((b) => b.kind === "chart") as J;
    const svg = buildWheelSvg(ch.chart);
    // 2026-10-14 owner kararı: çarkta GERÇEK glifler (sembol yedek yazı tipleri resvg'ye yüklenir); Türkçe karşılık açıklamada.
    assert.ok(svg.startsWith("<svg") && svg.includes(">☉<") && svg.includes(">♋<") && svg.includes(">ASC<"), "çarkta gezegen/burç glifi yok");
    assert.ok(svg.includes("Yasam Astro Symbols A") && svg.includes("Yasam Astro Symbols B"), "çark yazı tipi listesinde sembol yedek fontları yok");
    assert.ok(!/>(Gü|Koç)</.test(svg), "eski Türkçe kısaltma kalmamalı");
    assert.ok(r.blocks.some((b) => b.kind === "para" && b.text.includes("☉ Güneş") && b.text.includes("♈ Koç")), "çark açıklaması sembol + Türkçe olmalı");
  });

  await t("model: uzman notu + Bilgi Bankası snapshot'ı rapora girer; dosya adı ASCII", async () => {
    const r = buildAstroReport(await full(saved.get("western.natal")!));
    const all = reportTexts(r).join("\n");
    assert.ok(all.includes(TR_SAMPLE) && all.includes("40. paragraf"));
    assert.ok(all.includes("Yengeç Güneşi (Bilgi Bankam)") && all.includes("Kaynak: Uzmanın kendi kaynağı"));
    assert.match(r.fileBase, /^Astroloji-Sukru-Cagri-Isikgoz-[A-Za-z0-9-]+-\d{4}-\d{2}-\d{2}$/);
    assert.equal(asciiSlug("Çağrı Işık / İğne"), "Cagri-Isik-Igne");
  });

  // ── Gerçek route: Word + PDF, her teknik (uzman yüzeyi, yorum yetkili) ────────────────────────────
  const natalInterp = await interpOf("western.natal");
  const interpTexts = (a: J): string[] => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string" && v.length >= 25 && !v.startsWith("astro.")) out.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(a?.interpretation?.content);
    return out;
  };
  const NATAL_NARR = interpTexts(natalInterp)[0];
  await t("kurulum: natal analizde kayıtlı Roxy yorumu var (sızıntı testlerinin önkoşulu)", () => {
    assert.ok(natalInterp && typeof NATAL_NARR === "string", "natal yorum yok");
  });

  const docs = new Map<string, { docx: Awaited<ReturnType<typeof docxText>>; pdf: Awaited<ReturnType<typeof pdfText>> }>();
  for (const tech of TECHNIQUES) {
    await t(`route ${tech}: gerçek .docx + .pdf; bağımsız açılır; Türkçe; başlık stilleri; yasak değer yok; içerik tutarlı`, async () => {
      const id = saved.get(tech)!;
      const d = await get("expert", id, "exAI", "docx");
      assert.equal(d.status, 200, d.buf.toString().slice(0, 200));
      assert.equal(d.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      assert.match(d.headers.get("content-disposition") ?? "", /attachment; filename="Astroloji-[A-Za-z0-9-]+\.docx"; filename\*=UTF-8''Astroloji-/);
      assert.equal(d.headers.get("cache-control"), "no-store, private");
      assert.equal(d.buf.subarray(0, 2).toString(), "PK");
      const dx = await docxText(d.buf);
      assert.ok(dx.xml.includes('w:val="Heading1"'), "Heading 1 stili yok");
      assert.ok(dx.xml.includes("<w:tblHeader/>") || !buildAstroReport(await full(id)).blocks.some((b) => b.kind === "table"), "tablo başlığı tekrarı yok");
      assert.ok(!FORBIDDEN.test(dx.text), `docx yasak değer: ${dx.text.match(FORBIDDEN)?.[0]}`);
      assert.ok(dx.text.includes("ASTROLOJİ ANALİZ RAPORU") && dx.text.includes("Şükrü Çağrı Işıkgöz"));
      const p = await get("expert", id, "exAI", "pdf");
      assert.equal(p.status, 200);
      assert.equal(p.headers.get("content-type"), "application/pdf");
      assert.equal(p.buf.subarray(0, 5).toString(), "%PDF-");
      // İsteğe bağlı görsel denetim: ASTRO_REPORT_DUMP=<klasör> verilirse üretilen dosyalar diske yazılır (test sonucu değişmez).
      if (process.env.ASTRO_REPORT_DUMP) {
        writeFileSync(join(process.env.ASTRO_REPORT_DUMP, `${tech}.docx`), d.buf);
        writeFileSync(join(process.env.ASTRO_REPORT_DUMP, `${tech}.pdf`), p.buf);
      }
      const px = await pdfText(p.buf);
      assert.ok(px.pages >= 2, "kapak + içerik");
      assert.ok(norm(px.text).includes("Şükrü Çağrı Işıkgöz"), "PDF Türkçe ad");
      assert.ok(!FORBIDDEN.test(px.text), `pdf yasak değer: ${px.text.match(FORBIDDEN)?.[0]}`);
      // Word ↔ PDF içerik tutarlılığı: tekniğe özgü işaretler ikisinde de.
      for (const m of MARKERS[tech]) {
        assert.ok(dx.text.includes(m), `docx: ${m}`);
        assert.ok(norm(px.text).includes(norm(m)), `pdf: ${m}`);
      }
      docs.set(tech, { docx: dx, pdf: px });
      // İsteğe bağlı görsel inceleme: REPORT8_OUT=<klasör> verilirse örnek dosyalar yazılır.
      if (process.env.REPORT8_OUT) {
        const fs = await import("node:fs");
        fs.writeFileSync(join(process.env.REPORT8_OUT, `${tech}.docx`), d.buf);
        fs.writeFileSync(join(process.env.REPORT8_OUT, `${tech}.pdf`), p.buf);
      }
    });
  }

  await t("Türkçe karakterler Word ve PDF'te birebir (uzun not, ğüşıöç İĞŞÜÖÇ); uzun analiz çok sayfalı", () => {
    const n = docs.get("western.natal")!;
    assert.ok(n.docx.text.includes(TR_SAMPLE));
    assert.ok(norm(n.pdf.text).includes(norm(TR_SAMPLE)), "PDF Türkçe örnek");
    assert.ok(n.pdf.pages >= 6, `natal PDF ${n.pdf.pages} sayfa`);
    const f = docs.get("western.forecast")!;
    assert.ok(f.pdf.pages >= 3, `forecast PDF ${f.pdf.pages} sayfa`);
  });

  await t("harita görseli: natal/return/composite/relocation/progression/sinastri (+ natal çerçeveli transit) + Vedik D1/Varga + KP Word'de PNG gömülü + PDF'te görsel; haritasız Vedik/KP teknikleri görselsiz", async () => {
    for (const tech of ["western.natal", "western.solar_return", "western.composite", "western.relocation", "western.progression", "western.synastry", "vedic.d1", "vedic.varga", "kp.chart", "kp.horary", "kp.transit", "vedic.dasha", "kp.dasha", "vedic.shadbala", "vedic.transit", "western.astrocartography", "western.local_space"]) assert.equal(docs.get(tech)!.docx.media.length, 1, tech);
    for (const tech of ["kp.ruling", "vedic.panchanga", "vedic.drishti", "vedic.ashtakavarga"]) assert.equal(docs.get(tech)!.docx.media.length, 0, tech);
    const trFrame = !!((await full(saved.get("western.transit")!)).technical as J | null)?.natalFrame;
    assert.equal(docs.get("western.transit")!.docx.media.length, trFrame ? 1 : 0, "western.transit (natal çerçeve → çift halka)");
    const png = await (await JSZip.loadAsync((await get("expert", saved.get("western.natal")!, "exAI", "docx")).buf)).file(docs.get("western.natal")!.docx.media[0])!.async("nodebuffer");
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), "çark PNG kare olmalı (oran korunur)");
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(docs.get("western.natal")!.docx.xml)!;
    assert.equal(ext[1], ext[2], "Word'deki çark oranı 1:1");
    const pdf = (await get("expert", saved.get("western.natal")!, "exAI", "pdf")).buf.toString("latin1");
    assert.ok(/\/Subtype \/Image/.test(pdf), "PDF'te görsel nesnesi yok");
  });

  // ── Roxy yorum güvenliği ─────────────────────────────────────────────────────────────────────────
  await t("yorum yetkisi AÇIK: kayıtlı Roxy yorumu Word ve PDF'te var", () => {
    const n = docs.get("western.natal")!;
    assert.ok(n.docx.text.includes("Otomatik Yorum"));
    assert.ok(n.docx.text.includes(NATAL_NARR.slice(0, 40)), "docx yorum metni");
    assert.ok(norm(n.pdf.text).includes(norm(NATAL_NARR.slice(0, 30))), "pdf yorum metni");
  });

  const leakCheck = async (who: Who, surface: "expert" | "admin" = "expert", extra = "") => {
    for (const tech of TECHNIQUES) {
      const a0 = await interpOf(tech);
      const narr = a0 ? interpTexts(a0).map((s) => s.slice(0, 30)) : [];
      for (const fmt of ["docx", "pdf"] as const) {
        const r = await get(surface, saved.get(tech)!, who, fmt, extra);
        assert.equal(r.status, 200, `${tech} ${fmt} ${r.status}`);
        const text = fmt === "docx" ? (await docxText(r.buf)).text : norm((await pdfText(r.buf)).text);
        assert.ok(!text.includes("Otomatik Yorum"), `${tech} ${fmt}: yorum başlığı sızdı`);
        for (const s of narr) assert.ok(!text.includes(fmt === "pdf" ? norm(s) : s), `${tech} ${fmt}: yorum metni sızdı: ${s}`);
        assert.ok(!/interp|Roxy yorumu dahil/i.test(text), `${tech} ${fmt}: yorum izi`);
      }
    }
  };
  await t("yetki SONRADAN kaldırıldı (astrology açık, yorum kapalı): 25 teknik × Word/PDF'te yorum YOK; teknik + not + KB korunur", async () => {
    setPerms(U.exAI, { astrology: true });
    try {
      await leakCheck("exAI");
      const r = await get("expert", saved.get("western.natal")!, "exAI", "docx");
      const tx = (await docxText(r.buf)).text;
      assert.ok(tx.includes("Gezegen yerleşimleri") && tx.includes(TR_SAMPLE) && tx.includes("Yengeç Güneşi (Bilgi Bankam)"));
    } finally {
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
    }
  });

  await t("yorum kapalıyken rapor yolu yorum kolonunu DB'den HİÇ okumaz (select listesinde yok)", async () => {
    setPerms(U.exAI, { astrology: true });
    const seen: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.includes("/rest/v1/astro_analyses")) seen.push(decodeURIComponent(u));
      return orig(input, init);
    }) as typeof fetch;
    try {
      for (const fmt of ["docx", "pdf"]) assert.equal((await get("expert", saved.get("western.synastry")!, "exAI", fmt)).status, 200);
    } finally {
      globalThis.fetch = orig;
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
    }
    assert.ok(seen.length >= 2, "astro_analyses okunmadı?");
    for (const s of seen) assert.ok(!s.includes("provider_interp_snapshot"), `yorum kolonu okundu: ${s.slice(0, 160)}`);
  });

  await t("sinastri/kompozit snapshot (iç içe yorum nesneleri) + owner önizleme kapalı → yorum yok", async () => {
    setPerms(U.exAI, { astrology: true });
    try {
      for (const tech of ["western.synastry", "western.composite"]) {
        for (const fmt of ["docx", "pdf"]) {
          const r = await get("expert", saved.get(tech)!, "exAI", fmt);
          const text = fmt === "docx" ? (await docxText(r.buf)).text : norm((await pdfText(r.buf)).text);
          assert.ok(!text.includes("Otomatik Yorum") && !text.includes("Güçlü yan") && !text.includes("Zorluk:"), `${tech} ${fmt}`);
        }
      }
    } finally {
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
    }
  });

  await t("doğrudan API + önbellek: aynı analiz yorumlu indirildikten HEMEN sonra yetki kalkınca yorumsuz (önbellek yok, no-store)", async () => {
    const id = saved.get("western.natal")!;
    const a = await get("expert", id, "exAI", "docx");
    assert.ok((await docxText(a.buf)).text.includes("Otomatik Yorum"));
    assert.equal(a.headers.get("cache-control"), "no-store, private");
    setPerms(U.exAI, { astrology: true });
    try {
      const b = await get("expert", id, "exAI", "docx");
      assert.ok(!(await docxText(b.buf)).text.includes("Otomatik Yorum"));
    } finally {
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
    }
  });

  // ── İzolasyon ────────────────────────────────────────────────────────────────────────────────────
  await t("izolasyon: başka uzman (aynı tenant), başka tenant, anonim, yetkisiz uzman, owner (başkasının analizi), tahmin edilen kimlik → tek tip 404, gövde boş", async () => {
    const id = saved.get("western.natal")!;
    for (const fmt of ["docx", "pdf"]) {
      for (const [surface, who] of [["expert", "exA"], ["expert", "exB"], ["expert", "anon"], ["expert", "exNone"], ["admin", "owner"], ["admin", "exAI"]] as const) {
        const r = await get(surface, id, who, fmt);
        assert.equal(r.status, 404, `${surface}/${who}/${fmt}: ${r.status}`);
        assert.ok(!r.headers.get("content-type")?.includes("pdf") && !r.headers.get("content-type")?.includes("word"));
        assert.ok(!r.buf.toString().includes("Şükrü"), "404 gövdesinde veri");
      }
      assert.equal((await get("expert", randomUUID(), "exAI", fmt)).status, 404);
      assert.equal((await get("expert", "not-a-uuid", "exAI", fmt)).status, 404);
    }
  });

  await t("modül yetkisi kaldırıldıktan sonra doğrudan rapor URL'si çalışmaz (404); geri açılınca çalışır", async () => {
    const id = saved.get("kp.chart")!;
    setPerms(U.exAI, {});
    try {
      for (const fmt of ["docx", "pdf"]) assert.equal((await get("expert", id, "exAI", fmt)).status, 404);
    } finally {
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
    }
    assert.equal((await get("expert", id, "exAI", "pdf")).status, 200);
  });

  await t("geçersiz biçim → 400 (yetkiliye); yetkisize yine 404", async () => {
    assert.equal((await get("expert", saved.get("vedic.d1")!, "exAI", "xlsx")).status, 400);
    assert.equal((await get("expert", saved.get("vedic.d1")!, "exNone", "xlsx")).status, 404);
    assert.equal((await get("expert", saved.get("vedic.d1")!, "exA", "xlsx")).status, 400, "modül yetkili (başka uzman) biçim hatası alır; analiz yine okunmaz");
  });

  // ── Mobil ────────────────────────────────────────────────────────────────────────────────────────
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  const WEBVIEW = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
  const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  // 2026-10-15 (owner kararı, satış öncesi): Astroloji Word/PDF Android tarayıcı + uygulama + tablet dahil her cihazda.
  await t("mobil: Android tarayıcı + Android uygulama WebView'i + iOS → Word ve PDF 200 (gerçek dosya, aynı başlıklar); yetkisiz Android → 404 (varlık sızmaz)", async () => {
    const id = saved.get("western.natal")!;
    for (const ua of [ANDROID, WEBVIEW, IOS]) {
      for (const fmt of ["docx", "pdf"]) {
        const r = await get("expert", id, "exAI", fmt, "", ua);
        assert.equal(r.status, 200, `${fmt} ${ua.slice(0, 30)}`);
        assert.equal(r.headers.get("content-type"), fmt === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
        assert.match(r.headers.get("content-disposition") ?? "", /^attachment; filename="[ -~]+"; filename\*=UTF-8''/);
        assert.equal(r.headers.get("cache-control"), "no-store, private");
        assert.equal(r.buf.subarray(0, fmt === "docx" ? 2 : 5).toString(), fmt === "docx" ? "PK" : "%PDF-");
        assert.equal((await get("expert", id, "exNone", fmt, "", ua)).status, 404);
        assert.equal((await get("expert", id, "anon", fmt, "", ua)).status, 404);
      }
    }
  });

  await t("mobil UI (2026-10-15): tekli + toplu Word/PDF düğmeleri ve seçim kutucukları her ekranda (telefon, tablet, Android) görünür; masaüstü aynı", () => {
    const src = readFileSync(join(ROOT, "app/admin/astroloji/_components/SavedAnalyses.tsx"), "utf8");
    const block = src.slice(src.indexOf("function ReportButtons"));
    assert.ok(!/useIsAndroid|isAndroid|no-android/.test(src), "Android gizlemesi kalmamalı");
    assert.ok(!/hidden md:(inline-flex|flex|block)/.test(block), "telefon genişliği gizlemesi kalmamalı (rapor düğmeleri / toplu çubuk)");
    assert.ok(!/no-android hidden/.test(src.slice(0, src.indexOf("function ReportButtons"))), "seçim kutucukları telefonda görünmeli");
    assert.ok(block.includes('data-testid="astro-report-docx"') && block.includes('data-testid="astro-report-pdf"'));
    // Gökyüzü Atlası (Aşama D): koyu başlıkta görünüm için isteğe bağlı `dark` prop'u; Android/telefon kuralları aynı.
    // 2026-10-12: yorum "gizle" seçiliyken Word/PDF de yorumsuz üretilir (aynı önizleme bayrağı; veri silinmez).
    assert.ok(/<ReportButtons id=\{a\.id\} previewNoInterp=\{previewNoInterp \|\| \(interp\.visible && interpHidden\)\}( dark)? \/>/.test(src));
  });

  // ── Snapshot değişmezliği + sıfır Roxy ───────────────────────────────────────────────────────────
  await t("rapor üretimi kayıtlı analizleri, notları ve sonuçları DEĞİŞTİRMEZ (önce/sonra birebir)", async () => {
    const snap = () => JSON.stringify([store.tables.astro_analyses, store.tables.astro_analysis_notes, store.tables.astro_provider_results ?? null, store.tables.astro_profiles]);
    const before = snap();
    for (const tech of ["western.natal", "vedic.d1", "kp.horary", "western.synastry"]) for (const fmt of ["docx", "pdf"]) await get("expert", saved.get(tech)!, "exAI", fmt);
    assert.equal(snap(), before);
  });

  await t("sıfır gerçek Roxy: rapor yolları sağlayıcıya HİÇ gitmez (sahte sağlayıcı + fetch sayaçları sabit)", () => {
    assert.equal(providerCalls.length, providerCallsAfterSetup, "rapor sırasında sağlayıcı çağrıldı");
    assert.equal(roxyFetchHits, 0, "Roxy URL'ine fetch");
  });

  // ── Eski / eksik kayıtlar ────────────────────────────────────────────────────────────────────────
  await t("eksik eski kayıtlar: alanları eksik snapshot'lar (danışansız, sürümsüz, yarım teknik) Word/PDF'te hatasız; boş değer yazılmaz", async () => {
    const src = store.tables.astro_analyses.find((r) => r.id === saved.get("western.solar_return"))!;
    const legacy = structuredClone(src);
    legacy.id = randomUUID();
    legacy.profile_snapshot = { label: "Eski kayıt", revision: { revision: 1, birthDate: "1990-07-15", timeKnown: false } };
    legacy.method_snapshot = {};
    legacy.versions_snapshot = {};
    legacy.kb_snapshot = null;
    const tech = legacy.technical_snapshot as J;
    delete tech.requested.sequence;
    legacy.provider_interp_included = false;
    legacy.provider_interp_snapshot = null;
    store.tables.astro_analyses.push(legacy);
    const v = store.tables.astro_analyses.find((r) => r.id === saved.get("vedic.drishti"))!;
    const legacyV = { ...structuredClone(v), id: randomUUID(), technical_snapshot: { ...structuredClone(v.technical_snapshot as J), method: "degree_orb", mutual: undefined } };
    store.tables.astro_analyses.push(legacyV);
    // Saati bilinmeyen profil (gerçek akış): natal maskelenir (ev/ASC yok) + uyarı.
    const pu = await mkProfile(ctx, "A", { label: "Saati bilinmeyen", clientId: null, birthTime: null, timeKnown: false, timeAccuracy: "unknown" });
    assert.equal((await runAstrology(ctx, { profileId: pu, selections: [selection("western.natal")] }, deps, { ownerPreviewHideInterp: false })).status, 200);
    const msv = await saveAnalysis(ctx, { profileId: pu, revision: 1, ...selection("western.natal"), includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    assert.equal(msv.status, 201, JSON.stringify(msv.body));
    const masked = { id: (msv.body as J).analysisId as string };
    for (const id of [legacy.id, legacyV.id, masked.id] as string[]) {
      for (const fmt of ["docx", "pdf"]) {
        const r = await get("expert", id, "exAI", fmt);
        assert.equal(r.status, 200, `${id} ${fmt}`);
        const text = fmt === "docx" ? (await docxText(r.buf)).text : (await pdfText(r.buf)).text;
        assert.ok(!FORBIDDEN.test(text), `${fmt}: ${text.match(FORBIDDEN)?.[0]}`);
      }
    }
    const m = (await docxText((await get("expert", masked.id, "exAI", "docx")).buf)).text;
    assert.ok(/Doğum saati bilinmediği için natal Ay/.test(m), "saat uyarısı");
    assert.ok(m.includes("Doğum saati Bilinmiyor") && !m.includes("Ev başlangıçları (cusp)") && !m.includes("Yükselen (ASC)"), "maskeli alanlar raporda yok");
  });

  // ── Silme (7B kuralı) ────────────────────────────────────────────────────────────────────────────
  await t("silinen profil: bağımsız analizleri raporlanamaz (404); korunan ortak sinastri/kompozit raporlanır", async () => {
    const pc = await mkProfile(ctx, "B", { label: "Silinecek karşı taraf", clientId: null });
    const run = await runAstrology(ctx, { profileId: pa, selections: [selection("western.synastry", pc)] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(run.status, 200);
    const shared = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...selection("western.synastry", pc), includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    assert.equal(shared.status, 201, JSON.stringify(shared.body));
    const sharedId = (shared.body as J).analysisId;
    const runOwn = await runAstrology(ctx, { profileId: pc, selections: [selection("western.natal")] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(runOwn.status, 200);
    const own = await saveAnalysis(ctx, { profileId: pc, revision: 1, ...selection("western.natal"), includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    const ownId = (own.body as J).analysisId;
    const pv = await previewProfileDeletion(ctx, { mode: "single", profileIds: [pc] });
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
    const del = await deleteProfiles(ctx, { mode: "single", profileIds: [pc], confirmations: 2, confirmToken: (pv.body as J).confirmToken });
    assert.equal(del.status, 200, JSON.stringify(del.body));
    for (const fmt of ["docx", "pdf"]) {
      assert.equal((await get("expert", ownId, "exAI", fmt)).status, 404, `bağımsız ${fmt}`);
      const r = await get("expert", sharedId, "exAI", fmt);
      assert.equal(r.status, 200, `ortak ${fmt}`);
      const text = fmt === "docx" ? (await docxText(r.buf)).text : norm((await pdfText(r.buf)).text);
      assert.ok(text.includes("Sinastri açıları"), `ortak ${fmt} içerik`);
    }
  });

  await t("owner (admin yüzeyi) kendi analizinin raporunu alır; önizleme (previewNoInterp=1) → yorumsuz", async () => {
    const octx = ctxFor(U.owner);
    const po = await mkProfile(octx, "A", { label: "Owner profil", clientId: null });
    assert.equal((await runAstrology(octx, { profileId: po, selections: [selection("western.natal")] }, deps, { ownerPreviewHideInterp: false })).status, 200);
    const sv = await saveAnalysis(octx, { profileId: po, revision: 1, ...selection("western.natal"), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    const a = await get("admin", id, "owner", "docx");
    assert.equal(a.status, 200);
    assert.ok((await docxText(a.buf)).text.includes("Otomatik Yorum"));
    const b = await get("admin", id, "owner", "pdf", "&previewNoInterp=1");
    assert.ok(!norm((await pdfText(b.buf)).text).includes("Otomatik Yorum"));
    assert.equal((await get("expert", id, "exAI", "docx")).status, 404, "uzman owner'ın analizini alamaz");
  });

  await t("hız sınırı: aynı uzman dakikada 20'den fazla rapor → 429 (no-store)", async () => {
    const id = saved.get("vedic.panchanga")!;
    const ctxB = ctxFor(U.exB, TB);
    const pbx = await mkProfile(ctxB, "A", { clientId: null });
    assert.equal((await runAstrology(ctxB, { profileId: pbx, selections: [selection("vedic.panchanga")] }, deps, { ownerPreviewHideInterp: false })).status, 200);
    const sv = await saveAnalysis(ctxB, { profileId: pbx, revision: 1, ...selection("vedic.panchanga"), includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    const idB = (sv.body as J).analysisId;
    void id;
    let last = 0;
    __resetRateLimitStore();
    resetRl = false;
    for (let i = 0; i < 21; i++) last = (await get("expert", idB, "exB", "pdf")).status;
    assert.equal(last, 429);
  });

  await t("2026-10-12 TOPLU KAYIT: tek kayıt işlemi bütün kaydedilmemiş analizleri kapsar; teknik başına ayrı kayıt + kararlı istek kimliği + geri okuma", () => {
    const page = readFileSync(join(ROOT, "app/admin/astroloji/page.tsx"), "utf8");
    const ws = readFileSync(join(ROOT, "app/admin/astroloji/_components/AnalysisWorkspace.tsx"), "utf8");
    const dlg = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/SaveBatchDialog.tsx"), "utf8");
    // Eski kök neden (yalnız aktif sekme kaydediliyordu) + ikinci kayıt formu + "yorumu dahil et" kutusu KALDIRILDI.
    assert.ok(!/setSaveSignals|saveSignal=|includeProviderInterp|Sistem yorumunu analize ayrı katman/.test(page + ws), "eski tekli kayıt akışı kalmamalı");
    assert.ok(!/id: "kaydet"/.test(page), "ikinci 'Kaydet' sekmesi kalmamalı");
    // Başlıktaki tek düğme kaydedilmemiş BÜTÜN sonuçları sayar ve toplu kayıt penceresini açar.
    assert.match(page, /const unsavedHere = runs\.items\.filter\(\(x\) => !savedIds\[`\$\{runs\.key\}\|\$\{x\.key\}`\]\);/);
    assert.match(page, /`Tümünü Kaydet \(\$\{unsavedHere\.length\}\)`/);
    // Her teknik mevcut POST /analyses ile AYRI kayıt; kararlı saveRequestId; başarı yalnız geri okumayla.
    const fn = page.slice(page.indexOf("async function saveBenchKeys"), page.indexOf("async function saveBenchKeys") + 2600);
    assert.match(fn, /saveReqIds\.current\[fk\] \?\?= crypto\.randomUUID\(\);/);
    assert.ok(fn.indexOf('"/api/admin/astroloji/analyses"') > 0 && fn.indexOf("/api/admin/astroloji/analyses/${encodeURIComponent(r.data.analysisId)}") > fn.indexOf('"/api/admin/astroloji/analyses"'), "kayıt sonrası doğrulama okuması");
    assert.ok(fn.indexOf("setSavedIds") > fn.indexOf("check.ok"), "kaydedildi işareti yalnız doğrulamadan sonra");
    // Pencere: kısmi başarısızlık sayıları + başarısızları yeniden dene + "N analizden M'i kaydedilecek".
    assert.match(dlg, /analiz kaydedildi, \$\{summary\.failed\} analiz kaydedilemedi/);
    assert.match(dlg, /analizden \$\{chosen\.length\}'\$\{accSuffix\(chosen\.length\)\} kaydedilecek/);
    assert.match(dlg, /Başarısız \$\{chosen\.length\} analizi yeniden dene/);
  });

  await t("2026-10 PROFİL SİLME: analizi olmayan profil Yeni Analiz'den silinebilir (ortak A/B akışı; A yalnız analiz varsa)", () => {
    const page = readFileSync(join(ROOT, "app/admin/astroloji/page.tsx"), "utf8");
    const prep = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/PrepCenter.tsx"), "utf8");
    const adf = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/ArchiveDeleteFlow.tsx"), "utf8");
    assert.match(prep, /data-testid="atlas-delete-profile"/);
    assert.match(page, /onDeleteProfile=\{shownDetail \? \(\) => setArchiveDelete\(\{ scope: "single", ids: \[shownDetail\.id\] \}\) : null\}/);
    // Akış gizli arşiv ızgarasının DIŞINDA (Yeni Analiz görünümünde de görünür).
    assert.ok(page.indexOf("<ArchiveDeleteFlow") < page.indexOf("Aşama D3: Yeni Analiz"), "silme katmanı görünümden bağımsız");
    assert.ok(!/ProfileDeleteFlow/.test(page), "ölü ikinci silme akışı kaldırıldı");
    assert.match(adf, /const noAnalyses = !!pv && pv\.totals\.ownAnalyses === 0;/);
    assert.match(adf, /disabled=\{noAnalyses\}/);
    assert.match(adf, /!\(noAnalyses && kind === "A"\)/);
  });

  await t("2026-10 DÖNÜŞ ANI: Roxy doğum ofsetiyle verir (1988 TR UTC+2) → rapor UTC + doğum yeri GERÇEK yerel saati (2026 UTC+3) yazar", async () => {
    const { returnTimes } = await import("@/lib/astrology/report/model");
    const t = { returnLocal: "2026-03-21T11:52:02", returnOffsetHours: 2 };
    const r = returnTimes(t, "Europe/Istanbul", false);
    assert.equal(r.utc, "2026-03-21T09:52:02.000Z");
    assert.match(r.local ?? "", /^21\.03\.2026 12:52 \(GMT\+3, Europe\/Istanbul\)$/);
    assert.equal(returnTimes(t, "Europe/Istanbul", true).local, null, "farklı konumda doğum yeri saati yazılmaz");
    assert.equal(returnTimes({ returnLocal: "x", returnOffsetHours: 2 }, "Europe/Istanbul", false).utc, null);
    const src = readFileSync(join(ROOT, "lib/astrology/report/model.ts"), "utf8");
    assert.ok(!/"Dönüş anı \(yerel\)"/.test(src), "yanıltıcı 'yerel' etiketi kalktı");
  });

  await t("2026-10-12 VARSAYILAN TARİH: 'bugün' Türkiye takvim günü (00:00–03:00 TSİ'de dün değil; yılbaşında solar return yılı doğru)", async () => {
    const { defaultParams, istanbulDateIso } = await import("@/app/admin/astroloji/_lib/techniques");
    assert.equal(istanbulDateIso(new Date("2026-10-11T22:07:00Z")), "2026-10-12");
    const p = defaultParams(new Date("2026-10-11T22:07:00Z"));
    assert.equal(p.targetDate, "2026-10-12");
    assert.equal(p.forecastStart, "2026-10-12");
    assert.equal(p.transitDate, "2026-10-12");
    assert.equal(p.lunarMonth, "2026-10");
    const ny = defaultParams(new Date("2026-12-31T21:30:00Z"));
    assert.equal(ny.returnYear, 2027);
    assert.equal(ny.targetDate, "2027-01-01");
  });

  await t("2026-10-12 KAYIT BAŞLIĞI: uzmanın verdiği başlık listede görünür; otomatik başlık tekrar edilmez", () => {
    const src = readFileSync(join(ROOT, "app/admin/astroloji/_components/SavedAnalyses.tsx"), "utf8");
    assert.match(src, /data-testid="astro-saved-title"/);
    const body = src.slice(src.indexOf("export function isCustomTitle"), src.indexOf("function fmt("));
    const isCustomTitle = new Function("title", "profileLabel", body.replace(/^export function isCustomTitle\([^)]*\): boolean \{/, "").replace(/\}\s*$/, "")) as (a: string, b: string) => boolean;
    const P = "TEST2 · Ankara 1988 sabah";
    assert.equal(isCustomTitle(`${P} · Vedik D1 (Rashi) · 11.10.2026`, P), false);
    // sunucu etiketi arayüz etiketinden uzun olabilir (canlı UAT 12.10.2026)
    assert.equal(isCustomTitle(`${P} · KP dasha (Vimshottari + significator) · 12.10.2026`, P), false);
    assert.equal(isCustomTitle(`${P} · Solar return → London, England, United Kingdom · 12.10.2026`, P), false);
    assert.equal(isCustomTitle("Canlı UAT · Local Space (sahibin senaryosu)", P), true);
    assert.equal(isCustomTitle(`${P} · ilk seans notlarıyla`, P), true);
    assert.equal(isCustomTitle(`${P} & TEST2 · İzmir saat bilinmiyor · Sinastri · 12.10.2026`, P), false, "ilişki otomatik başlığı");
    assert.equal(isCustomTitle("  ", P), false);
    assert.match(readFileSync(join(ROOT, "app/admin/astroloji/page.tsx"), "utf8"), /profileLabel=\{shownDetail\.label\}/);
  });

  // ── 2026-10-15 HARİTA AKTARIM REGRESYONU: her harita türü uygulama verisinden → SVG → PNG → Word + PDF EKSİKSİZ ────────
  // Yalnız "dosyada bir resim var" yetmez: doğru harita, doğru öğeler, kırpılmadan, okunur çözünürlükte, Word = PDF = PNG.
  const CHART_TECHS = ["western.natal", "western.solar_return", "western.lunar_return", "western.composite", "western.relocation", "western.progression", "western.synastry", "western.transit"] as const;
  const FONT_DIR = join(ROOT, "public", "fonts");
  const GEIST = join(FONT_DIR, "Geist-Regular.ttf");
  const SYM = [join(FONT_DIR, "YasamAstroSymbolsA.ttf"), join(FONT_DIR, "YasamAstroSymbolsB.ttf")];
  const raster = (svg: string, fontFiles: string[]) => {
    const r = new Resvg(svg, { background: "white", fitTo: { mode: "width", value: 1200 }, font: { loadSystemFonts: false, fontFiles, defaultFontFamily: "Geist" } }).render();
    const px = r.pixels;
    let dark = 0;
    let minX = r.width, minY = r.height, maxX = 0, maxY = 0;
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) {
        const i = (y * r.width + x) * 4;
        if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) {
          dark++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    return { width: r.width, height: r.height, dark, bbox: { minX, minY, maxX, maxY } };
  };
  const pngDims = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
  const fontB64 = readFileSync(GEIST).toString("base64");
  for (const tech of CHART_TECHS) {
    await t(`harita aktarımı ${tech}: öğeler eksiksiz · PNG kırpılmamış/okunur · Word = PDF = PNG (aynı görsel, oran korunur)`, async () => {
      const a = await full(saved.get(tech)!);
      const r = buildAstroReport(a);
      const ch = r.blocks.find((b) => b.kind === "chart") as J;
      if (tech === "western.transit" && !(a.technical as J)?.natalFrame) {
        assert.equal(ch, undefined, "natal çerçevesi yokken transit çarkı çizilmemeli");
        return;
      }
      assert.ok(ch, "harita bloğu yok");
      const w = ch.chart as J;
      const svg = buildWheelSvg(w);
      // 1) Öğeler: her gövde için glif + derece; 12 burç glifi; ev numaraları; ASC/DSC/MC/IC; ℞; açı çizgileri.
      const glyphCount = (g: string) => svg.split(`>${g}<`).length - 1;
      const inner: J[] = w.bodies;
      const outer: J[] = w.outer?.bodies ?? [];
      for (const s of ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"]) assert.equal(glyphCount(s), 1, `burç glifi ${s}`);
      const degTexts = (svg.match(/>\d{1,2}°℞?</g) ?? []).length;
      assert.equal(degTexts, inner.length + outer.length, "her gövde için derece etiketi");
      assert.equal((svg.match(/℞</g) ?? []).length, [...inner, ...outer].filter((b) => b.retrograde).length, "retro işareti sayısı");
      if (w.houses.length) for (let i = 1; i <= 12; i++) assert.ok(svg.includes(`>${i}</text>`), `ev numarası ${i}`);
      if (w.angles) for (const lbl of ["ASC", "DSC", "MC", "IC"]) assert.ok(svg.includes(`>${lbl}<`), lbl);
      const lines = (svg.match(/<line [^>]*opacity="0\.75"/g) ?? []).length;
      const crossDrawable = (w.crossAspects ?? []).filter((x: J) => outer.some((b) => b.id === x.outer) && inner.some((b) => b.id === x.inner)).length;
      const natalDrawable = (w.aspects ?? []).filter((x: J) => inner.some((b) => b.id === x.a) && inner.some((b) => b.id === x.b)).length;
      assert.equal(lines, natalDrawable + crossDrawable, "açı çizgisi sayısı = verideki çizilebilir açı sayısı");
      if (tech === "western.synastry" || tech === "western.transit") assert.ok(crossDrawable > 0, "çift halkada halkalar arası açı çizgisi yok");
      if (tech === "western.natal") assert.ok(natalDrawable > 0, "natal açı çizgisi yok");
      // 2) PNG: kare, okunur çözünürlük, kenara taşma/kırpılma yok, boş değil; sembol fontları gerçekten glif çiziyor.
      const ras = raster(svg, [GEIST, ...SYM]);
      assert.equal(ras.width, 1200);
      assert.equal(ras.height, 1200, "çark kare olmalı");
      // Açısız çarklar (relocation, progression) daha seyrektir; ölçülen en düşük ≈%1,6 → eşik %1.
      assert.ok(ras.dark > 1200 * 1200 * 0.01, `harita neredeyse boş (${ras.dark} koyu piksel)`);
      assert.ok(ras.bbox.minX >= 2 && ras.bbox.minY >= 2 && ras.bbox.maxX <= 1197 && ras.bbox.maxY <= 1197, `içerik kenara değiyor (kırpılma): ${JSON.stringify(ras.bbox)}`);
      // Sembol glifleri GERÇEKTEN sembol fontundan çizilir: çarktaki her glif, font listesiyle ve sembol fontu AÇIKÇA
      // seçilerek PİKSEL-PİKSEL aynı; yalnız Geist ile (glif yok → .notdef kutusu) farklı.
      for (const g of [...new Set([...inner, ...outer].map((b) => WHEEL_BODY_ABBR[b.id]).concat(["♈", "♓", "℞"]))]) {
        const probe = (fam: string, files: string[]) =>
          Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" font-family="${fam}"><rect width="120" height="60" fill="#fff"/><text x="10" y="45" font-size="36">${g}</text></svg>`, { background: "white", font: { loadSystemFonts: false, fontFiles: files, defaultFontFamily: "Geist" } }).render().pixels);
        const viaStack = probe(WHEEL_FONT_STACK, [GEIST, ...SYM]);
        const famOf = fontKeyOf(g) === "B" ? "'Yasam Astro Symbols B'" : "'Yasam Astro Symbols A'";
        assert.ok(viaStack.equals(probe(famOf, [GEIST, ...SYM])), `${g}: çarkta sembol fontuyla çizilmiyor`);
        assert.ok(!viaStack.equals(probe("Geist", [GEIST])), `${g}: Geist ile aynı (sembol fontu devrede değil)`);
      }
      // 3) Word ve PDF: AYNI görsel, oran korunur, sayfaya sığar.
      const png = renderWheelPng(w);
      assert.ok(png, "PNG üretilemedi");
      if (!png) return;
      assert.deepEqual(pngDims(png.png), { w: 1200, h: 1200 });
      const docx = await renderAstroReportDocx(r, png.png, symbolFontBuffers());
      const zip = await JSZip.loadAsync(docx);
      const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n].dir);
      const imgs = await Promise.all(media.map((n) => zip.file(n)!.async("nodebuffer")));
      assert.ok(imgs.some((b) => b.equals(png.png)), "Word'deki harita, üretilen PNG ile birebir aynı değil");
      const docXml = await zip.file("word/document.xml")!.async("string");
      const ext = [...docXml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
      assert.ok(ext.some(([cx, cy]) => cx === cy && cx > 0 && cx <= 6_000_000), `Word görsel boyutu kare/sayfaya sığmalı: ${JSON.stringify(ext)}`);
      const pdf = Buffer.from(buildAstroReportPdf(r, png, fontB64, symbolFontsBase64())).toString("latin1");
      assert.ok(/\/Subtype \/Image[\s\S]{0,200}?\/Width 1200[\s\S]{0,60}?\/Height 1200|\/Width 1200[\s\S]{0,200}?\/Height 1200[\s\S]{0,200}?\/Subtype \/Image/.test(pdf), "PDF'te 1200×1200 harita görseli yok");
    });
  }
  await t("harita aktarımı: görsel üretilemezse rapor boş/yanlış yer tutucu yerine açık not verir (Word + PDF)", async () => {
    const r = buildAstroReport(await full(saved.get("western.natal")!));
    const docx = await renderAstroReportDocx(r, null, symbolFontBuffers());
    const zip = await JSZip.loadAsync(docx);
    assert.equal(Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !n.endsWith("/")).length, 0, "görsel yokken Word'e resim girmemeli");
    assert.ok((await zip.file("word/document.xml")!.async("string")).includes("Harita görseli bu raporda oluşturulamadı"));
    const pdfTxt = await pdfText(Buffer.from(buildAstroReportPdf(r, null, fontB64, symbolFontsBase64())));
    assert.ok(norm(pdfTxt.text).includes("Harita görseli bu raporda oluşturulamadı"));
  });
  await t("harita aktarımı: uygulamada haritası olmayan teknikler (drishti/ashtakavarga/panchanga/ruling/konum/sabit yıldız…) rapora HARİTA BLOĞU koymaz (yanlış harita yok)", async () => {
    // TRANSİT-02 (2026-10-17): Gochara ev şeridi raporda (owner onaylı talimat).
    const FIG = ["vedic.d1", "vedic.varga", "kp.chart", "kp.horary", "kp.transit", "vedic.dasha", "kp.dasha", "vedic.shadbala", "vedic.transit", "western.astrocartography", "western.local_space"];
    for (const tech of TECHNIQUES.filter((x) => !(CHART_TECHS as readonly string[]).includes(x) && !FIG.includes(x))) {
      const r = buildAstroReport(await full(saved.get(tech)!));
      assert.ok(!r.blocks.some((b) => b.kind === "chart"), `${tech}: beklenmeyen harita`);
    }
  });

  // ── 2026-10-15 VEDİK D1 / VARGA / KP HARİTASI RAPORDA (owner onayı) ──────────────────────────────────────────────
  // Ekrandaki harita bileşeninin kendi çıktısı (Kundli/Varga) veya ekrandaki KP ızgarasının aynı verisi → PNG → Word + PDF.
  // Ekran ↔ rapor öğe öğe eşdeğerliği: scripts/astrology/vedic-charts-ui.e2e.mts (tarayıcı).
  const FIG_TECHS = ["vedic.d1", "vedic.varga", "kp.chart", "kp.horary", "kp.transit"] as const;
  const FIG_TITLE: Record<string, RegExp> = { "vedic.d1": /^Vedik D1 \(Rashi\) haritası — /, "vedic.varga": /^Vedik D9 \(Navamsa\) haritası — /, "kp.chart": /^KP haritası — /, "kp.horary": /^KP horary haritası — /, "kp.transit": /^KP transit haritası — / };
  const figOf = (r: ReturnType<typeof buildAstroReport>) => (r.blocks.find((b) => b.kind === "chart" && "figure" in b) as J | undefined) ?? null;
  const mediaOf = async (buf: Buffer) => {
    const zip = await JSZip.loadAsync(buf);
    return Promise.all(Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n].dir).map((n) => zip.file(n)!.async("nodebuffer")));
  };
  const figPng: Record<string, Buffer> = {};
  for (const tech of FIG_TECHS) {
    await t(`Vedik/KP harita ${tech}: doğru türde harita · doğru ad · PNG kare/kırpılmamış · Word = PDF = bu kaydın PNG'si`, async () => {
      const a = await full(saved.get(tech)!);
      const r = buildAstroReport(a);
      const ch = figOf(r);
      assert.ok(ch, "harita bloğu yok");
      assert.match(ch.caption, FIG_TITLE[tech], "harita başlığı yanlış ad");
      assert.equal(ch.figure.type, tech.startsWith("kp.") ? "kp" : "kundli");
      if (tech === "vedic.d1") assert.equal(ch.figure.centreLabel, "D1 Rashi");
      if (tech === "vedic.varga") assert.equal(ch.figure.centreLabel, "D9 Navamsa");
      assert.ok(r.hasChart);
      // Harita teknik tabloların ÖNÜNDE
      const iChart = r.blocks.indexOf(ch);
      const iTech = r.blocks.findIndex((b) => b.kind === "heading" && b.text === "Teknik hesaplama sonuçları");
      assert.ok(iChart > 0 && iChart < iTech, "harita teknik sonuçlardan önce olmalı");
      const svg = await renderFigureSvg(ch.figure);
      if (ch.figure.type === "kundli") {
        // Ekrandaki bileşen çıktısı: her graha + Lagna + merkez etiketi; Türkçe kısaltma; İngilizce kalmadı
        const tree = kundliLocalizedTree(await kundliMarkup(ch.figure), ch.figure);
        const planets = tree.querySelectorAll("text.planet-text").map((x) => x.childNodes.map((c) => (c.nodeType === 3 ? c.data : "")).join("").trim());
        const grahas = (a.technical as J).grahas as J[];
        assert.equal(planets.length, grahas.length, "her graha haritada");
        assert.ok(planets.every((p) => /^(Gü|Ay|Ma|Me|Jü|Ve|Sa|Ra|Ke)( \d{1,2}°)?[ʳᶜʷ]*$/.test(p)), `Türkçe graha etiketi: ${planets.join(",")}`);
        assert.equal(planets.filter((p) => p.includes("ʳ")).length, grahas.filter((g) => g.retrograde).length, "vakri işareti sayısı");
        assert.ok(svg.includes(">Lagna<"), "Lagna işareti");
        assert.ok(!/>(Su|Mo|Ju|ASC)</.test(svg), "İngilizce kısaltma kalmamalı");
        assert.equal((svg.match(/<polygon /g) ?? []).length, 1, "Kuzey düzeni iç baklava çizgisi");
        assert.equal((svg.match(/<line /g) ?? []).length, 2, "Kuzey düzeni köşegenleri");
      } else {
        const tc = a.technical as J;
        const items = [...svg.matchAll(/data-kp-item="([^"]+)"/g)].map((m) => m[1]);
        assert.equal(items.filter((k) => /^c\d+$/.test(k)).length, (tc.cusps ?? []).length, "her cusp haritada");
        assert.equal(items.filter((k) => !/^c\d+$/.test(k)).length, tc.bodies.length, "her graha haritada");
        assert.equal((svg.match(/data-kp-sign=/g) ?? []).length, 12, "12 burç kutusu");
      }
      // Her karakter rapor yazı tiplerinde çizilebilir (kutu/boş glif yok)
      const txt = [...svg.matchAll(/>([^<]+)</g)].map((m) => m[1]).join("");
      const missing = [...new Set(Array.from(txt))].filter((c) => !isRenderable(c));
      assert.deepEqual(missing, [], "rapor yazı tiplerinde olmayan karakter");
      const ras = raster(svg, [GEIST, ...SYM]);
      assert.equal(ras.width, 1200);
      assert.equal(ras.height, 1200, "kare");
      // Kundli çizgileri ekrandaki gibi açık gri (#d4d4d8, eşik dışı) → eşik metin + çerçeveye göre: ≥ %0,5 koyu piksel.
      assert.ok(ras.dark > 1200 * 1200 * 0.005, `harita boş (${ras.dark})`);
      assert.ok(ras.bbox.minX >= 0 && ras.bbox.maxX <= 1199 && ras.bbox.maxY <= 1199, "kırpılma");
      const png = await renderFigurePng(ch.figure);
      assert.ok(!("error" in png), "PNG üretilemedi");
      if ("error" in png) return;
      assert.deepEqual(pngDims(png.png), { w: 1200, h: 1200 });
      figPng[tech] = png.png;
      // Gerçek rota (uzman yüzeyi): Word'deki tek görsel = bu kaydın PNG'si; PDF'te 1200×1200
      const d = await get("expert", saved.get(tech)!, "exAI", "docx");
      assert.equal(d.status, 200);
      const media = await mediaOf(d.buf);
      assert.equal(media.length, 1, "Word'de tek harita görseli");
      assert.ok(media[0].equals(png.png), "Word'deki harita bu kaydın PNG'si değil");
      const xml = await (await JSZip.loadAsync(d.buf)).file("word/document.xml")!.async("string");
      const ext = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
      assert.ok(ext.length === 1 && ext[0][0] === ext[0][1] && ext[0][0] <= 6_000_000, "Word görseli kare ve sayfaya sığar");
      const p = await get("expert", saved.get(tech)!, "exAI", "pdf");
      assert.equal(p.status, 200);
      assert.ok(/\/Width 1200[\s\S]{0,200}?\/Height 1200/.test(p.buf.toString("latin1")), "PDF'te 1200×1200 görsel yok");
      const pt = norm((await pdfText(p.buf)).text);
      assert.ok(pt.includes(norm(ch.caption.split(" — ")[0])), "PDF'te harita başlığı");
    });
  }
  await t("Vedik/KP: harita türleri birbirinden farklı görsel (D1 ≠ D9 ≠ KP …) — yanlış harita yanlış rapora girmez", () => {
    const k = Object.keys(figPng);
    assert.equal(k.length, FIG_TECHS.length);
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) assert.ok(!figPng[k[i]].equals(figPng[k[j]]), `${k[i]} = ${k[j]}`);
  });
  await t("Vedik/KP: farklı danışan verisi → farklı harita; her rapor yalnız KENDİ kaydının haritasını taşır (karışma yok)", async () => {
    for (const tech of ["vedic.d1", "kp.chart"] as const) {
      const a = await full(saved.get(tech)!);
      const b = structuredClone(a) as J;
      // İkinci danışan: grahalar bir burç ileride (sentetik; yalnız rapor katmanı)
      const shift = (x: J) => ({ ...x, rashi: SIGN_ORDER[(SIGN_ORDER.indexOf(x.rashi) + 1) % 12], longitude: (x.longitude + 30) % 360 });
      b.technical = { ...b.technical, ...(tech === "vedic.d1" ? { grahas: b.technical.grahas.map(shift) } : { bodies: b.technical.bodies.map(shift) }) };
      const fa = figOf(buildAstroReport(a))!.figure;
      const fb = figOf(buildAstroReport(b))!.figure;
      const pa = await renderFigurePng(fa);
      const pb = await renderFigurePng(fb);
      assert.ok(!("error" in pa) && !("error" in pb));
      if ("error" in pa || "error" in pb) return;
      assert.ok(!pa.png.equals(pb.png), `${tech}: iki danışanın haritası aynı çıktı`);
      const db = await mediaOf(await renderAstroReportDocx(buildAstroReport(b), pb.png, symbolFontBuffers()));
      assert.ok(db[0].equals(pb.png) && !db[0].equals(pa.png), `${tech}: B raporunda A'nın haritası`);
      assert.ok(figPng[tech].equals(pa.png), `${tech}: A'nın kayıtlı raporu kendi haritası`);
    }
  });
  await t("Vedik/KP: eksik veri / yanlış şema → harita bölümünde AÇIK not, görsel YOK (uydurma veya başka analizden harita yok)", async () => {
    for (const tech of FIG_TECHS) {
      const a = (await full(saved.get(tech)!)) as J;
      const cases: [string, J][] = [
        ["eksik graha", { ...a, technical: { ...a.technical, grahas: [], bodies: [] } }],
        ["yanlış şema", { ...a, technical: { ...a.technical, schema: tech === "vedic.d1" ? "astro.vedic.varga.v1" : "astro.vedic.d1.v1" } }],
      ];
      for (const [name, x] of cases) {
        const r = buildAstroReport(x as ReportAnalysisInput);
        assert.ok(!r.blocks.some((b) => b.kind === "chart"), `${tech} ${name}: harita bloğu olmamalı`);
        assert.ok(!r.hasChart, `${tech} ${name}: hasChart`);
        assert.ok(r.blocks.some((b) => b.kind === "para" && b.tone === "warn" && b.text.startsWith("Harita bu kayıtta eksik teknik veri nedeniyle çizilemedi")), `${tech} ${name}: açık not yok`);
        assert.ok(r.blocks.some((b) => b.kind === "heading" && b.text === "Teknik hesaplama sonuçları"), `${tech} ${name}: teknik tablolar korunur`);
      }
    }
  });
  await t("Vedik/KP: harita ÇİZİLEMEZSE (bileşen/veri hatası) yanlış harita basılmaz; Word + PDF açık not verir", async () => {
    const a = await full(saved.get("vedic.d1")!);
    const r = buildAstroReport(a);
    const ch = figOf(r)!;
    // Kayıttaki graha sayısı haritayla tutmuyor → çizim reddedilir
    const bad = await renderFigurePng({ ...ch.figure, grahaCount: ch.figure.grahaCount + 1 });
    assert.ok("error" in bad && /graha/.test(bad.error), "bozuk figür reddedilmeli");
    // D1 verisi D9 adıyla basılamaz (merkez etiketi bileşen çıktısıyla karşılaştırılır)
    const wrongCentre = await renderFigurePng({ ...ch.figure, centreLabel: "D9 Navamsa" });
    assert.ok("error" in wrongCentre && /Merkez etiketi/.test(wrongCentre.error), "D1 verisi D9 adıyla basılmamalı");
    const empty = await renderFigurePng({ ...ch.figure, data: { meta: {} } });
    assert.ok("error" in empty, "boş veride harita çizilmemeli");
    const docx = await renderAstroReportDocx(r, null, symbolFontBuffers());
    assert.equal((await mediaOf(docx)).length, 0);
    assert.ok((await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string")).includes("Harita görseli bu raporda oluşturulamadı"));
    assert.ok(norm((await pdfText(Buffer.from(buildAstroReportPdf(r, null, fontB64, symbolFontsBase64())))).text).includes("Harita görseli bu raporda oluşturulamadı"));
  });
  // 2026-10-15 bağımsız inceleme (PR #396) düzeltmeleri
  await t("Word sayfalama: Vedik/KP'de 'Harita' başlığı + görsel + alt yazı bölünmez tek blok (sayfa sonunda yalnız başlık kalmaz); batı çarkı düzeni aynen", () => {
    const harita = (xml: string) => {
      const i = xml.indexOf(">Harita<");
      const ts = xml.lastIndexOf("<w:tbl>", i);
      const te = ts < 0 ? -1 : xml.indexOf("</w:tbl>", ts);
      return { i, tbl: ts >= 0 && te > i && xml.lastIndexOf("</w:tbl>", i) < ts ? xml.slice(ts, te) : null };
    };
    for (const tech of FIG_TECHS) {
      const { i, tbl } = harita(docs.get(tech)!.docx.xml);
      assert.ok(i > 0, `${tech}: Harita başlığı yok`);
      assert.ok(tbl, `${tech}: Harita başlığı bölünmez blokta değil`);
      assert.ok(tbl!.includes("<w:cantSplit/>") && tbl!.includes("<w:drawing>") && tbl!.includes('w:val="Heading1"'), `${tech}: blokta başlık + görsel + cantSplit birlikte değil`);
    }
    for (const tech of ["western.natal", "western.synastry", "western.transit"]) {
      const { i, tbl } = harita(docs.get(tech)!.docx.xml);
      assert.ok(i > 0 && tbl === null, `${tech}: batı çarkı düzeni değişmemeli`);
    }
  });
  await t("KP transit açıklaması cusp/Placidus anlatmaz (haritada cusp yok); KP doğum + horary açıklaması korunur", () => {
    const tr = docs.get("kp.transit")!;
    for (const x of [tr.docx.text, norm(tr.pdf.text)]) {
      assert.ok(!x.includes("Çerçeveli etiket") && !x.includes("Placidus ev başlangıcı"), "kp.transit: olmayan cusp etiketleri anlatılıyor");
      assert.ok(x.includes("ev başlangıcı (cusp) çizilmez"), "kp.transit: doğru açıklama yok");
    }
    for (const tech of ["kp.chart", "kp.horary"]) {
      const d = docs.get(tech)!;
      for (const x of [d.docx.text, norm(d.pdf.text)]) assert.ok(x.includes("Çerçeveli etiket = Placidus ev başlangıcı (cusp)"), `${tech}: cusp açıklaması korunmalı`);
    }
  });
  await t("Sinastri uyum puanı Türkçe iki ondalık (57,28); kayıtlı ham değer değişmez", async () => {
    const raw = ((await full(saved.get("western.synastry")!)) as J).technical.compatibilityScore as number;
    assert.equal(raw, 57.28004017277183, "kayıtlı ham değer");
    const d = docs.get("western.synastry")!;
    for (const x of [d.docx.text, norm(d.pdf.text)]) {
      assert.ok(x.includes("57,28"), "uyum puanı Türkçe iki ondalık değil");
      assert.ok(!x.includes("57.28004017277183") && !x.includes("57,28004"), "ham uzun ondalık raporda");
    }
  });
  // ── 2026-10-15 SATIŞ ÖNCESİ: Dasha çizelgesi + Shadbala grafiği raporda; yorum üretmeyen teknik notu ──────────────
  const DASHA_HEX: Record<string, string> = { sun: "#fcd34d", moon: "#e2e8f0", mars: "#fda4af", mercury: "#6ee7b7", jupiter: "#fef08a", venus: "#fbcfe8", saturn: "#a5b4fc", rahu: "#a1a1aa", ketu: "#d6d3d1" };
  for (const tech of ["vedic.dasha", "kp.dasha"] as const) {
    await t(`${tech}: rapordaki zaman çizelgesi ekrandakiyle AYNI veri/ölçek/renk (dönem başına kesim, süreyle orantılı); 'bugün' işareti YOK; Word + PDF tam genişlik`, async () => {
      const a = await full(saved.get(tech)!);
      const r = buildAstroReport(a);
      const ch = figOf(r)!;
      assert.equal(ch.figure.type, "dashaTimeline");
      const periods = (a.technical as J).periods as J[];
      assert.deepEqual(ch.figure.periods, periods.map((p) => ({ lord: p.lord, start: p.start, end: p.end, durationYears: p.durationYears })), "kayıttaki dönemler birebir");
      assert.ok(r.blocks.some((b) => b.kind === "heading" && b.text === "Dönem çizelgesi"));
      const svg = await renderFigureSvg(ch.figure);
      const segs = [...svg.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)" height="\d+" fill="(#[0-9a-f]{6})" fill-opacity="0\.9" data-dasha-seg="(\w+)"/g)];
      assert.equal(segs.length, periods.length, "dönem başına bir kesim");
      const total = periods.reduce((s2, p) => s2 + p.durationYears, 0);
      segs.forEach((m, i) => {
        assert.equal(m[4], periods[i].lord);
        assert.equal(m[3], DASHA_HEX[periods[i].lord], `${periods[i].lord} rengi ekranla aynı`);
        assert.ok(Math.abs(Number(m[2]) - (periods[i].durationYears / total) * 998) < 0.02, "genişlik süreyle orantılı");
      });
      assert.ok(svg.includes(`${periods[0].start.slice(8, 10)}.${periods[0].start.slice(5, 7)}.${periods[0].start.slice(0, 4)}`), "başlangıç tarihi");
      assert.ok(!/bugün/i.test(svg), "tarihe bağlı işaret rapora girmez");
      const png = await renderFigurePng(ch.figure);
      assert.ok(!("error" in png) && png.width === 1200 && png.height < png.width / 5, "yatay PNG");
      const xml = docs.get(tech)!.docx.xml;
      const ext = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
      assert.ok(ext.length === 1 && ext[0][0] > 5_500_000 && ext[0][0] <= 6_096_000 && ext[0][1] < ext[0][0] / 5, `Word: sayfa genişliğinde yatay görsel ${JSON.stringify(ext)}`);
      assert.ok(docs.get(tech)!.docx.text.includes("Dönem çizelgesi") && norm(docs.get(tech)!.pdf.text).includes("Dönem çizelgesi"));
    });
  }
  await t("vedic.shadbala: rapordaki güç grafiği ekrandakiyle AYNI (sıra, oran ölçeği, 1,00 çizgisi, yeşil/pembe); Word + PDF tam genişlik", async () => {
    const a = await full(saved.get("vedic.shadbala")!);
    const r = buildAstroReport(a);
    const ch = figOf(r)!;
    assert.equal(ch.figure.type, "shadbalaBars");
    assert.ok(r.blocks.some((b) => b.kind === "heading" && b.text === "Güç grafiği"));
    const planets = [...((a.technical as J).planets as J[])].sort((x, y) => x.rank - y.rank);
    const svg = await renderFigureSvg(ch.figure);
    const bars = [...svg.matchAll(/width="([\d.]+)" height="18" rx="5" fill="(#[0-9a-f]{6})" data-shadbala="(\w+)"/g)];
    assert.deepEqual(bars.map((m) => m[3]), planets.filter((p) => p.strengthRatio > 0).map((p) => p.id), "sıra = rank");
    const maxRatio = Math.max(...planets.map((p) => p.strengthRatio), 1.2);
    for (const m of bars) {
      const p = planets.find((x) => x.id === m[3])!;
      assert.equal(m[2], p.strengthRatio >= 1 ? "#34d399" : "#fda4af", `${p.id} rengi`);
      assert.ok(Math.abs(Number(m[1]) - (p.strengthRatio / maxRatio) * 646) < 0.02, `${p.id} uzunluğu oranla`);
      assert.ok(svg.includes(`>${p.strengthRatio.toFixed(2).replace(".", ",")}<`), `${p.id} değer (Türkçe ondalık)`);
    }
    const ext = [...docs.get("vedic.shadbala")!.docx.xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(ext.length === 1 && ext[0][0] > 5_500_000 && ext[0][0] <= 6_096_000 && ext[0][1] < ext[0][0], `Word görsel ${JSON.stringify(ext)}`);
  });
  await t("Dasha / Shadbala: eksik veri / yanlış şema → AÇIK not, görsel YOK (uydurma yok)", async () => {
    for (const [tech, field] of [["vedic.dasha", "periods"], ["kp.dasha", "periods"], ["vedic.shadbala", "planets"]] as const) {
      const a = (await full(saved.get(tech)!)) as J;
      for (const x of [{ ...a, technical: { ...a.technical, [field]: [] } }, { ...a, technical: { ...a.technical, schema: "astro.vedic.d1.v1" } }]) {
        const r = buildAstroReport(x as ReportAnalysisInput);
        assert.ok(!r.blocks.some((b) => b.kind === "chart"), `${tech}: grafik olmamalı`);
        assert.ok(r.blocks.some((b) => b.kind === "para" && b.tone === "warn" && b.text.startsWith("Harita bu kayıtta eksik teknik veri")), `${tech}: açık not`);
      }
    }
  });
  await t("yorum üretmeyen teknikler (Drishti / Ashtakavarga / KP transit): motor kaydıyla uyumlu; Word + PDF 'otomatik yorum bulunmuyor' der, sızma başlığı yok; diğer tekniklerde not YOK", async () => {
    const { NO_PROVIDER_INTERPRETATION, NO_PROVIDER_INTERPRETATION_NOTE } = await import("@/lib/astrology/noProviderInterp");
    for (const tech of TECHNIQUES) {
      const a = await full(saved.get(tech)!);
      const none = NO_PROVIDER_INTERPRETATION.has(tech);
      // Motor gerçeği: bu tekniklerde kayıtlı yorum katmanı yoktur; diğerlerinde (yetkili kayıt) vardır.
      assert.equal(a.interpretation.visible === true, !none, `${tech}: yorum katmanı ${none ? "olmamalı" : "olmalı"}`);
      const d = docs.get(tech)!;
      for (const x of [d.docx.text, norm(d.pdf.text)]) {
        assert.equal(x.includes(norm(NO_PROVIDER_INTERPRETATION_NOTE).slice(0, 60)), none, `${tech}: not`);
        if (none) assert.ok(!x.includes("Otomatik Yorum"), `${tech}: yorum başlığı olmamalı`);
      }
    }
  });
  await t("yorum türü satırı Word/PDF'te ekrandaki sekmeyle aynı (Otomatik Yorum / Teknik Açıklama / Olay Açıklamaları)", () => {
    const want: Record<string, string> = { "western.natal": "Bu bölüm: Otomatik Yorum", "kp.chart": "Bu bölüm: Teknik Açıklama", "vedic.shadbala": "Bu bölüm: Teknik Açıklama", "western.forecast": "Bu bölüm: Olay Açıklamaları", "vedic.dasha": "Bu bölüm: Otomatik Yorum" };
    for (const [tech, s2] of Object.entries(want)) {
      const d = docs.get(tech)!;
      assert.ok(d.docx.text.includes(s2) && norm(d.pdf.text).includes(s2), `${tech}: ${s2}`);
    }
  });
  // ── 2026-10-15 SATIŞ ÖNCESİ (son 3 iş — 1): Astrocartography + Local Space DÜNYA HARİTASI Word/PDF'te ───────────────
  {
    const Astronomy = await import("astronomy-engine");
    const LM = await import("@/app/admin/astroloji/_lib/locationMaps");
    const GEO = await import("@/app/admin/astroloji/_lib/geo");
    const norm360 = (x: number) => ((x % 360) + 360) % 360;
    const angDiff = (a: number, b2: number) => Math.abs(((a - b2 + 540) % 360) - 180);
    // Golden yanıtların doğum anı (istek gövdesi): 1990-07-15 14:30 UTC+3 → 11:30 UTC.
    const gmst = Astronomy.SiderealTime(Astronomy.MakeTime(new Date("1990-07-15T11:30:00Z"))) * 15;
    const acgA = await full(saved.get("western.astrocartography")!);
    const lsA = await full(saved.get("western.local_space")!);

    await t("ACG haritası: rapordaki hatlar EKRANDAKİ fonksiyonların aynısı (klasik 10 cisim × 4 açı; yol/renk/çizgi tipi birebir) + MC etiketleri + doğum işareti", async () => {
      const r = buildAstroReport(acgA);
      const ch = figOf(r)!;
      assert.equal(ch.figure.type, "acgMap");
      const tt = acgA.technical as J;
      const bodies = new Set((tt.bodies as J[]).map((x) => x.id).filter((id: string) => LM.CLASSICAL.has(id as never)));
      const screen = LM.acgMapLines(tt, bodies as never, new Set(LM.ACG_ANGLES));
      assert.deepEqual(ch.figure.lines, screen, "ekran hatlarıyla birebir");
      assert.equal(screen.length, bodies.size * 4, "10 cisim × 4 açı");
      assert.deepEqual(ch.figure.labels, LM.acgMcLabels(tt, bodies as never, new Set(LM.ACG_ANGLES)));
      const rv = (acgA.profile as J).revision;
      assert.deepEqual(ch.figure.markers, [{ key: "birth", lat: rv.latitude, lon: rv.longitude, label: `Doğum: ${rv.locationLabel}` }]);
      const svg = await renderFigureSvg(ch.figure);
      for (const l of screen) assert.ok(svg.includes(`d="${l.d}"`) && svg.includes(`data-map-line="${l.key}"`), `SVG'de hat yok: ${l.key}`);
      for (const id of bodies) assert.ok(svg.includes(`data-legend-body="${id}"`), `lejant: ${id}`);
      for (const a of LM.ACG_ANGLES) assert.ok(svg.includes(`data-legend-angle="${a}"`), `lejant açı: ${a}`);
      assert.ok(!/[︎️]/.test(svg), "görünüm seçicisi glif değildir (kutu olur)");
      assert.ok(r.blocks.some((b) => b.kind === "heading" && b.text === "Dünya haritası"));
    });

    await t("ACG doğruluk (bağımsız astronomi): her MC boylamı = RA − GMST (astronomy-engine); IC = MC+180°; haritada MC hattının x konumu bu boylam", () => {
      const tt = acgA.technical as J;
      for (const b of tt.bodies as J[]) {
        const want = GEO.normLon(b.rightAscension - gmst);
        assert.ok(angDiff(b.mcLongitude, want) < 0.05, `${b.id}: MC ${b.mcLongitude} ≠ ${want.toFixed(3)}`);
        assert.ok(angDiff(b.icLongitude, b.mcLongitude + 180) < 0.05, `${b.id}: IC karşıt değil`);
        const x = GEO.project(0, GEO.normLon(b.mcLongitude))[0];
        assert.ok(Math.abs(x - ((GEO.normLon(b.mcLongitude) + 180) / 360) * 1000) < 0.01, "eşdikdörtgen x");
        assert.ok(LM.acgMapLines(tt, new Set([b.id]), new Set(["mc"])).every((l) => l.d.startsWith(`M${x},`)), `${b.id}: MC hattı kendi boylamında`);
      }
    });

    await t("ACG doğruluk: AC/DC eğrisinin HER noktasında cisim ufukta (yükseklik ≈ 0°); AC'de doğuyor (doğu yarı), DC'de batıyor (batı yarı)", () => {
      const tt = acgA.technical as J;
      const rad = Math.PI / 180;
      let n = 0;
      for (const b of tt.bodies as J[]) {
        for (const [key, rising] of [["asc", true], ["dsc", false]] as const) {
          for (const [lat, lon] of b[key].points as [number, number][]) {
            const H = norm360(gmst + lon - b.rightAscension); // yerel saat açısı
            const sinAlt = Math.sin(lat * rad) * Math.sin(b.declination * rad) + Math.cos(lat * rad) * Math.cos(b.declination * rad) * Math.cos(H * rad);
            const alt = Math.asin(sinAlt) / rad;
            assert.ok(Math.abs(alt) < 0.6, `${b.id} ${key} (${lat}, ${lon}): yükseklik ${alt.toFixed(2)}°`);
            assert.equal(H > 180, rising, `${b.id} ${key} (${lat}, ${lon}): saat açısı ${H.toFixed(1)} (doğuş/batış tarafı)`);
            n++;
          }
        }
      }
      assert.ok(n > 500, `yeterli örnek nokta (${n})`);
    });

    await t("Local space haritası: hatlar ekrandakiyle birebir; her hat MERKEZDEN çıkar ve ilk yönü = azimut (büyük çember kerterizi); pusulada K üst / D sağ / G alt / B sol, çizgi açısı = azimut", async () => {
      const r = buildAstroReport(lsA);
      const ch = figOf(r)!;
      assert.equal(ch.figure.type, "localSpaceMap");
      const tt = lsA.technical as J;
      const bodies = new Set((tt.bodies as J[]).map((x) => x.id).filter((id: string) => LM.CLASSICAL.has(id as never)));
      assert.deepEqual(ch.figure.lines, LM.localSpaceMapLines(tt, bodies as never), "ekran hatlarıyla birebir");
      assert.equal(ch.figure.reference.lat, tt.reference.latitude);
      assert.equal(ch.figure.reference.lon, tt.reference.longitude);
      for (const b of tt.bodies as J[]) {
        const [p0, p1] = b.line as [number, number][];
        assert.ok(Math.abs(p0[0] - tt.reference.latitude) < 0.01 && angDiff(p0[1], tt.reference.longitude) < 0.01, `${b.id}: hat merkezden başlamıyor`);
        const brg = GEO.initialBearing(p0[0], p0[1], p1[0], p1[1]);
        assert.ok(angDiff(brg, b.azimuth) < 1, `${b.id}: kerteriz ${brg.toFixed(2)} ≠ azimut ${b.azimuth}`);
      }
      const svg = await renderFigureSvg(ch.figure);
      const m = /<circle cx="([\d.]+)" cy="([\d.]+)" r="140"/.exec(svg)!;
      const cx = Number(m[1]);
      const cy = Number(m[2]);
      const dir = (az: number) => [...svg.matchAll(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*data-compass="${az}"`, "g"))].map((x) => [Number(x[1]), Number(x[2])])[0];
      assert.ok(dir(0)[1] < cy && Math.abs(dir(0)[0] - cx) < 1, "K üstte");
      assert.ok(dir(90)[0] > cx && Math.abs(dir(90)[1] - cy) < 1, "D sağda");
      assert.ok(dir(180)[1] > cy, "G altta");
      assert.ok(dir(270)[0] < cx, "B solda");
      assert.ok(/>K</.test(svg) && />D</.test(svg) && />G</.test(svg) && />B</.test(svg));
      for (const b of (tt.bodies as J[]).filter((x) => bodies.has(x.id))) {
        const ln = new RegExp(`<line x1="${cx}" y1="${cy}" x2="([\\d.-]+)" y2="([\\d.-]+)"[^>]*data-ls-body="${b.id}"`).exec(svg)!;
        const az = norm360(Math.atan2(Number(ln[1]) - cx, cy - Number(ln[2])) / (Math.PI / 180));
        assert.ok(angDiff(az, b.azimuth) < 0.2, `${b.id}: pusula açısı ${az.toFixed(2)} ≠ ${b.azimuth}`);
        assert.equal(/stroke-dasharray/.test(ln[0]), !b.aboveHorizon, `${b.id}: ufuk altı kesikli`);
      }
    });

    await t("farklı doğum yeri / merkez + antimeridyen: haritalar değişir, işaretler yeni yerde; ±180° geçen hat bölünür (sahte yatay çizgi yok)", async () => {
      const a = structuredClone(acgA) as J;
      a.profile.revision = { ...a.profile.revision, latitude: -33.87, longitude: 151.21, locationLabel: "Sidney, Avustralya" };
      a.technical.bodies = a.technical.bodies.map((b: J) => ({ ...b, mcLongitude: GEO.normLon(b.mcLongitude + 150), icLongitude: GEO.normLon(b.icLongitude + 150), asc: { ...b.asc, points: b.asc.points.map(([la, lo]: number[]) => [la, GEO.normLon(lo + 150)]) }, dsc: { ...b.dsc, points: b.dsc.points.map(([la, lo]: number[]) => [la, GEO.normLon(lo + 150)]) } }));
      const fa = figOf(buildAstroReport(acgA))!.figure;
      const fb = figOf(buildAstroReport(a))!.figure;
      assert.deepEqual(fb.markers[0], { key: "birth", lat: -33.87, lon: 151.21, label: "Doğum: Sidney, Avustralya" });
      const pa = await renderFigurePng(fa);
      const pb = await renderFigurePng(fb);
      assert.ok(!("error" in pa) && !("error" in pb) && !pa.png.equals(pb.png), "farklı veri → farklı harita");
      assert.ok((fb.lines as J[]).some((l) => (l.d.match(/M/g) ?? []).length > 1), "±180° geçen eğri bölündü");
      for (const l of fb.lines as J[]) for (const seg of l.d.split("M").slice(1)) {
        const xs = seg.split("L").map((p2: string) => Number(p2.split(",")[0]));
        for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1]) < 500, `${l.key}: harita boyunca sahte yatay çizgi`);
      }
      const l2 = structuredClone(lsA) as J;
      l2.params = { ...(l2.params ?? {}), reference: { label: "New York, ABD" } };
      const f2 = figOf(buildAstroReport(l2))!.figure;
      assert.equal(f2.reference.label, "New York, ABD");
    });

    await t("ACG / Local space: eksik / bozuk veri → harita YOK, AÇIK not (yanlış yerleştirilmiş harita basılmaz)", () => {
      for (const a of [acgA, lsA]) {
        const x = a as J;
        const bad = [
          { ...x, technical: { ...x.technical, bodies: [] } },
          { ...x, technical: { ...x.technical, schema: "astro.western.natal.v1" } },
          { ...x, technical: { ...x.technical, bodies: x.technical.bodies.map((b: J, i: number) => (i === 0 ? { ...b, ...(x.technique === "western.local_space" ? { azimuth: Number.NaN } : { mcLongitude: "x" }) } : b)) } },
          { ...x, technical: { ...x.technical, bodies: x.technical.bodies.map((b: J, i: number) => (i === 0 ? { ...b, ...(x.technique === "western.local_space" ? { line: [[95, 10]] } : { asc: { ...b.asc, points: [[120, 10]] } }) } : b)) } },
        ];
        for (const y of bad) {
          const r = buildAstroReport(y as ReportAnalysisInput);
          assert.ok(!r.blocks.some((b) => b.kind === "chart"), `${x.technique}: bozuk veride harita olmamalı`);
          assert.ok(r.blocks.some((b) => b.kind === "para" && b.tone === "warn" && b.text.startsWith("Harita bu kayıtta eksik teknik veri")), `${x.technique}: açık not`);
        }
      }
    });

    await t("ACG / Local space Word + PDF: aynı PNG, sayfa genişliğinde; PDF'te başlık ve harita aynı sayfada; yeniden indirmede bayt bayt aynı görsel", async () => {
      for (const tech of ["western.astrocartography", "western.local_space"]) {
        const a = await full(saved.get(tech)!);
        const png = await renderFigurePng(figOf(buildAstroReport(a))!.figure);
        assert.ok(!("error" in png));
        if ("error" in png) return;
        const d1 = await get("expert", saved.get(tech)!, "exAI", "docx");
        const d2 = await get("expert", saved.get(tech)!, "exAI", "docx");
        const m1 = await mediaOf(d1.buf);
        assert.ok(m1.length === 1 && m1[0].equals(png.png) && (await mediaOf(d2.buf))[0].equals(png.png), `${tech}: Word görseli bu kaydın haritası ve yeniden indirmede aynı`);
        const ext = [...(await (await JSZip.loadAsync(d1.buf)).file("word/document.xml")!.async("string")).matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((x) => [Number(x[1]), Number(x[2])]);
        assert.ok(ext.length === 1 && ext[0][0] > 5_500_000 && ext[0][0] <= 6_096_000, `${tech}: Word'de sayfa genişliğinde ${JSON.stringify(ext)}`);
        const p = await get("expert", saved.get(tech)!, "exAI", "pdf");
        const doc = await getDocumentProxy(new Uint8Array(p.buf));
        let headPage = -1;
        let imgPage = -1;
        for (let i = 1; i <= doc.numPages; i++) {
          const pg = await doc.getPage(i);
          const tc = await pg.getTextContent();
          if (headPage < 0 && tc.items.some((it) => "str" in it && it.str === "Dünya haritası")) headPage = i;
          const ops = await pg.getOperatorList();
          if (imgPage < 0 && ops.fnArray.some((f) => f === 85 || f === 86)) imgPage = i; // paintImageXObject
        }
        assert.ok(headPage > 0 && headPage === imgPage, `${tech}: PDF başlık s.${headPage} / harita s.${imgPage}`);
      }
    });
  }

  await t("YENİ-P2-01: toplu rapor bayt kapısı — 4,2 MB altı geçer; üstü anlaşılır 413 REPORT_TOO_LARGE + önerilen analiz sayısı; istemci JSON'suz 413'te nedeni söyler", async () => {
    assert.equal(combinedReportTooLarge(COMBINED_REPORT_MAX_BYTES, 30), null);
    assert.equal(combinedReportTooLarge(2_416_071, 30), null, "ölçülen karışık 30 analiz (Word)");
    const r = combinedReportTooLarge(5_345_067, 30);
    assert.ok(r && !r.ok && r.status === 413, JSON.stringify(r));
    const b = (r as unknown as { body: { code: string; error: string } }).body;
    assert.equal(b.code, "REPORT_TOO_LARGE");
    assert.match(b.error, /~5,3 MB/);
    assert.match(b.error, /en çok yaklaşık 22 analiz/);
    const svc = readFileSync(join(__dirname, "..", "..", "lib/astrology/report/service.ts"), "utf8");
    assert.equal((svc.match(/combinedReportTooLarge\((buf|bytes)\.byteLength, items\.length\)/g) ?? []).length, 2, "Word ve PDF yolunda kapı");
    const api = readFileSync(join(__dirname, "..", "..", "app/admin/astroloji/_lib/api.ts"), "utf8");
    assert.ok(/res\.status === 413/.test(api), "istemci 413 mesajı");
  });

  restore();
  console.log(`\nastrology report8 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
