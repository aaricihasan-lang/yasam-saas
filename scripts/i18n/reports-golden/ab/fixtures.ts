/**
 * I18N rapor golden (grup A+B) — SABİT, SENTETİK fikstürler (gerçek danışan/uzman verisi YOK; DB/ağ YOK).
 *
 * Üreticiler: P01 Danışan Yolculuğu Word (tam/özel/sekme/tek analiz/tarih aralığı), P02 Danışan toplu Word,
 * P03 Anamnez PDF (boş + dolu), P07 Ajanda Word (route), P26 Ürün/Stok Word (route).
 *
 * Kullanıcı içeriği alanlarına Türkçe karakterli NÖBETÇİ metinler konur (⟦KULLANICI…⟧). EN belgede bu metinler
 * AYNEN kalmalıdır; EN belgede kalan diğer Türkçe metinler sistem sızıntısıdır.
 *
 * Çalışma kipleri:
 *   base → bugünkü (parametresiz) çağrı: route'ta çerez YOK + yayın kapısı kapalı; lib'de `output` verilmez.
 *   tr   → açık Türkçe: route'ta kapı AÇIK + NEXT_LOCALE=tr; lib'de output = reportLocaleFor("tr").
 *   en   → kapı AÇIK + NEXT_LOCALE=en; lib'de output = reportLocaleFor("en").
 * Hesap tercihi tablosu (user_locale_prefs) sahte DB'de boş → çerez kararı geçerli.
 */
import { NextRequest } from "next/server";
import { Packer, type Document } from "docx";
import type { ReportLocale } from "@/lib/i18n/reportLocale";

export type Mode = "base" | "tr" | "en";
export type Built = { buffer: Buffer; filename: string | null };
export type Fixture = { name: string; producer: string; kind: "docx" | "pdf"; run: (mode: Mode) => Promise<Built> };

export const USER_MARK = "⟦KULLANICI";
const U = (s: string) => `⟦KULLANICI ${s}⟧`;

const TENANT = "00000000-0000-4000-8000-0000000000ab";
const USER_ID = "00000000-0000-4000-8000-0000000000ba";
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ─── Sahte Supabase istemcisi (yalnız okuma; eq/in filtre + range sayfalama) ───
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
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
  return { from, storage: { from: () => ({ download: async () => ({ data: null, error: { message: "yok" } }) }) } };
}

function setGuard(tables: Record<string, Row[]>): void {
  (globalThis as Record<string, unknown>).__RAB_GUARD__ = {
    ok: true,
    db: fakeDb(tables),
    tenantId: TENANT,
    userId: USER_ID,
    email: "zz.rapor.ab@example.test",
    is_demo_account: false,
    profile: { full_name: U("uzman: Ayşe Işıl Öztürk"), name: U("uzman: Ayşe Işıl Öztürk") },
  };
}

function withLocale<T>(mode: Mode, fn: (cookie: string | null) => Promise<T>): Promise<T> {
  const prev = process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
  if (mode === "base") process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "off";
  else process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "on";
  const cookie = mode === "base" ? null : `NEXT_LOCALE=${mode}`;
  return fn(cookie).finally(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
    else process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = prev;
  });
}

async function callPost(mod: { POST: (r: NextRequest) => Promise<Response> }, url: string, body: unknown, cookie: string | null): Promise<Built> {
  const { __resetRateLimitForTest } = await import("@/lib/security/rateLimit");
  __resetRateLimitForTest();
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (cookie) headers.cookie = cookie;
  const res = await mod.POST(new NextRequest(`http://localhost${url}`, { method: "POST", headers, body: JSON.stringify(body) }));
  if (res.status !== 200) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename="([^"]*)"/.exec(cd);
  return { buffer: Buffer.from(await res.arrayBuffer()), filename: m ? m[1]! : null };
}

async function rl(mode: Mode): Promise<ReportLocale | undefined> {
  if (mode === "base") return undefined;
  const { reportLocaleFor } = await import("@/lib/i18n/reportLocale");
  return reportLocaleFor(mode);
}

// ═══ P07 — Ajanda Word (route) ═══════════════════════════════════════════════
const iso = (m: number, d: number, h = 9, min = 0) => new Date(Date.UTC(2026, m - 1, d, h, min, 0)).toISOString();
function ajandaTables(): Record<string, Row[]> {
  const apt = (n: number, at: string, status: string, client: string | null, title: string | null, notes: string | null): Row => ({
    id: uid(700 + n), tenant_id: TENANT, title, notes, appointment_date: at, created_at: iso(11, 1), client_id: client, status,
  });
  return {
    appointments: [
      apt(1, iso(11, 20, 7), "tamamlandi", uid(790), U("randevu: Görüşme Şükrü"), U("not: İlk görüşme; ılık ortam.")),
      apt(2, iso(11, 20, 11, 30), "bekliyor", null, U("randevu: Genel toplantı Çağla"), null),
      apt(3, iso(11, 22, 8), "iptal", uid(790), U("randevu: İptal edilen seans"), null),
      apt(4, "2026-11-24T22:30:00.000Z", "bekliyor", null, null, U("not: Gece randevusu ğüşıöç")),
      apt(5, iso(11, 28, 10), "bekliyor", uid(791), U("randevu: Gelecek seans"), null),
      apt(6, iso(12, 2, 10), "bekliyor", uid(799), U("randevu: Adı çözülmeyen danışan"), null),
    ],
    clients: [
      { id: uid(790), tenant_id: TENANT, ad: U("ad: Ayşe"), soyad: U("soyad: Çiğdem") },
      { id: uid(791), tenant_id: TENANT, ad: U("ad: Işık"), soyad: null },
    ],
    users: [],
    user_locale_prefs: [],
  };
}
function ajandaFixture(name: string, body: Row): Fixture {
  return {
    name,
    producer: "P07",
    kind: "docx",
    run: (mode) =>
      withLocale(mode, async (cookie) => {
        setGuard(ajandaTables());
        const mod = await import("@/app/api/ajanda/word-report/route");
        return callPost(mod as never, "/api/ajanda/word-report", body, cookie);
      }),
  };
}

// ═══ P26 — Ürün/Stok Word (route) ════════════════════════════════════════════
function stockTables(): Record<string, Row[]> {
  return {
    dogaltas_inventory: [
      { id: uid(2601), tenant_id: TENANT, name: U("taş: Ametist Çiğ"), type: U("tür: Ham"), adet: 12, unit_cost_try: 37.5, total_cost_try: 450, adet_price: 0 },
      { id: uid(2602), tenant_id: TENANT, name: U("taş: Kaplan Gözü"), type: "", adet: 0, unit_cost_try: 0, total_cost_try: 0, adet_price: 15 },
    ],
    oil_inventory: [{ id: uid(2611), tenant_id: TENANT, name: U("yağ: Lavanta Şişe"), oil_type: U("yağ türü: Uçucu"), base_unit: "ml", stock_base: 250.5, cost_per_base: 1.25 }],
    soap_cream_inventory: [{ id: uid(2621), tenant_id: TENANT, name: U("sabun: Zeytinyağlı Sabun"), product_group: U("grup: Sabun"), base_unit: "gram", stock_base: 1200, cost_per_base: 0.08 }],
    accessory_inventory: [{ id: uid(2631), tenant_id: TENANT, name: U("aksesuar: Tespih Öğe"), product_group: U("grup: Tespih"), product_model: U("model: 33'lük"), stock_qty: 3, cost_per_unit: 125 }],
    other_inventory: [{ id: uid(2641), tenant_id: TENANT, name: U("diğer: Tütsü Çubuğu"), product_group: U("grup: Tütsü"), sub_category: U("alt: Sandal"), base_unit: "adet", stock_base: 40, cost_per_base: 2.5 }],
    users: [],
    user_locale_prefs: [],
  };
}
function stockFixture(name: string, exportMode: string): Fixture {
  return {
    name,
    producer: "P26",
    kind: "docx",
    run: (mode) =>
      withLocale(mode, async (cookie) => {
        setGuard(stockTables());
        const mod = await import("@/app/api/urun-stok/stock-report/route");
        return callPost(mod as never, "/api/urun-stok/stock-report", { exportMode }, cookie);
      }),
  };
}

// ═══ P01 / P02 — Danışan Yolculuğu Word (saf kurucu) ═════════════════════════
const NOW = new Date("2026-11-25T09:30:00.000Z");
type B = typeof import("@/app/api/clients/[id]/word-report/clientReportBuilder");
type Dataset = import("@/app/api/clients/[id]/word-report/clientReportBuilder").ClientDataset;

function chakraValues(): Record<string, { mark?: string; male?: string; female?: string }> {
  return {
    before_energy_ruhsal: { mark: "+3", male: "40", female: "60" },
    after_energy_ruhsal: { mark: "+5", male: "50", female: "50" },
    before_chakra_kalp: { mark: "-2", male: "30", female: "" },
    after_chakra_kalp: { mark: "+1", male: "45", female: "55" },
    before_chakra_tac: { mark: "+4" },
  };
}

export function dyDataset(i: number): Dataset {
  const id = uid(100 + i);
  return {
    client: {
      id,
      ad: U(`ad: Ayşe${i}`),
      soyad: U(`soyad: Çiğdem-Işık${i}`),
      telefon: U(`telefon: 0555 000 ${String(i).padStart(4, "0")}`),
      dogum: "1990-03-15",
      gorusme: "2026-09-27",
      burc: U("burç (serbest metin): Balık"),
      kan: U("kan: A Rh+"),
      mizac: "sovdavi",
      profile_image_url: null,
    },
    notes: {
      saglik_notu: U(`sağlık notu ${i}: Bel ağrısı; düzenli yürüyüş.`),
      adres: U(`adres: İzmir / Karşıyaka ${i}`),
      oneriler: U(`öneri ${i}: Günlük yürüyüş, ılık su.`),
      notlar: null,
    },
    appointments: [
      { id: `${id}-a1`, title: U(`randevu ${i}`), notes: U("randevu notu ğüş"), appointment_date: "2026-11-27T07:00:00Z", status: "bekliyor" },
      { id: `${id}-a2`, title: U(`gece görüşmesi ${i}`), notes: null, appointment_date: "2026-09-26T22:30:00Z", status: "tamamlandi" },
      { id: `${id}-a3`, title: null, notes: null, appointment_date: "2026-09-20T09:00:00Z", status: "bekliyor" },
      { id: `${id}-a4`, title: U("iptal randevu"), notes: null, appointment_date: "2026-09-21T09:00:00Z", status: "iptal" },
    ],
    stones: [
      { id: `${id}-s1`, stone_name: U("taş: İolit"), stone_type: U("taş tipi: Taşıma"), note: U("taş notu: Gece yastık altı"), usage_area: U("kullanım: Uyku"), combination_text: U("kombinasyon: Ametist + İolit"), warning_text: U("uyarı: Suya sokmayın"), other_notes: U("diğer: Ayda bir arındırma"), stone_date: "2026-09-27", created_at: "2026-09-27T09:00:00Z" },
    ],
    sessions: [
      { id: `${id}-se1`, session_date: "2026-09-27", session_type: U(`seans türü ${i}: Enerji Seansı`), duration_minutes: 45, fee: 1500, session_note: U("seans notu: Rahatladı"), actions_done: U("yapılanlar: Çakra dengeleme"), suggestions: U("öneriler: Su için"), next_plan: U("sonraki plan: 2 hafta sonra"), created_at: "2026-09-27T09:00:00Z" },
    ],
    homeworks: [
      {
        id: `${id}-h1`, title: U(`ödev ${i}: Nefes çalışması`), homework_type: U("ödev türü: Günlük"), description: U("açıklama: Sabah 5 dk."),
        start_date: "2026-09-27", end_date: "2026-10-04", status: "devam",
        expert_note: U(`uzman iç notu ${i}`), client_feedback: U("geri bildirim: İyi geldi."), created_at: "2026-09-27T09:00:00Z",
      },
      { id: `${id}-h2`, title: U("ödev: Günlük yazı"), homework_type: null, description: null, start_date: "2026-10-01", end_date: null, status: "tamamlandi", expert_note: null, client_feedback: null, created_at: "2026-10-01T09:00:00Z" },
    ],
    analyses: [
      { id: `${id}-an1`, analysis_type: "chakra", analysis_data: { title: U("analiz başlığı"), values: chakraValues() }, note: U(`analiz notu ${i}`), created_at: "2026-09-26T22:22:00Z" },
      { id: `${id}-an2`, analysis_type: "planet", analysis_data: { values: { before_kalp_GÜNEŞ: "+2", before_kalp_AY: "-1", after_kalp_GÜNEŞ: "+3" } }, note: null, created_at: "2026-09-28T10:00:00Z" },
    ],
    charges: [
      { id: `${id}-c1`, charge_date: "2026-09-27", category: "session", detail: U(`ücret detayı: Seans ${i}`), note: U("ücret notu"), amount: 1500, payment_status: "paid", created_at: "2026-09-27T09:00:00Z" },
      { id: `${id}-c2`, charge_date: "2026-09-28", category: "other", detail: U(`ücret detayı: Krem ${i}`), amount: 350.5, payment_status: "unpaid", created_at: "2026-09-28T09:00:00Z" },
      { id: `${id}-c3`, charge_date: "2026-09-20", category: "analysis", detail: U("ücret detayı: Eski kayıt"), amount: 1000, payment_status: null, created_at: "2026-09-20T09:00:00Z" },
      { id: `${id}-c4`, charge_date: "2026-09-21", category: "homework", detail: null, amount: 250, payment_status: "paid", created_at: "2026-09-21T09:00:00Z" },
    ],
  };
}

function combos() {
  return [{ id: uid(4001), name: U("kombinasyon adı: Uyku Seti"), description: U("açıklama: Gece için"), note: U("kombinasyon notu"), stones_text: U("taşlar: Ametist, İolit"), notes_text: U("not 1: Yastık altı"), notes_text_2: null, created_at: "2026-09-27T09:00:00Z" }];
}

function anamnezRow() {
  return {
    id: uid(3001),
    kind: "standard",
    title: null,
    assessment_date: "2026-09-27",
    status: "completed",
    template_version: "std-v1",
    form_custom: null,
    answers: {
      "A.reason": U("başvuru nedeni: Uyku sorunu ve gerginlik"),
      "A.duration": "m1_6",
      "B.height_cm": 168.5,
      "B.conditions": { v: true, d: U("hastalık detayı: Migren") },
    },
    completed_at: "2026-09-27T10:15:00Z",
  };
}

function beslenmeInput() {
  return {
    profile: {
      goal_type: "weight_loss", goal_note: U("hedef notu: Yaz öncesi"), activity_level: "moderate", dietary_pattern: U("beslenme düzeni: Akdeniz"),
      daily_meal_count: 3, target_weight_kg: 62.5, water_note: U("su notu: 2 litre"), lifestyle_note: U("yaşam notu: Masa başı"), general_note: U("genel not: Şeker az"),
    },
    allergens: [{ name: U("alerjen: Fıstık"), note: U("alerjen notu: Şiddetli") }],
    measurements: [
      { measured_at: "2026-09-27T08:00:00Z", weight_kg: 70.4, height_cm: 168.5, waist_cm: 82, hip_cm: 100, note: U("ölçüm notu: Sabah aç") },
      { measured_at: "2026-09-01T08:00:00Z", weight_kg: 72, height_cm: null, waist_cm: null, hip_cm: null, note: null },
    ],
    measurementTotal: 2,
    preferences: [
      { stance: "preferred", label: U("besin: Yoğurt"), note: null },
      { stance: "avoided", label: U("besin: Kızartma"), note: U("tercih notu: Mide") },
    ],
  };
}

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function dyFixture(name: string, producer: string, build: (B: B, ctx: Record<string, unknown>) => { doc: Document; filename: string }, ctxExtra: Record<string, unknown> = {}): Fixture {
  return {
    name,
    producer,
    kind: "docx",
    run: async (mode) => {
      const Bm = (await import("@/app/api/clients/[id]/word-report/clientReportBuilder")) as B;
      const output = await rl(mode);
      const ctx: Record<string, unknown> = { now: NOW, expertName: U("uzman: Ayşe Işıl Öztürk"), logo: null, ...ctxExtra };
      if (output) ctx.output = output;
      const r = build(Bm, ctx);
      return { buffer: await Packer.toBuffer(r.doc), filename: r.filename };
    },
  };
}

function brandingFixture() {
  return {
    name: U("uzman adı: Ayşe Işıl Öztürk"),
    title: U("unvan: Danışman"),
    organization: U("kurum: Şifa Çağı Merkezi"),
    contactLine: U("iletişim: 0555 000 00 00"),
    note: U("dipnot: Sorularınız için ulaşın."),
    logoPng: { data: PNG_1X1, width: 1, height: 1 },
  };
}

function dyFixtures(): Fixture[] {
  const d1 = dyDataset(1);
  const d2 = dyDataset(2);
  const full = (B: B, ctx: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    B.buildClientFullReport({ data: dyDataset(1), profileImg: null, analysisImages: [null, null], combinations: combos(), ...extra } as never, ctx as never);
  const out: Fixture[] = [
    dyFixture("dy-tam", "P01", (B, ctx) => full(B, ctx)),
    dyFixture("dy-tam-ucretli-hassas", "P01", (B, ctx) => full(B, ctx, { anamnez: anamnezRow(), beslenme: beslenmeInput() }), {
      sections: ["notlar", "seanslar", "randevular", "taslar", "odevler", "analizler", "humanDesign", "numeroloji", "yolculuk", "ucretlendirme"],
      includeExpertNotes: true,
    }),
    dyFixture("dy-ozel", "P01", (B, ctx) => full(B, ctx), { sections: ["notlar", "randevular", "ucretlendirme"], variant: "custom" }),
    dyFixture("dy-tam-imzali", "P01", (B, ctx) => full(B, ctx), { branding: brandingFixture() }),
    dyFixture("dy-tarih-araligi", "P01", (B, ctx) =>
      B.buildClientDateRangeReport({ data: B.filterClientDatasetByRange(dyDataset(1), "2026-09-01", "2026-09-30"), drStart: "2026-09-01", drEnd: "2026-09-30", profileImg: null } as never, ctx as never),
    ),
    dyFixture("dy-tek-analiz-cakra", "P01", (B, ctx) => B.buildClientSingleAnalysisReport({ client: d1.client, notes: d1.notes, analysis: d1.analyses[0]!, imageBuf: null }, ctx as never)),
    dyFixture("dy-tek-analiz-gezegen", "P01", (B, ctx) => B.buildClientSingleAnalysisReport({ client: d1.client, notes: d1.notes, analysis: d1.analyses[1]!, imageBuf: null }, ctx as never)),
    dyFixture("dy-toplu", "P02", (B, ctx) => B.buildClientsBulkFullReport([{ data: dyDataset(1), profileImg: null }, { data: d2, profileImg: null }] as never, ctx as never)),
  ];
  const tabRows: Record<string, Row[]> = {
    genel: [],
    notlar: [],
    randevular: d1.appointments as Row[],
    taslar: d1.stones as Row[],
    seanslar: d1.sessions as Row[],
    ucretlendirme: d1.charges as Row[],
    odevler: d1.homeworks as Row[],
    analizler: d1.analyses as Row[],
  };
  for (const tab of Object.keys(tabRows)) {
    out.push(
      dyFixture(`dy-sekme-${tab}`, "P01", (B, ctx) =>
        B.buildClientTabReport({ tab: tab as never, client: d1.client, notes: d1.notes, rows: tabRows[tab]!, analysisImages: tab === "analizler" ? [null, null] : undefined, combinations: tab === "taslar" ? combos() : undefined } as never, ctx as never),
      ),
    );
  }
  out.push(dyFixture("dy-sekme-randevular-bos", "P01", (B, ctx) => B.buildClientTabReport({ tab: "randevular", client: d1.client, notes: null, rows: [] } as never, ctx as never)));
  return out;
}

// ═══ P03 — Anamnez PDF (saf kurucu) ══════════════════════════════════════════
function anamnezPdfFixtures(): Fixture[] {
  const lc = (mode: Mode) => (mode === "en" ? "en" : "tr");
  return [
    {
      name: "anamnez-bos-standart",
      producer: "P03",
      kind: "pdf",
      run: async (mode) => {
        const { buildBlankAnamnesisPdf } = await import("@/lib/danisan/anamnez/blankFormPdf");
        const { anamnezPdfFontBase64 } = await import("@/lib/danisan/anamnez/pdfFont");
        const bytes = buildBlankAnamnesisPdf({ locale: lc(mode), version: "std-v1", formCustom: null, clientName: U("danışan: Ayşe Çiğdem"), fontBase64: anamnezPdfFontBase64() });
        return { buffer: Buffer.from(bytes), filename: null };
      },
    },
    {
      name: "anamnez-dolu",
      producer: "P03",
      kind: "pdf",
      run: async (mode) => {
        const { buildFilledAnamnesisPdf } = await import("@/lib/danisan/anamnez/filledFormPdf");
        const { anamnezPdfFontBase64 } = await import("@/lib/danisan/anamnez/pdfFont");
        const a = anamnezRow();
        const bytes = buildFilledAnamnesisPdf({
          locale: lc(mode),
          now: NOW,
          fontBase64: anamnezPdfFontBase64(),
          record: {
            template_version: a.template_version,
            form_custom: null,
            answers: a.answers,
            status: "completed",
            assessment_date: a.assessment_date,
            completed_at: a.completed_at,
            revision: 2,
            client_snapshot: { ad: U("ad: Ayşe"), soyad: U("soyad: Çiğdem") },
            title: null,
            kind: "standard",
          } as never,
        });
        return { buffer: Buffer.from(bytes), filename: null };
      },
    },
  ];
}

export function allFixtures(): Fixture[] {
  return [
    ajandaFixture("ajanda-tumu", { exportMode: "all" }),
    ajandaFixture("ajanda-haftalik", { exportMode: "weekly", dateRange: { start: "2026-11-16", end: "2026-11-22" } }),
    ajandaFixture("ajanda-tek", { exportMode: "single", appointmentId: uid(701) }),
    ajandaFixture("ajanda-secili", { exportMode: "selected", appointmentIds: [uid(702), uid(704)] }),
    stockFixture("stok-tumu", "all"),
    stockFixture("stok-kritik", "critical"),
    ...dyFixtures(),
    ...anamnezPdfFixtures(),
  ];
}
