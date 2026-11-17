/**
 * F3A — Kademe A Word raporları için SENTETİK rapor senaryoları (DB / ağ / Roxy YOK).
 *
 * Her senaryo, gerçek üretici fonksiyonu (route'ların çağırdığı kurucu) sabit tarih/saat ve
 * sentetik girdiyle çağırır. `branding` parametresi kurucuya aynen iletilir:
 *   - regresyon: `null` → çıktı bugünkü (main) çıktıyla normalize XML düzeyinde BİREBİR aynı olmalı;
 *   - örnek üretimi: sentetik "Ayşe Yılmaz" profili (gerçek kişi/marka DEĞİL).
 * Gerçek kullanıcı/danışan verisi YOK.
 */
import Module from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Packer } from "docx";
import type { ExpertBranding, ExpertBrandingVariant } from "@/lib/docx/expertBranding";

const ROOT = process.cwd();
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

export type BrandingArgs = { branding: ExpertBranding | null; brandingVariant?: ExpertBrandingVariant };
export type ReportCase = { name: string; module: string; render: (b: BrandingArgs) => Promise<Buffer> };

const NOW = new Date("2026-11-10T09:30:00.000Z");
const ysLogo = () => readFileSync(path.join(ROOT, "public/assets/yasam-sistemi-chart-logo.png"));

// ─── 1) Danışan Yolculuğu ────────────────────────────────────────────────────
async function dyCases(): Promise<ReportCase[]> {
  const B = await import("@/app/api/clients/[id]/word-report/clientReportBuilder");
  const { makeDataset } = await import("../wt7/fixtures");
  const ctx = (b: BrandingArgs) => ({ now: NOW, expertName: "Ayşe Yılmaz", logo: ysLogo(), branding: b.branding, brandingVariant: b.brandingVariant });
  const d1 = makeDataset(1, { rich: false });
  const d2 = makeDataset(2, { rich: false });
  return [
    { name: "dy-tam", module: "Danışan Yolculuğu · Tam Rapor", render: async (b) => Packer.toBuffer(B.buildClientFullReport({ data: d1, profileImg: null }, ctx(b)).doc) },
    { name: "dy-tam-uzmansiz", module: "Danışan Yolculuğu · Tam Rapor (profil adı yok)", render: async (b) => Packer.toBuffer(B.buildClientFullReport({ data: d1, profileImg: null }, { ...ctx(b), expertName: null }).doc) },
    { name: "dy-sekme-genel", module: "Danışan Yolculuğu · Sekme", render: async (b) => Packer.toBuffer(B.buildClientTabReport({ tab: "genel", client: d1.client, notes: d1.notes, rows: [] }, ctx(b)).doc) },
    { name: "dy-tek-analiz", module: "Danışan Yolculuğu · Tek Analiz", render: async (b) => Packer.toBuffer(B.buildClientSingleAnalysisReport({ client: d1.client, notes: d1.notes, analysis: d1.analyses[0]!, imageBuf: null }, ctx(b)).doc) },
    { name: "dy-tarih-araligi", module: "Danışan Yolculuğu · Tarih Aralığı", render: async (b) => Packer.toBuffer(B.buildClientDateRangeReport({ data: B.filterClientDatasetByRange(d1, "2026-09-01", "2026-09-30"), drStart: "2026-09-01", drEnd: "2026-09-30", profileImg: null }, ctx(b)).doc) },
    { name: "dy-toplu", module: "Danışan Yolculuğu · Toplu", render: async (b) => Packer.toBuffer(B.buildClientsBulkFullReport([{ data: d1, profileImg: null }, { data: d2, profileImg: null }], ctx(b)).doc) },
  ];
}

// ─── 2) Numeroloji analiz (Bilgi Bankası) ────────────────────────────────────
async function nkbCases(): Promise<ReportCase[]> {
  const W = await import("@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild");
  const { hesaplaNumeroloji } = await import("@/lib/numeroloji/numerolojiMotor");
  const motor = hesaplaNumeroloji({ firstName: "Ayşe", lastName: "YILMAZ", birthDate: "15.03.1990" });
  const row = { id: "r1", name: "Ayşe", surname: "YILMAZ", birth_date: "15.03.1990", created_at: "2026-01-01T10:00:00Z", analysis_data: { version: 1, motor, summary: "Sentetik özet." } };
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] } as unknown as Parameters<typeof W.buildNumerolojiWordChildren>[2];
  const sections = { summary: true, plain: true, detailed: false, tas: false } as Parameters<typeof W.buildNumerolojiWordChildren>[1];
  const render = async (b: BrandingArgs, rows: unknown[]) => {
    const { children } = W.buildNumerolojiWordChildren(rows as never, sections, shared, new Map(), null, NOW, false, { branding: b.branding, brandingVariant: b.brandingVariant });
    return W.packNumerolojiDocx(children, "Ayşe YILMAZ", { expertName: "Ayşe Yılmaz", branding: b.branding, brandingVariant: b.brandingVariant });
  };
  return [
    { name: "nkb-tek", module: "Numeroloji Analiz Raporu", render: (b) => render(b, [row]) },
    { name: "nkb-iki-kisi", module: "Numeroloji Analiz Raporu (2 kişi)", render: (b) => render(b, [row, { ...row, id: "r2", name: "Zeynep", surname: "KAYA" }]) },
  ];
}

// ─── 3) Klasik Numeroloji ────────────────────────────────────────────────────
async function klasikCases(): Promise<ReportCase[]> {
  const K = await import("@/lib/numeroloji-klasik/report/docx");
  const F = await import("../numeroloji-klasik/report/fixtures");
  const common = (b: BrandingArgs) => ({ generatedAt: F.GEN_AT, expertName: "Ayşe Yılmaz", branding: b.branding, brandingVariant: b.brandingVariant });
  return [
    { name: "klasik-kisi-tam", module: "Klasik Numeroloji · Kişi (tam)", render: (b) => K.buildPersonReport(F.PERSON_RECORD, { variant: "full", stones: F.STONES, ...common(b) }) },
    { name: "klasik-uyum", module: "Klasik Numeroloji · Uyum", render: (b) => K.buildRelationshipReport(F.RELATIONSHIP_RECORD, common(b)) },
    { name: "klasik-isletme", module: "Klasik Numeroloji · İşletme", render: (b) => K.buildBusinessReport(F.BUSINESS_RECORD, common(b)) },
    { name: "klasik-isimler", module: "Klasik Numeroloji · İsim Adayları", render: (b) => K.buildNamesReport(F.NAMES_RECORD, common(b)) },
    { name: "klasik-taslar", module: "Klasik Numeroloji · Doğaltaş", render: (b) => K.buildStonesReport(F.PERSON_RECORD, F.STONES, common(b)) },
    { name: "klasik-karsilastirma", module: "Klasik Numeroloji · Karşılaştırma", render: (b) => K.buildComparisonReport(F.COMPARISON, common(b)) },
  ];
}

// ─── 4) Human Design profesyonel v2 ─────────────────────────────────────────
async function hdCases(): Promise<ReportCase[]> {
  const { normalizeRoxyBodygraph } = await import("@/lib/human-design/providers/roxy/normalize");
  const { validateRoxyBodygraph } = await import("@/lib/human-design/providers/roxy/schema");
  const { extractSystemReading } = await import("@/lib/human-design/providers/roxy/systemReading");
  const V2 = await import("@/lib/human-design/reporting/reportSnapshotV2");
  const { renderHdReportV2Buffer } = await import("@/lib/human-design/reporting/wordReportV2");
  const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
  const v = validateRoxyBodygraph(FIXTURE);
  if (!v.ok) throw new Error("HD fixture geçersiz");
  const n = normalizeRoxyBodygraph(v.value, {
    date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48,
    nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
  });
  if (!n.ok) throw new Error("HD normalize başarısız");
  const client = { name: "Deneme Danışan Örnekoğlu", birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "Selçuklu, Konya, Türkiye", timezone: "Europe/Istanbul" };
  type Snap = Parameters<typeof renderHdReportV2Buffer>[0];
  const build = (extra: Record<string, unknown>) =>
    ({
      ...V2.buildReportSnapshotV2({
        generatedAt: "2026-11-10T09:00:00.000Z", chartId: "ch-ornek", source: "computed", provider: "roxyapi", client,
        codes: n.codes, computed: n.chart, requested: "system", systemReadingPermitted: true, systemReading: extractSystemReading(FIXTURE),
        expertRecords: [] as never, bodygraph: { status: "missing" }, chartImage: null,
      }),
      ...extra,
    }) as Snap;
  const legacy = () => { const s = build({}) as Record<string, unknown>; delete s.layout; delete s.preparedBy; return s as Snap; };
  const opts = (b: BrandingArgs) => ({ bodygraphImage: null, logo: ysLogo(), expertName: null, branding: b.branding, brandingVariant: b.brandingVariant });
  return [
    { name: "hd-pro1-hazirlayan", module: "Human Design Profesyonel (hazırlayan dolu)", render: (b) => renderHdReportV2Buffer(build({ preparedBy: "Ayşe Yılmaz" }), opts(b)) },
    { name: "hd-pro1-hazirlayansiz", module: "Human Design Profesyonel (hazırlayan boş)", render: (b) => renderHdReportV2Buffer(build({ preparedBy: null }), opts(b)) },
    { name: "hd-eski-duzen", module: "Human Design (eski düzen)", render: (b) => renderHdReportV2Buffer(legacy(), opts(b)) },
  ];
}

// ─── 5) Human Design ilişki / grup ──────────────────────────────────────────
async function hdRelCases(): Promise<ReportCase[]> {
  const { fakeConnectionResponse, fakePentaResponse, PEOPLE } = await import("../hd-relations/fakeRelationRoxy");
  const { validateRoxyConnection } = await import("@/lib/human-design/relations/connection");
  const { validateRoxyPenta } = await import("@/lib/human-design/relations/penta");
  const { renderRelationReportBuffer } = await import("@/lib/human-design/relations/relationReport");
  type Snap = Parameters<typeof renderRelationReportBuffer>[0];
  const vc = validateRoxyConnection(fakeConnectionResponse(PEOPLE[0]!, PEOPLE[1]!, { lang: "tr" }));
  const vp = validateRoxyPenta(fakePentaResponse(PEOPLE.slice(0, 4)), 4);
  if (!vc.ok || !vp.ok) throw new Error("ilişki fixture geçersiz");
  const NAMES = ["Ayşe Örnek", "Mehmet Örnek", "Zeynep Kaya", "Can Demir"];
  const participant = (i: number) => ({
    position: i, clientId: null, name: NAMES[i]!, sourceChartId: null, status: "current" as const,
    birthDate: PEOPLE[i]!.date, birthTime: PEOPLE[i]!.time.slice(0, 5), birthPlace: "İstanbul, Türkiye",
  });
  const snap = (kind: "connection" | "penta", preparedBy: string | null): Snap => ({
    schema: "hd-relation-report-1",
    generatedAt: "2026-11-10T09:00:00.000Z",
    analysis: {
      id: "00000000-0000-4000-8000-0000000000aa", kind, memberCount: kind === "connection" ? 2 : 4,
      relationType: null, createdAt: "2026-11-09T09:00:00.000Z",
      participants: (kind === "connection" ? [0, 1] : [0, 1, 2, 3]).map(participant),
      result: kind === "connection" ? vc.value : vp.value,
    },
    sections: { analysis: null, knowledge: null, expertComment: null },
    preparedBy,
    image: { status: "unavailable", reason: null, source: "scene" },
  }) as unknown as Snap;
  const opts = (b: BrandingArgs) => ({ image: null, logo: ysLogo(), branding: b.branding, brandingVariant: b.brandingVariant });
  return [
    { name: "hd-iliski-hazirlayan", module: "HD İlişki (Connection) · hazırlayan dolu", render: (b) => renderRelationReportBuffer(snap("connection", "Ayşe Yılmaz"), opts(b)) },
    { name: "hd-iliski-hazirlayansiz", module: "HD İlişki (Connection) · hazırlayan boş", render: (b) => renderRelationReportBuffer(snap("connection", null), opts(b)) },
    { name: "hd-grup-hazirlayan", module: "HD Grup (Penta) · hazırlayan dolu", render: (b) => renderRelationReportBuffer(snap("penta", "Ayşe Yılmaz"), opts(b)) },
  ];
}

// ─── 6) Beslenme ─────────────────────────────────────────────────────────────
async function beslenmeCases(): Promise<ReportCase[]> {
  const P = await import("@/lib/beslenme/word/planDocxBuilder");
  type Tree = Parameters<typeof P.buildPlanDocxFromTree>[0];
  const N = (code: string, amount: number, unit = "g") => ({ nutrient_code: code, amount, unit_code: unit });
  const item = (id: string, name: string, grams: number, kcal: number) => ({
    id, food_name_snapshot: name, quantity: null, portion_label_snapshot: null, grams, sort_order: 0,
    nutrients: [N("protein", 6.5), N("carbohydrate", 12.25), N("total_fat", 3.1), N("energy", kcal, "kcal")],
  });
  const tree = (b: BrandingArgs, expertName: string | null): Tree => ({
    plan: { id: "p1", title: "Haftalık Denge Planı", note: "Sentetik plan notu.", start_date: "2026-11-10", end_date: "2026-11-11", daily_energy_target: 1800, status: "active", revision_number: 2 },
    recipientName: "Zeynep Kaya",
    expertName,
    logo: ysLogo(),
    branding: b.branding,
    brandingVariant: b.brandingVariant,
    days: ["2026-11-10", "2026-11-11"].map((d, di) => ({
      id: `d${di}`, plan_date: d, energy_target_override: null, note: null,
      meals: [
        { id: `m${di}a`, meal_type: null, label: "Kahvaltı", sort_order: 0, items: [item(`i${di}1`, "Yulaf Ezmesi", 40, 389), item(`i${di}2`, "Süt", 200, 47)] },
        { id: `m${di}b`, meal_type: null, label: "Öğle", sort_order: 1, items: [item(`i${di}3`, "Mercimek Çorbası", 250, 56)] },
      ],
    })),
  }) as Tree;
  const run = async (t: Tree) => { const r = await P.buildPlanDocxFromTree(t); if (!r.ok) throw new Error("beslenme"); return r.buffer; };
  return [
    { name: "beslenme-plan", module: "Beslenme Planı", render: (b) => run(tree(b, "Ayşe Yılmaz")) },
    { name: "beslenme-plan-uzmansiz", module: "Beslenme Planı (profil adı yok)", render: (b) => run(tree(b, null)) },
  ];
}

export async function allReportCases(): Promise<ReportCase[]> {
  return [
    ...(await dyCases()),
    ...(await nkbCases()),
    ...(await klasikCases()),
    ...(await hdCases()),
    ...(await hdRelCases()),
    ...(await beslenmeCases()),
  ];
}
