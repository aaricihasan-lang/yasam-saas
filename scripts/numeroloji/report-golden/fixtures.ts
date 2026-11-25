/**
 * Numeroloji rapor golden (P35–P37) — SABİT, SENTETİK fikstürler (gerçek danışan/uzman verisi YOK; DB/ağ YOK).
 *
 * Üreticiler:
 *   P35W  Numeroloji kişi/analiz Word'ü (route /api/numeroloji/word-report; sahte DB)
 *   P35K  Numeroloji Bilgi Bankası Word'ü (route /api/numeroloji/knowledge-report; sahte DB)
 *   P37   Klasik Numeroloji Word (6 tür) + görsel PNG (lib kurucuları; scripts/numeroloji-klasik/report/fixtures)
 *
 * Kipler:
 *   base → bugünkü çağrı: route'ta çerez YOK + yayın kapısı kapalı; lib'de `output` verilmez.
 *   tr   → kapı AÇIK + NEXT_LOCALE=tr (route) / output = outputLocaleFor("tr") (lib).
 *   en   → kapı AÇIK + NEXT_LOCALE=en (route) / output = outputLocaleFor("en") (lib).
 *
 * `content` = fikstürdeki kullanıcı/sağlayıcı/veri metinleri (kayıt adı, Bilgi Bankası gövdeleri, taş adları,
 * sağlayıcı yorumları). EN sızıntı denetimi bu metinleri çıkarır; kalan Türkçe = sistem metni.
 */
import { NextRequest } from "next/server";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";
import { buildKnowledgeLookupPlan } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";
import * as KF from "../../numeroloji-klasik/report/fixtures";

export type Mode = "base" | "tr" | "en";
export type Built = { buffer: Buffer; filename: string | null; kind: "docx" | "png" | "svg" };
export type Fixture = { name: string; producer: "P35W" | "P35K" | "P37"; run: (mode: Mode) => Promise<Built>; content: () => string[] };

const TENANT = "00000000-0000-4000-8000-0000000000a5";
const USER_ID = "00000000-0000-4000-8000-0000000000b5";
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
  return { from, storage: { from: () => ({ download: async () => ({ data: null, error: { message: "yok" } }) }) }, rpc: async () => ({ data: null, error: { message: "yok" } }) };
}

const PROFILE_CLOSED = { role: "expert", module_permissions: { numerology: true }, full_name: "Uzman Gülşen Işıkçı" };
const PROFILE_OPEN = { role: "admin", full_name: "Uzman Gülşen Işıkçı" };

function setGuard(tables: Record<string, Row[]>, profile: Row = PROFILE_CLOSED): void {
  (globalThis as Record<string, unknown>).__NRG_GUARD__ = {
    ok: true,
    db: fakeDb(tables),
    tenantId: TENANT,
    userId: USER_ID,
    email: "zz.num.golden@example.test",
    is_demo_account: false,
    profile,
  };
}

async function withLocale<T>(mode: Mode, fn: (cookie: string | null) => Promise<T>): Promise<T> {
  const prev = process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
  process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = mode === "base" ? "off" : "on";
  const cookie = mode === "base" ? null : `NEXT_LOCALE=${mode}`;
  try {
    return await fn(cookie);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
    else process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = prev;
  }
}

async function callPost(mod: { POST: (r: NextRequest) => Promise<Response> }, url: string, body: unknown, cookie: string | null): Promise<Built> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (cookie) headers.cookie = cookie;
  const res = await mod.POST(new NextRequest(`http://localhost${url}`, { method: "POST", headers, body: JSON.stringify(body) }));
  if (res.status !== 200) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) ?? /filename="([^"]*)"/.exec(cd);
  return { buffer: Buffer.from(await res.arrayBuffer()), filename: m ? decodeURIComponent(m[1]!) : null, kind: "docx" };
}

// ═══ Sentetik kişiler (Türkçe harfli adlar; motor gerçek) ═══════════════════════
type Person = { id: string; name: string; surname: string; birth: string };
const P_A: Person = { id: uid(101), name: "Deneme Ayşe", surname: "Örnekoğlu", birth: "14.02.1987" };
const P_B: Person = { id: uid(102), name: "Sentetik", surname: "Çalışkan Işık", birth: "29.11.1975" };
const P_C: Person = { id: uid(103), name: "Test Ümit", surname: "Güneş", birth: "2000-01-01" };
const P_D: Person = { id: uid(104), name: "Planlı Bebek", surname: "Yıldız", birth: "15.06.2027" };

const motorOf = (p: Person) =>
  JSON.parse(JSON.stringify(hesaplaNumeroloji({ firstName: p.name, lastName: p.surname, birthDate: p.birth.includes("-") ? p.birth.split("-").reverse().join(".") : p.birth }))) as Record<string, unknown>;

function recordRow(p: Person, opts: { legacy?: boolean } = {}): Row {
  return {
    id: p.id,
    tenant_id: TENANT,
    name: p.name,
    surname: p.surname,
    birth_date: p.birth,
    created_at: "2026-03-14T08:45:00Z",
    analysis_data: {
      version: 1,
      motor: motorOf(p),
      summary: "Sentetik kayıtlı özet: güçlü ifade, dengeli çakra omurgası.\n\nİkinci paragraf — kullanıcı özeti.",
      ...(opts.legacy ? {} : { calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } }),
    },
  };
}

// Bilgi Bankası: A kişisinin gerçek arama planından değerler (eşleşme gerçek).
function knowledgeTables(p: Person): Record<string, Row[]> {
  const plan = buildKnowledgeLookupPlan(motorOf(p) as never);
  const first = (t: string) => plan.find((x) => x.analysisType === t)?.values[0] ?? null;
  const kb: Row[] = [];
  const stones: Row[] = [];
  const add = (n: number, type: string, value: string | null, extra: Row) => {
    if (!value) return;
    kb.push({ id: uid(n), tenant_id: TENANT, analysis_type: type, value, source: null, description: null, content_sections: null, updated_at: "2026-05-02T12:15:00Z", ...extra });
  };
  add(201, "ana-kulvar", first("ana-kulvar"), {
    content_sections: [
      { key: "overview", label: "Genel Açıklama", body: "Ana kulvar genel açıklama gövdesi — kullanıcı içeriği ğüşiöç.", order: 1 },
      { key: "constructive", label: "Yapıcı Potansiyeller", body: "Yapıcı yön gövdesi — kullanıcı.", order: 2 },
      { key: "negative", label: "Olumsuz Potansiyeller", body: "Olumsuz yön gövdesi — kullanıcı.", order: 3 },
      { key: "destructive", label: "Yıkıcı Potansiyeller", body: "Yıkıcı yön gövdesi — kullanıcı.", order: 4 },
    ],
    source: "Eski kaynak bilgisi — kullanıcı",
  });
  add(202, "yan-kulvar", first("yan-kulvar"), { description: "Yan kulvar eski açıklama — kullanıcı." });
  add(203, "ifade-sayisi", first("ifade-sayisi"), { description: "İfade sayısı açıklaması — kullanıcı.", source: "Kitap Şükrü s.12" });
  add(204, "hayat-yolu", first("hayat-yolu"), { description: "Hayat yolu açıklaması — kullanıcı." });
  add(205, "cakra-omurga", first("cakra-omurga"), { description: "Çakra omurga açıklaması — kullanıcı." });
  add(206, "element", first("element"), { description: "Element açıklaması — kullanıcı." });
  add(207, "diger", "Özel Değer", { description: "Diğer tür açıklaması — kullanıcı." });
  const st = (n: number, type: string, value: string | null, reason: string | null, list: string[]) => {
    if (!value) return;
    stones.push({ id: uid(n), tenant_id: TENANT, analysis_type: type, value, reason, stones: list, updated_at: "2026-05-03T09:00:00Z" });
  };
  st(301, "hayat-yolu", first("hayat-yolu"), "Hayat yolu taş gerekçesi — kullanıcı.", ["Ametist", "Kuvars Kristali", "Sitrin"]);
  st(302, "cakra-omurga", first("cakra-omurga"), "Çakra taş gerekçesi — kullanıcı.", ["Akik", "Yeşim", "Lapis Lazuli", "Kaplan Gözü", "Obsidyen", "Turmalin", "Ay Taşı"]);
  st(303, "element", first("element"), null, ["Hematit", "Granat"]);
  st(304, "ana-kulvar", first("ana-kulvar"), "Ana kulvar taş gerekçesi — kullanıcı.", []);
  const sources: Row[] = [
    { id: uid(401), tenant_id: TENANT, display_label: "Kaynak Kitap Çağrı (2019)", title: "Sayıların Dili — kullanıcı", authors: "Çağrı Öğütçü", organization: "Işık Yayınları", source_type: "kitap", level_or_edition: "2. baskı", publication_year: 2019, language: "Türkçe", notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    { id: uid(402), tenant_id: TENANT, display_label: "Ders Notu Şeyma", title: null, authors: null, organization: null, source_type: null, level_or_edition: null, publication_year: null, language: null, notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  ];
  const recordSources: Row[] = [
    { id: uid(501), tenant_id: TENANT, knowledge_record_id: uid(201), source_id: uid(401), page_start: 12, page_end: 14, locator: "Bölüm 3 — kullanıcı", is_primary: true, display_order: 1, internal_note: "GİZLİ İÇ NOT", section_key: "constructive", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
    { id: uid(502), tenant_id: TENANT, knowledge_record_id: uid(201), source_id: uid(402), page_start: 7, page_end: null, locator: null, is_primary: false, display_order: 2, internal_note: null, section_key: null, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
  ];
  const entries: Row[] = [
    { id: uid(601), tenant_id: TENANT, knowledge_record_id: uid(201), source_id: null, body: "Uzman kendi notu gövdesi — kullanıcı.", display_order: 1, include_in_analysis: true, created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" },
    { id: uid(602), tenant_id: TENANT, knowledge_record_id: uid(201), source_id: uid(401), body: "Kaynaklı not gövdesi — kullanıcı.", display_order: 2, include_in_analysis: true, created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" },
    { id: uid(603), tenant_id: TENANT, knowledge_record_id: uid(204), source_id: uid(499), body: "Kaynağı silinmiş not — kullanıcı.", display_order: 1, include_in_analysis: true, created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" },
  ];
  return {
    numerology_knowledge_records: kb,
    numerology_stone_assignments: stones,
    numerology_sources: sources,
    numerology_record_sources: recordSources,
    numerology_knowledge_source_entries: entries,
    dogaltas_inventory: [{ name: "Ametist", adet: 4 }, { name: "Akik", adet: 0 }, { name: "Yeşim", adet: 2 }],
    user_locale_prefs: [],
  };
}

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") { if (v.trim()) out.push(v); }
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

// ═══ P35W — kişi/analiz Word'ü (route) ════════════════════════════════════════
function wordFixture(name: string, people: Person[], body: Row, opts: { legacy?: Person[]; profile?: Row } = {}): Fixture {
  const tables = () => {
    const t = knowledgeTables(P_A);
    t.numerology_records = people.map((p) => recordRow(p, { legacy: opts.legacy?.includes(p) }));
    return t;
  };
  return {
    name,
    producer: "P35W",
    run: (mode) =>
      withLocale(mode, async (cookie) => {
        setGuard(tables(), opts.profile);
        const mod = await import("@/app/api/numeroloji/word-report/route");
        return callPost(mod as never, "/api/numeroloji/word-report", body, cookie);
      }),
    content: () => {
      const t = tables();
      const s = strings([t.numerology_knowledge_records, t.numerology_stone_assignments, t.numerology_sources, t.numerology_knowledge_source_entries, t.dogaltas_inventory]);
      for (const p of people) s.push(p.name, p.surname, `${p.name} ${p.surname}`, p.birth);
      s.push("Sentetik kayıtlı özet: güçlü ifade, dengeli çakra omurgası.", "İkinci paragraf — kullanıcı özeti.", PROFILE_CLOSED.full_name);
      return s;
    },
  };
}

const ALL5 = { summary: true, plain: true, detailed: true, zamanlama: true, tas: true };

// ═══ P35K — Bilgi Bankası Word'ü (route) ══════════════════════════════════════
function knowledgeFixture(name: string, body: Row): Fixture {
  return {
    name,
    producer: "P35K",
    run: (mode) =>
      withLocale(mode, async (cookie) => {
        setGuard(knowledgeTables(P_A));
        const mod = await import("@/app/api/numeroloji/knowledge-report/route");
        return callPost(mod as never, "/api/numeroloji/knowledge-report", body, cookie);
      }),
    content: () => [...strings(knowledgeTables(P_A)), PROFILE_CLOSED.full_name],
  };
}

// ═══ P37 — Klasik Word + PNG (lib) ═══════════════════════════════════════════
async function outputOf(mode: Mode): Promise<Record<string, unknown>> {
  if (mode === "base") return {};
  const { outputLocaleFor } = await import("@/lib/i18n/output");
  return { output: outputLocaleFor(mode) };
}
type DocxMod = typeof import("@/lib/numeroloji-klasik/report/docx");
function classicFixture(name: string, fileKind: string, title: string, build: (m: DocxMod, extra: Record<string, unknown>) => Promise<Buffer>, data: unknown): Fixture {
  return {
    name,
    producer: "P37",
    run: async (mode) => {
      const m = await import("@/lib/numeroloji-klasik/report/docx");
      const fm = await import("@/lib/numeroloji-klasik/report/filename");
      const extra = await outputOf(mode);
      const buffer = await build(m, extra);
      const fn = fm.buildReportFilename as unknown as (...a: unknown[]) => string;
      const filename = extra.output ? fn(fileKind, title, KF.GEN_AT, extra.output) : fn(fileKind, title, KF.GEN_AT);
      return { buffer, filename, kind: "docx" };
    },
    content: () => [...strings(data), "Uzman Gülşen Işıkçı"],
  };
}
const COMMON = { generatedAt: KF.GEN_AT, expertName: "Uzman Gülşen Işıkçı" };
const opt = (o: Record<string, unknown>) => o as never;

export const FIXTURES: Fixture[] = [
  wordFixture("P35W-tek-tum-bolumler", [P_A], { exportMode: "single", recordId: P_A.id, sections: ALL5, referenceDate: "2026-11-25" }),
  wordFixture("P35W-tek-ozetsiz-gelecek-acik", [P_B], { exportMode: "single", recordId: P_B.id, sections: { plain: true } }, { profile: PROFILE_OPEN }),
  wordFixture("P35W-tek-ozetsiz-gelecek-kapali", [P_B], { exportMode: "single", recordId: P_B.id, sections: { plain: true } }),
  wordFixture("P35W-secili-iki-kisi", [P_A, P_C], { exportMode: "selected", ids: [P_A.id, P_C.id], sections: { summary: true, tas: true } }),
  wordFixture("P35W-eski-metodoloji", [P_C], { exportMode: "single", recordId: P_C.id, sections: { plain: true, detailed: true } }, { legacy: [P_C] }),
  wordFixture("P35W-dogum-oncesi-zamanlama", [P_D], { exportMode: "single", recordId: P_D.id, sections: { zamanlama: true }, referenceDate: "2026-11-25" }),
  wordFixture("P35W-tumu-tek-sekme", [P_A, P_B], { exportMode: "all", sections: { detailed: true } }),
  knowledgeFixture("P35K-tumu", { exportMode: "all" }),
  knowledgeFixture("P35K-filtreli-tas", { exportMode: "filtered", knowledgeIds: [], stoneIds: [uid(301), uid(302)], sections: { stones: true } }),
  knowledgeFixture("P35K-aciklama-kaynakca", { exportMode: "all", sections: { descriptions: true, bibliography: true } }),
  classicFixture("P37-kisi-tam", "kisi", KF.PERSON_RECORD.title, (m, x) => m.buildPersonReport(KF.PERSON_RECORD, opt({ ...COMMON, ...x, variant: "full", stones: KF.STONES })), [KF.PERSON_RECORD, KF.STONES]),
  classicFixture("P37-kisi-ozet", "kisi", KF.PERSON_RECORD.title, (m, x) => m.buildPersonReport(KF.PERSON_RECORD, opt({ ...COMMON, ...x, variant: "summary" })), KF.PERSON_RECORD),
  classicFixture("P37-kisi-teknik-secili", "kisi", KF.PERSON_RECORD.title, (m, x) => m.buildPersonReport(KF.PERSON_RECORD, opt({ ...COMMON, ...x, variant: "technical", include: ["core", "timing", "chaldean", "dual"] })), KF.PERSON_RECORD),
  classicFixture("P37-tas", "tas", KF.PERSON_RECORD.title, (m, x) => m.buildStonesReport(KF.PERSON_RECORD, KF.STONES, opt({ ...COMMON, ...x })), [KF.PERSON_RECORD, KF.STONES]),
  classicFixture("P37-iliski", "iliski", KF.RELATIONSHIP_RECORD.title, (m, x) => m.buildRelationshipReport(KF.RELATIONSHIP_RECORD, opt({ ...COMMON, ...x })), KF.RELATIONSHIP_RECORD),
  classicFixture("P37-isletme", "isletme", KF.BUSINESS_RECORD.title, (m, x) => m.buildBusinessReport(KF.BUSINESS_RECORD, opt({ ...COMMON, ...x })), KF.BUSINESS_RECORD),
  classicFixture("P37-isimler", "isimler", KF.NAMES_RECORD.title, (m, x) => m.buildNamesReport(KF.NAMES_RECORD, opt({ ...COMMON, ...x, variant: "full" })), KF.NAMES_RECORD),
  classicFixture("P37-karsilastirma", "karsilastirma", "Ayşe — karşılaştırma", (m, x) => m.buildComparisonReport(KF.COMPARISON, opt({ ...COMMON, ...x })), KF.COMPARISON),
  {
    name: "P37-png-kisi",
    producer: "P37",
    run: async (mode) => {
      const { renderClassicPng } = await import("@/lib/numeroloji-klasik/report/png");
      const x = await outputOf(mode);
      const out = renderClassicPng(KF.PERSON_RECORD, opt({ generatedAt: new Date(KF.GEN_AT), expertName: "Uzman Gülşen Işıkçı", ...x }));
      if (!out.ok) throw new Error(`PNG ${out.reason}`);
      return { buffer: out.png, filename: null, kind: "png" };
    },
    content: () => [...strings(KF.PERSON_RECORD), "Uzman Gülşen Işıkçı"],
  },
  {
    name: "P37-png-svg-kisi",
    producer: "P37",
    run: async (mode) => {
      const { buildClassicPngSvg } = await import("@/lib/numeroloji-klasik/report/pngSvg");
      const x = await outputOf(mode);
      const b = buildClassicPngSvg(KF.PERSON_RECORD, opt({ generatedAt: new Date(KF.GEN_AT), expertName: "Uzman Gülşen Işıkçı", ...x }));
      if (!b) throw new Error("SVG yok");
      return { buffer: Buffer.from(b.svg, "utf8"), filename: null, kind: "svg" };
    },
    content: () => [...strings(KF.PERSON_RECORD), "Uzman Gülşen Işıkçı"],
  },
];
