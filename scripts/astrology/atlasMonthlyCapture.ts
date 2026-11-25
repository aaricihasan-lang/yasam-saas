/**
 * I18N mod-g / ATLAS-E — aylık efemeris gösterim katmanının kullanıcıya görünen BÜTÜN çıktısını toplar (yalnız test).
 * `text` verilmezse ürünün varsayılanı (kaynak dil TR) kullanılır; taban (fixtures/i18n/monthly-ephemeris-tr-taban.json) bu
 * fonksiyonun çeviri ÖNCESİ kodla (26f217b9b) ürettiği çıktıdır. Ağ / DB / sağlayıcı / DE440 YOK (servis/kayıt hataları sahte bağımlılıkla).
 */
import "./css-module-stub.cjs";
import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup, type TestLocale } from "./intlRender";
import * as F from "@/lib/astrology/pro/monthly/format";
import * as C from "@/lib/astrology/pro/monthly/contract";
import * as RM from "@/lib/astrology/pro/monthly/reportModel";
import * as RR from "@/lib/astrology/pro/monthly/reportRender";
import * as S from "@/lib/astrology/pro/monthly/service";
import * as R from "@/lib/astrology/pro/monthly/records";
import * as K from "@/lib/astrology/pro/monthly/routeKit";
import * as X from "@/lib/astrology/pro/monthly/crossCheck";
import { CROSSCHECK_REASON_SAMPLES, FIXED_NOW_ISO, LON_SAMPLES, monthlyCases, YM_SAMPLES } from "./atlasMonthlyCases";
import type { MonthlyBody, MonthlyKind } from "@/lib/astrology/pro/monthly/types";
import { VEDIC_MONTHLY_BODIES, WESTERN_MONTHLY_BODIES } from "@/lib/astrology/pro/monthly/types";

type AnyFn = (...a: unknown[]) => unknown;
/** Sondaki isteğe bağlı metin parametresi (yalnız verildiyse eklenir → çeviri öncesi imzalarla da çalışır). */
const call = <T>(fn: unknown, args: unknown[], text: unknown): T => (fn as AnyFn)(...args, ...(text === undefined ? [] : [text])) as T;

async function withFixedNow<T>(f: () => Promise<T> | T): Promise<T> {
  const Real = Date;
  const fixed = Real.parse(FIXED_NOW_ISO);
  class FixedDate extends Real {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(fixed);
      else super(...(a as [number]));
    }
    static now() {
      return fixed;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
  try {
    return await f();
  } finally {
    (globalThis as { Date: DateConstructor }).Date = Real;
  }
}

function fakeDb(code: string | null) {
  const chain: Record<string, unknown> = {};
  const res = { data: null, error: code ? { code } : null };
  for (const m of ["select", "eq", "order", "range", "insert", "single"]) chain[m] = () => chain;
  chain.maybeSingle = async () => res;
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
  return { from: () => chain, rpc: async () => ({ data: { allowed: false, retry_after: 42 }, error: null }) };
}

export async function captureMonthly(text?: unknown, locale: TestLocale = "tr"): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  // ── format.ts / contract.ts saf gösterim ──────────────────────────────────────────────────────────────────
  out.kind = (["western", "vedic"] as const).map((k) => call(F.kindLabel, [k], text));
  out.period = Array.from({ length: 12 }, (_, i) => call(F.periodLabel, [2026, i + 1], text));
  const bodies: Record<string, unknown> = {};
  for (const [k, list] of [["western", WESTERN_MONTHLY_BODIES], ["vedic", VEDIC_MONTHLY_BODIES]] as const) {
    for (const b of list as readonly MonthlyBody[]) {
      bodies[`${k}.${b}`] = { name: call(F.bodyName, [k, b], text), header: call(F.bodyHeader, [k, b], text), glyph: F.bodyGlyph(k, b) };
    }
  }
  out.bodies = bodies;
  out.cells = LON_SAMPLES.map((lon) => {
    const c = call<Record<string, unknown>>(F.cellParts, [{ lon, retro: lon > 100 }], text);
    return { ...c, text: call(F.cellText, [{ lon, retro: lon > 100 }], text) };
  });
  out.dates = ["2026-11-01", "2026-11-02", "2024-02-29", "1600-01-01", "2600-12-31"].map((iso) => ({ day: call(F.dayLabel, [iso], text), date: call(F.dateTr, [iso], text) }));
  out.localNote = YM_SAMPLES.map(([y, m]) => call(F.trLocalNote, [y, m], text));
  out.deltaT = YM_SAMPLES.flatMap(([y, m]) => (["western", "vedic"] as const).map((k) => call(F.deltaTNote, [y, m, k], text)));
  out.verification = YM_SAMPLES.flatMap(([y]) => (["chiron", "lilith", "sun"] as const).map((b) => call(C.bodyVerification, ["western", b, y], text)));
  out.parseErrors = [{}, { kind: "x" }, { kind: "western", year: "abc" }, { kind: "western", year: 2026, month: 13 }, { kind: "vedic", year: 1500, month: 1 }, { kind: "vedic", year: "2601", month: "1" }].map((raw) => C.parseMonthlyRequest(raw));
  out.crossCheckMethod = X.CROSSCHECK_METHOD;
  out.crossReasons = CROSSCHECK_REASON_SAMPLES;
  // ── yöntem satırları + rapor modeli + Word belge metni ────────────────────────────────────────────────────
  const cases: Record<string, unknown> = {};
  for (const c of monthlyCases()) {
    const lines = call<string[]>(F.methodLines, [c.e], text);
    const opts = { generatedAt: FIXED_NOW_ISO, saved: c.saved, ...(text === undefined ? {} : { text }) };
    const model = RM.buildMonthlyReport(c.e, opts as never);
    const docx = await RR.renderMonthlyReport(c.e, "docx", opts as never);
    const zip = await JSZip.loadAsync(Buffer.from(docx.bytes));
    const xmlText = async (p: string) => {
      const f = zip.file(p);
      return f ? [...(await f.async("string")).matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("|") : null;
    };
    const headers = Object.keys(zip.files).filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p)).sort();
    const core = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
    cases[c.name] = {
      methodLines: lines,
      model,
      docxFilename: docx.filename,
      docxText: await xmlText("word/document.xml"),
      docxHeaderFooter: await Promise.all(headers.map(xmlText)),
      docxCore: { title: core.match(/<dc:title>([^<]*)</)?.[1] ?? null, description: core.match(/<dc:description>([^<]*)</)?.[1] ?? null, creator: core.match(/<dc:creator>([^<]*)</)?.[1] ?? null },
    };
  }
  out.cases = cases;
  // ── servis / kayıt / rota yardımcısı hata gövdeleri (sahte bağımlılık; ağ YOK) ─────────────────────────────
  const req = (kind: MonthlyKind, year: number, month: number) => ({ kind, year, month });
  const svc: Record<string, unknown> = {};
  const ready = () => ({ ok: true as const });
  svc.notCached = await S.getMonthlyEphemeris(req("western", 1601, 1), { db: null, callProvider: null }, { allowProvider: false });
  svc.disabled = await S.getMonthlyEphemeris(req("western", 1601, 2), { db: null, callProvider: null }, { allowProvider: true });
  svc.notReady = await S.getMonthlyEphemeris(req("western", 1601, 3), { db: null, callProvider: async () => ({ ok: true, raw: {}, attempts: 1 }) as never, independentCheckReady: () => ({ ok: false, reason: "test" }) }, { allowProvider: true });
  svc.rate = await S.getMonthlyEphemeris(req("western", 1601, 4), { db: null, callProvider: async () => ({ ok: true, raw: {}, attempts: 1 }) as never, independentCheckReady: ready, beforeProviderCall: async () => ({ ok: false, retryAfterSec: 7 }) }, { allowProvider: true });
  svc.failed = await S.getMonthlyEphemeris(req("western", 1601, 5), { db: null, callProvider: async () => ({ ok: false, kind: "http", status: 500, attempts: 1 }) as never, independentCheckReady: ready }, { allowProvider: true });
  svc.inconsistent = await S.getMonthlyEphemeris(req("western", 1601, 6), { db: null, callProvider: async () => ({ ok: true, raw: { year: 1, month: 1 }, attempts: 1 }) as never, independentCheckReady: ready }, { allowProvider: true });
  svc.consts = [S.CROSSCHECK_UNAVAILABLE_ERROR, S.CROSSCHECK_FAILED_ERROR];
  out.service = svc;
  const ctx = (code: string | null) => ({ db: fakeDb(code) as never, tenantId: "t", userId: "u" });
  const goodId = "6f1d1c8e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
  const rec: Record<string, unknown> = {};
  rec.badTitle = await R.saveMonthlyRecord(ctx(null), { kind: "western", year: 2026, month: 11, title: "x".repeat(201), saveRequestId: goodId }, { db: null });
  rec.badReqId = await R.saveMonthlyRecord(ctx(null), { kind: "western", year: 2026, month: 11, title: "T", saveRequestId: "no" }, { db: null });
  rec.badParse = await R.saveMonthlyRecord(ctx(null), { kind: "western", year: 2026, month: 0, saveRequestId: goodId }, { db: null });
  rec.notCached = await R.saveMonthlyRecord(ctx(null), { kind: "western", year: 1602, month: 1, title: "T", saveRequestId: goodId }, { db: null });
  rec.listPage = await R.listMonthlyRecords(ctx(null), new URLSearchParams("offset=200000"));
  rec.listKind = await R.listMonthlyRecords(ctx(null), new URLSearchParams("kind=x"));
  rec.listYear = await R.listMonthlyRecords(ctx(null), new URLSearchParams("year=12"));
  rec.listStore = await R.listMonthlyRecords(ctx("42P01"), new URLSearchParams(""));
  rec.listDb = await R.listMonthlyRecords(ctx("XX000"), new URLSearchParams(""));
  rec.getBadId = await R.getMonthlyRecord(ctx(null), "nope");
  rec.getMissing = await R.getMonthlyRecord(ctx(null), goodId);
  rec.defaultTitle = R.defaultTitle("vedic", 2026, 3);
  out.records = rec;
  const anyRate = await K.anyRate({ db: fakeDb(null), tenantId: "t", userId: "u" } as never);
  out.anyRate = anyRate ? { status: anyRate.status, body: await anyRate.json() } : null;
  // ── ekran ilk çizimi (sabit "şimdi": 25.11.2026) ─────────────────────────────────────────────────────────
  out.deskHtml = await withFixedNow(async () => {
    const { default: Desk } = await import("@/app/admin/astroloji/_components/ephemeris/MonthlyEphemerisDesk");
    return renderToStaticMarkup(createElement(Desk, { active: false }), locale);
  });
  return out;
}
