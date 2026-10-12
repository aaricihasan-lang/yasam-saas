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
import { readFileSync, readdirSync } from "node:fs";
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
import { buildWheelSvg } from "@/lib/astrology/report/wheelSvg";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { __resetRateLimitStore } from "@/lib/rateLimit";

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
const GOLDEN: { name: string; endpoint: string; body: J; response: J }[] = readdirSync(DIR)
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
  callProvider: async (_c, endpoint, body) => {
    providerCalls.push({ endpoint, body });
    if (endpoint === "/astrology/natal-chart") return { ok: true, raw: structuredClone(NATAL), attempts: 1 };
    const cands = GOLDEN.filter((g) => g.endpoint === endpoint);
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
  "western.synastry", "western.composite", "western.astrocartography", "western.relocation", "western.local_space",
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

  await t("model: harita görseli yalnız sistemin kendi çarkı olan tekniklerde (natal, return, composite, relocation); diğerleri görselsiz", async () => {
    const withChart = new Set(["western.natal", "western.solar_return", "western.lunar_return", "western.composite", "western.relocation"]);
    for (const tech of TECHNIQUES) {
      const r = buildAstroReport(await full(saved.get(tech)!));
      assert.equal(r.hasChart, withChart.has(tech), tech);
    }
    const r = buildAstroReport(await full(saved.get("western.natal")!));
    const ch = r.blocks.find((b) => b.kind === "chart") as J;
    const svg = buildWheelSvg(ch.chart);
    assert.ok(svg.startsWith("<svg") && svg.includes(">Gü<") && svg.includes(">Koç<") && svg.includes(">ASC<"));
    assert.ok(!/[☉☽♈♉]/.test(svg), "glif (fontta yok) kullanılmamalı");
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

  await t("harita görseli: natal/return/composite/relocation Word'de PNG gömülü + PDF'te görsel; KP/Vedik/transit görselsiz çalışır", async () => {
    for (const tech of ["western.natal", "western.solar_return", "western.composite", "western.relocation"]) assert.equal(docs.get(tech)!.docx.media.length, 1, tech);
    for (const tech of ["kp.chart", "vedic.d1", "western.transit"]) assert.equal(docs.get(tech)!.docx.media.length, 0, tech);
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
    assert.ok(n.docx.text.includes("Roxy otomatik yorumu"));
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
        assert.ok(!text.includes("Roxy otomatik yorumu"), `${tech} ${fmt}: yorum başlığı sızdı`);
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
          assert.ok(!text.includes("Roxy otomatik yorumu") && !text.includes("Güçlü yan") && !text.includes("Zorluk:"), `${tech} ${fmt}`);
        }
      }
    } finally {
      setPerms(U.exAI, { astrology: true, astrology_provider_interp: true });
    }
  });

  await t("doğrudan API + önbellek: aynı analiz yorumlu indirildikten HEMEN sonra yetki kalkınca yorumsuz (önbellek yok, no-store)", async () => {
    const id = saved.get("western.natal")!;
    const a = await get("expert", id, "exAI", "docx");
    assert.ok((await docxText(a.buf)).text.includes("Roxy otomatik yorumu"));
    assert.equal(a.headers.get("cache-control"), "no-store, private");
    setPerms(U.exAI, { astrology: true });
    try {
      const b = await get("expert", id, "exAI", "docx");
      assert.ok(!(await docxText(b.buf)).text.includes("Roxy otomatik yorumu"));
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
  await t("mobil: Android tarayıcı + Android uygulama WebView'i → Word ve PDF 403 (dosya üretilmez); yetkisiz Android → 404 (varlık sızmaz); iOS/masaüstü 200", async () => {
    const id = saved.get("western.natal")!;
    for (const ua of [ANDROID, WEBVIEW]) {
      for (const fmt of ["docx", "pdf"]) {
        const r = await get("expert", id, "exAI", fmt, "", ua);
        assert.equal(r.status, 403, `${fmt} ${ua.slice(0, 30)}`);
        assert.match(r.json().error, /bu cihazda kullanılamıyor/);
        assert.equal((await get("expert", id, "exNone", fmt, "", ua)).status, 404);
        assert.equal((await get("expert", id, "anon", fmt, "", ua)).status, 404);
      }
    }
    assert.equal((await get("expert", id, "exAI", "pdf", "", IOS)).status, 200);
  });

  await t("mobil UI: düğmeler Android'de render edilmez + SSR no-android + telefon genişliğinde gizli; masaüstünde görünür", () => {
    const src = readFileSync(join(ROOT, "app/admin/astroloji/_components/SavedAnalyses.tsx"), "utf8");
    const block = src.slice(src.indexOf("function ReportButtons"));
    assert.ok(block.includes("const isAndroid = useIsAndroid();") && block.includes("if (isAndroid) return null;"));
    assert.ok(block.includes('"no-android hidden md:inline-flex'));
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
    assert.ok((await docxText(a.buf)).text.includes("Roxy otomatik yorumu"));
    const b = await get("admin", id, "owner", "pdf", "&previewNoInterp=1");
    assert.ok(!norm((await pdfText(b.buf)).text).includes("Roxy otomatik yorumu"));
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

  restore();
  console.log(`\nastrology report8 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
