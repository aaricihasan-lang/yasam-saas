/**
 * F3B — Kademe B raporları (Refleksoloji, Kupa, Hacamat Word + PDF, Gökyüzü Atlası Word + PDF) için SENTETİK senaryolar.
 *
 *  - Refleksoloji + Hacamat: GERÇEK route handler (stub oturum + sahte db; ağ / Roxy / e-posta YOK) → rota kablolaması dahil.
 *  - Kupa + Atlas: rotaların çağırdığı GERÇEK kurucular (buildProtocolWordBuffer / buildCalendarPlanWordBuffer /
 *    renderAstroReportDocx / buildAstroReportPdf / renderHoraryReport) sabit girdiyle.
 *  - `branding` kurucuya / (rota senaryolarında) stub çözücüye aynen iletilir: regresyonda null → çıktı main ile BİREBİR olmalı.
 *  - Aynı dosya main çalışma ağacında da koşar (orada markalama parametresi yok sayılır).
 *
 * Veriler sentetiktir ("Ayşe Yılmaz", "Zeynep Kaya"); gerçek kullanıcı / danışan verisi YOK.
 */
import "./install";
import { enableRouteStubs } from "./install";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

enableRouteStubs();

export type BrandingLike = Record<string, unknown> | null;
export type CaseKind = "docx" | "pdf";
export type KademeBCase = {
  name: string;
  module: string;
  kind: CaseKind;
  /** Rapor kuralı: "signature" (Refleksoloji / Kupa / Atlas) · "named-by-form" (Hacamat, form adı dolu) · "none" (markalama uygulanmaz). */
  rule: "signature" | "named-by-form" | "none";
  /** Hacamat: formdaki serbest "Hazırlayan" adı (rapora aynen yazılır). */
  formName?: string | null;
  render: (branding: BrandingLike) => Promise<Buffer>;
};

const ROOT = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const imp = (rel: string): Promise<any> => import(pathToFileURL(path.join(ROOT, rel)).href);
type G = { __F3B?: unknown; __F3B_BRANDING?: unknown; __F3B_CALLS?: unknown[] };
const g = globalThis as G;

// ─── Sahte Supabase (yalnız okuma; .from().select().eq().in().order() / maybeSingle) ─────────────────────────────
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(t: string) {
      let rows = [...(tables[t] ?? [])];
      const res = () => ({ data: rows, error: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q; },
        in: (k: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[k])); return q; },
        order: (k: string) => { rows = rows.sort((a, b) => String(a[k]).localeCompare(String(b[k]))); return Promise.resolve(res()); },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, bad),
      };
      return q;
    },
  };
}

function session(db: unknown) {
  // Her istekte YENİ tenant → rota içi oran sınırı (tenant başına 15 / dk) senaryo sayısından etkilenmez.
  g.__F3B = { tenantId: randomUUID(), userId: "00000000-0000-4000-8000-0000000000a1", db, profile: { full_name: "Ayşe Yılmaz", role: "expert", module_permissions: {} } };
}

async function callRoute(handler: unknown, url: string, method: "GET" | "POST", body: unknown, branding: BrandingLike): Promise<Buffer> {
  const { NextRequest } = await import("next/server");
  g.__F3B_BRANDING = branding;
  const req = new NextRequest(url, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await (handler as (r: unknown) => Promise<Response>)(req);
  if (res.status !== 200) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── 1) Refleksoloji (rota) ────────────────────────────────────────────────────────────────────────────────────────
type Pt = [number, number];
const free = (id: string, pts: Pt[]) => ({ id, shape: "free_draw", points: pts.map(([x, y]) => ({ x, y })) });
const oval = (id: string, cx: number, cy: number) => ({ id, shape: "oval", cx, cy, rx: 0.05, ry: 0.05, angle: 0 });
const rect = (id: string, cx: number, cy: number) => ({ id, shape: "rect", cx, cy, rx: 0.05, ry: 0.04, angle: 0 });
const entry = (taban: { sol?: unknown[]; sag?: unknown[] }, yanIc: { sol?: unknown[]; sag?: unknown[] } = {}, yanDis: { sol?: unknown[]; sag?: unknown[] } = {}) => ({
  taban: { sol: taban.sol ?? [], sag: taban.sag ?? [] },
  yan_ic: { sol: yanIc.sol ?? [], sag: yanIc.sag ?? [] },
  yan_dis: { sol: yanDis.sol ?? [], sag: yanDis.sag ?? [] },
});
const ATLAS_DOC = {
  _meta: { version: "1", updated_at: "2026-01-01T00:00:00.000Z" },
  "Böbrek": entry({ sol: [free("f1", [[0.28, 0.55], [0.3, 0.6], [0.31, 0.64]])], sag: [free("f2", [[0.7, 0.55], [0.72, 0.6], [0.73, 0.64]])] }),
  "Kalp": entry({ sol: [oval("o1", 0.3, 0.42), oval("o2", 0.33, 0.45)] }),
  "Karaciğer": entry({ sag: [rect("r1", 0.68, 0.4), rect("r2", 0.72, 0.44)] }),
  "Mesane": entry({}, { sol: [rect("r3", 0.35, 0.6)] }),
};

async function reflexCases(): Promise<KademeBCase[]> {
  const protocolRoute = await imp("app/api/refleksoloji/protocol-report/route.ts");
  const atlasRoute = await imp("app/api/refleksoloji/atlas-report/route.ts");
  const T = "tenant-x";
  const P1 = "11111111-1111-4111-8111-111111111111";
  const P2 = "22222222-2222-4222-8222-222222222222";
  const protos: Row[] = [
    { id: P1, tenant_id: T, source_uid: null, title: "Sindirim Desteği", target_problem: "Sindirim rahatlığı için haftalık protokol.", organs: "Böbrek | Kalp | Karaciğer", application_notes: "Sabah uygulayın.\n\nİkinci paragraf: 10 dakika.", raw_json: null, created_at: "2026-05-01T10:00:00.000Z" },
    { id: P2, tenant_id: T, source_uid: null, title: "Uyku Düzeni", target_problem: null, organs: "Mesane | Kalp", application_notes: null, raw_json: null, created_at: "2026-06-01T10:00:00.000Z" },
  ];
  const db = () => {
    const d = fakeDb({ reflexology_protocols: protos, reflexology_atlas: [{ tenant_id: T, document: ATLAS_DOC }] });
    return d;
  };
  const run = async (handler: unknown, url: string, body: unknown, b: BrandingLike) => {
    session(db());
    (g.__F3B as { tenantId: string }).tenantId = T;
    return callRoute(handler, url, "POST", body, b);
  };
  return [
    { name: "refleks-protokol-tek", module: "Refleksoloji · Protokol (tek)", kind: "docx", rule: "signature", render: (b) => run(protocolRoute.POST, "http://localhost/api/refleksoloji/protocol-report", { exportMode: "single", protocolId: P1 }, b) },
    { name: "refleks-protokol-toplu", module: "Refleksoloji · Protokol (tümü)", kind: "docx", rule: "signature", render: (b) => run(protocolRoute.POST, "http://localhost/api/refleksoloji/protocol-report", { exportMode: "all" }, b) },
    { name: "refleks-atlas", module: "Refleksoloji · Kayıtlı Atlas", kind: "docx", rule: "signature", render: (b) => run(atlasRoute.POST, "http://localhost/api/refleksoloji/atlas-report", { exportMode: "all" }, b) },
  ];
}

// ─── 2) Kupa (kurucu) ──────────────────────────────────────────────────────────────────────────────────────────────
async function kupaCases(): Promise<KademeBCase[]> {
  const PW = await imp("lib/cupping/protocolWord.ts");
  const CW = await imp("lib/cupping/calendarWord.ts");
  const protocolInput = {
    protocol: { title: "Baş Ağrısı Protokolü — Şİğ Öçü", category: "Baş & Boyun", summary: "Kısa özet satırı.\nİkinci satır.", tags: ["migren", "gerilim"], preparation_note: "Uygulama öncesi hazırlık notu.", aftercare_note: "Uygulama sonrası dinlenme.", follow_up_note: "Bir hafta sonra takip." },
    points: [{ name: "Kâhil / İki Kürek Arası", note: "Ana bölge", extra: "Üst sırt" }],
    techniques: [{ name: "Sabit Kuru Kupa", note: "5 dakika", extra: null }],
    steps: [{ title: "Temizlik", body: "Bölgeyi temizle.\nAlkol uygula.", stage_label: "Hazırlık" }],
    safety: [{ name: "Gebelikte uygulanmaz", note: "Mutlak", extra: "Kontrendikasyon" }],
    entries: [{ title: "Geleneksel kullanım", content: "Bu bölge geleneksel olarak kullanılır.", source_label: "Kaynak A", locator: "s.42" }],
    sources: [{ name: "Örnek Kaynak — Hacamat", type_label: "Kitap", locator: "s.10", note: "birincil" }],
  };
  const plan = (over: Row = {}) => ({ id: "plan-1", tenant_id: "t-1", name: "Örnek Hacamat Takvimi", year: 2026, description: "Sentetik", advice_template_id: null, is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over });
  const day = (date: string, over: Row = {}) => ({ id: `d-${date}`, tenant_id: "t-1", plan_id: "plan-1", gregorian_date: date, selection_source: "manual", user_label: null, note: null, color_key: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over });
  const days = [
    day("2026-09-09", { color_key: "yellow", user_label: "Sabah seansı", note: "Uzmanın detaylı metni.\nİkinci satır." }),
    day("2026-09-10", { color_key: "green", user_label: "Şşğ İıçö" }),
    day("2026-09-23", { color_key: "red", note: "Yalnız detay notu." }),
  ];
  const tpl = { id: "tpl-1", tenant_id: "t-1", title: "Genel Bilgilendirme", before_text: "Öncesinde hafif beslenin.", after_text: "Sonrasında dinlenin.", general_note: "Su tüketimine dikkat edin.", is_default: true, is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
  const many = Array.from({ length: 40 }, (_, i) => day(`2026-${String(1 + Math.floor(i / 4)).padStart(2, "0")}-${String(3 + (i % 4) * 6).padStart(2, "0")}`, { color_key: "blue", user_label: `Seans ${i + 1}`, note: i % 5 === 0 ? "Not satırı." : null }));
  return [
    { name: "kupa-protokol", module: "Kupa · Protokol", kind: "docx", rule: "signature", render: (b) => PW.buildProtocolWordBuffer({ ...protocolInput, branding: b }) },
    { name: "kupa-takvim-yillik", module: "Kupa · Takvim (yıllık, tek A3)", kind: "docx", rule: "signature", render: (b) => CW.buildCalendarPlanWordBuffer({ plan: plan({ advice_template_id: "tpl-1" }), days, template: tpl, branding: b }) },
    { name: "kupa-takvim-yillik-tasma", module: "Kupa · Takvim (yıllık, A3 + A4 devam)", kind: "docx", rule: "signature", render: (b) => CW.buildCalendarPlanWordBuffer({ plan: plan({ advice_template_id: "tpl-1" }), days: many, template: tpl, branding: b }) },
    { name: "kupa-takvim-aylik", module: "Kupa · Takvim (aylık A4)", kind: "docx", rule: "signature", render: (b) => CW.buildCalendarPlanWordBuffer({ plan: plan({ advice_template_id: "tpl-1" }), days, template: tpl, month: 9, branding: b }) },
  ];
}

// ─── 3) Hacamat (rota; Word + PDF) ────────────────────────────────────────────────────────────────────────────────
export const HACAMAT_FORM_NAME = "Uzm. Zeynep Kaya (form)";
async function hacamatCases(): Promise<KademeBCase[]> {
  const word = await imp("app/api/hacamat/word-report/route.ts");
  const pdf = await imp("app/api/hacamat/pdf-report/route.ts");
  const body = (expertName: string) => ({
    year: 2026, month: 10, title: "HACAMAT TAKVİMİ", expertName,
    expertNotes: "Seans öncesi 3 saat aç kalın.\nSonrasında bol su için.",
    rules: [
      { rule_text: "Seans öncesi hafif beslenin.", category: "before" },
      { rule_text: "Seans sonrası 24 saat ağır egzersiz yapmayın.", category: "after" },
    ],
  });
  const post = async (h: unknown, url: string, b: BrandingLike, name: string) => { session(fakeDb({})); return callRoute(h, url, "POST", body(name), b); };
  const get = async (h: unknown, url: string, b: BrandingLike) => { session(fakeDb({})); return callRoute(h, url, "GET", undefined, b); };
  return [
    { name: "hacamat-word-form-adli", module: "Hacamat · Word (form adı dolu)", kind: "docx", rule: "named-by-form", formName: HACAMAT_FORM_NAME, render: (b) => post(word.POST, "http://localhost/api/hacamat/word-report", b, HACAMAT_FORM_NAME) },
    { name: "hacamat-word-form-adsiz", module: "Hacamat · Word (form adı boş)", kind: "docx", rule: "none", formName: "", render: (b) => post(word.POST, "http://localhost/api/hacamat/word-report", b, "") },
    { name: "hacamat-word-get", module: "Hacamat · Word (GET, mobil)", kind: "docx", rule: "none", render: (b) => get(word.GET, "http://localhost/api/hacamat/word-report?year=2026&month=10", b) },
    { name: "hacamat-pdf-form-adli", module: "Hacamat · PDF (form adı dolu)", kind: "pdf", rule: "named-by-form", formName: HACAMAT_FORM_NAME, render: (b) => post(pdf.POST, "http://localhost/api/hacamat/pdf-report", b, HACAMAT_FORM_NAME) },
    { name: "hacamat-pdf-form-adsiz", module: "Hacamat · PDF (form adı boş)", kind: "pdf", rule: "none", formName: "", render: (b) => post(pdf.POST, "http://localhost/api/hacamat/pdf-report", b, "") },
    { name: "hacamat-pdf-get", module: "Hacamat · PDF (GET, mobil)", kind: "pdf", rule: "none", render: (b) => get(pdf.GET, "http://localhost/api/hacamat/pdf-report?year=2026&month=10", b) },
  ];
}

// ─── 4) Gökyüzü Atlası (kurucu; Word + PDF aynı model) ───────────────────────────────────────────────────────────
async function atlasCases(): Promise<KademeBCase[]> {
  const D = await imp("lib/astrology/report/docx.ts");
  const P = await imp("lib/astrology/report/pdf.ts");
  const F = await imp("lib/astrology/report/symbolFontData.ts");
  const PNG = await imp("lib/astrology/report/chartPng.ts");
  const H = await imp("lib/astrology/horary/westernReport.ts");
  const HS = await imp("lib/astrology/horary/westernReportService.ts");
  const RUN = await imp("lib/astrology/horary/westernRun.ts");
  const fontB64 = readFileSync(path.join(ROOT, "public", "fonts", "Geist-Regular.ttf")).toString("base64");
  const IST = { label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
  const run = RUN.runWesternHorary({ date: "2026-10-29", time: "14:30", place: IST, quesitedHouse: 7 });
  if (!run.ok) throw new Error("horary fixture");
  const R = run.result;
  const GEN = "2026-10-29T12:00:00.000Z";
  const saved = { title: "Ortaklık sorusu", clientLabel: "Zeynep Kaya", methodologyVersion: "horary-western-1", savedAt: "2026-10-29T12:00:00.000Z" };
  // Sentetik toplu rapor (kayıtlı analiz rotası ile aynı işleyiciler): iki bölüm + sayfa sonu + iki çark.
  const wheel = H.horaryWheelInput(R);
  const chart = PNG.renderWheelPng(wheel, 1000);
  const combined = {
    title: "Zeynep Kaya — Seçili analizler",
    cover: { client: "Zeynep Kaya", analysisDate: "10.11.2026", tradition: "Batı", technique: "Seçili analizler (2)", options: "—", dateLabel: "Rapor tarihi" },
    blocks: [
      { kind: "heading", level: 1, text: "1. Natal Harita" },
      { kind: "para", text: "Bu bölüm sentetik bir rapor gövdesidir.\nİkinci satır." },
      { kind: "chart", chart: wheel, caption: "Natal çark" },
      { kind: "kv", rows: [["Gelenek", "Batı"], ["Ev sistemi", "Placidus"]] },
      { kind: "table", table: { columns: ["Gezegen", "Burç", "Derece", "Ev"], rows: [["Güneş", "Akrep", "6°12′", "8"], ["Ay", "Yengeç", "14°03′", "4"]] }, caption: "Gezegen konumları" },
      { kind: "pagebreak" },
      { kind: "heading", level: 1, text: "2. Transit" },
      { kind: "bullets", items: ["Satürn karesi Güneş (sentetik).", "Jüpiter üçgeni Ay (sentetik)."] },
      { kind: "para", text: "Uyarı metni (sentetik).", tone: "warn" },
      { kind: "chart", chart: wheel, caption: "Transit çark" },
      { kind: "para", text: "Bitiş notu.", tone: "muted" },
    ],
    fileBase: "Zeynep-Kaya-Secili-Analizler",
    hasInterpretation: false,
    hasChart: true,
  };
  const charts = [chart, chart];
  return [
    { name: "atlas-toplu-word", module: "Gökyüzü Atlası · Toplu analiz (Word)", kind: "docx", rule: "signature", render: async (b) => D.renderAstroReportDocx(combined, charts.map((c) => c?.png ?? null), F.symbolFontBuffers(), { branding: b }) },
    { name: "atlas-toplu-pdf", module: "Gökyüzü Atlası · Toplu analiz (PDF)", kind: "pdf", rule: "signature", render: async (b) => Buffer.from(P.buildAstroReportPdf(combined, charts, fontB64, F.symbolFontsBase64(), { branding: b })) },
    { name: "atlas-horary-word", module: "Gökyüzü Atlası · Horary kayıtlı (Word)", kind: "docx", rule: "signature", render: async (b) => Buffer.from((await HS.renderHoraryReport(R, "docx", { question: null, demo: false, generatedAt: GEN, saved, branding: b })).bytes) },
    { name: "atlas-horary-pdf", module: "Gökyüzü Atlası · Horary kayıtlı (PDF)", kind: "pdf", rule: "signature", render: async (b) => Buffer.from((await HS.renderHoraryReport(R, "pdf", { question: null, demo: false, generatedAt: GEN, saved, branding: b })).bytes) },
    { name: "atlas-horary-demo-pdf", module: "Gökyüzü Atlası · Horary DEMO + soru (PDF)", kind: "pdf", rule: "signature", render: async (b) => Buffer.from((await HS.renderHoraryReport(R, "pdf", { question: "Bu ortaklık teklifi gerçekleşecek mi?", demo: true, generatedAt: GEN, branding: b })).bytes) },
  ];
}

export async function allKademeBCases(): Promise<KademeBCase[]> {
  return [...(await reflexCases()), ...(await kupaCases()), ...(await hacamatCases()), ...(await atlasCases())];
}

/** Rota senaryolarında stub çözücüye yapılan çağrılar (purpose / sahip denetimi için). */
export function brandingCalls(): { owner: unknown; account: unknown; opts: unknown }[] {
  return (g.__F3B_CALLS ?? []) as { owner: unknown; account: unknown; opts: unknown }[];
}
export function resetBrandingCalls(): void {
  g.__F3B_CALLS = [];
}
export function currentSession(): { tenantId: string; userId: string } | null {
  return (g.__F3B as { tenantId: string; userId: string } | undefined) ?? null;
}
