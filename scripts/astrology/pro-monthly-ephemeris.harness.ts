/**
 * GÖKYÜZÜ ATLASI — AYLIK EFEMERİS (Batı tropikal + Vedik sideral): sözleşme, izdüşüm, biçim, bağımsız kontrol, önbellek / çağrı sayısı,
 * kayıt + tenant izolasyonu, Word / PDF ve rota sırası testleri. AĞ YOK, ücretli çağrı YOK, gerçek DB YOK.
 *
 * Sağlayıcı yanıtı SENTETİKTİR: yerel JPL DE440 motorundan sağlayıcı biçiminde (4 ondalık, burç + burç içi derece, retro) üretilir —
 * gerçek sağlayıcı yanıtlarıyla bağımsız doğrulama ayrı dosyadadır (pro-monthly-ephemeris-provider.harness.ts, yerel kanıt).
 * Veritabanı bu dosyadaki küçük sahte istemcidir (tekillik, kayıt tavanı, "tablo yok" taklidi); gerçek PostgreSQL kısıtları
 * scripts/astrology/pg/monthly-ephemeris.mjs ile ayrıca doğrulanır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-monthly-ephemeris.harness.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { localPosition } from "@/lib/astrology/pro/ephemeris/local";
import { de440Status } from "@/lib/astrology/pro/ephemeris/de440/source";
import { MONTHLY_ENDPOINT, bodyVerification, daysInMonth, monthDates, monthlyProviderBody, parseMonthlyRequest, projectMonthly } from "@/lib/astrology/pro/monthly/contract";
import { crossCheckMonthly, independentCheckReady } from "@/lib/astrology/pro/monthly/crossCheck";
import { cellParts, cellText, methodLines, stripVs, trLocalNote } from "@/lib/astrology/pro/monthly/format";
import { buildMonthlyReport } from "@/lib/astrology/pro/monthly/reportModel";
import { renderMonthlyReport } from "@/lib/astrology/pro/monthly/reportRender";
import { getMonthlyRecord, listMonthlyRecords, loadMonthlyForReport, saveMonthlyRecord } from "@/lib/astrology/pro/monthly/records";
import { __resetMonthlyMemoryForTests, ensureVerified, getMonthlyEphemeris, isVerifiedPass, monthlyCacheKey, type MonthlyDeps } from "@/lib/astrology/pro/monthly/service";
import type { MonthlyKind, MonthlyRequest } from "@/lib/astrology/pro/monthly/types";
import type { RoxyCallResult } from "@/lib/astrology/providers/roxy/client";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}: ${(e as Error).message.split("\n").slice(0, 3).join(" | ")}`);
  }
}

// ─── Sentetik sağlayıcı yanıtı (yerel DE440 → sağlayıcı biçimi) ────────────────────────────────────────────────
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const n360 = (x: number) => ((x % 360) + 360) % 360;
function pos(name: string, lon: number, retro: boolean) {
  const L = r4(n360(lon)) % 360;
  const si = Math.floor(L / 30);
  return { planet: name, longitude: L, sign: SIGNS[si], degreeInSign: r4(L - si * 30), isRetrograde: retro };
}
const W_MAP: [string, string][] = [["Sun", "sun"], ["Moon", "moon"], ["Mercury", "mercury"], ["Venus", "venus"], ["Mars", "mars"], ["Jupiter", "jupiter"], ["Saturn", "saturn"], ["Uranus", "uranus"], ["Neptune", "neptune"], ["Pluto", "pluto"]];
const V_MAP: [string, string][] = [["Sun", "sun"], ["Moon", "moon"], ["Mars", "mars"], ["Mercury", "mercury"], ["Jupiter", "jupiter"], ["Venus", "venus"], ["Saturn", "saturn"]];
function synth(kind: MonthlyKind, year: number, month: number, o: { chiron?: boolean; vedicNode?: "mean_node" | "true_node"; zodiacOverride?: "tropical" } = {}) {
  const days = monthDates(year, month).map((date) => {
    const ms = Date.parse(`${date}T12:00:00Z`);
    if (kind === "western") {
      const out = W_MAP.map(([n, b]) => {
        const p = localPosition(b as never, ms, "tropical");
        return pos(n, p.lon, p.speed < 0);
      });
      const node = localPosition("true_node", ms, "tropical");
      out.push(pos("North Node", node.lon, node.speed < 0), pos("South Node", node.lon + 180, node.speed < 0));
      if (o.chiron !== false) out.push(pos("Chiron", 20 + (ms / 86_400_000) * 0.01, false));
      out.push(pos("Black Moon Lilith", 100 + (ms / 86_400_000) * 0.111, false));
      return { date, positions: out };
    }
    const z = o.zodiacOverride ?? "sidereal_lahiri";
    const out = V_MAP.map(([n, b]) => {
      const p = localPosition(b as never, ms, z);
      return pos(n, p.lon, p.speed < 0);
    });
    const node = localPosition(o.vedicNode ?? "mean_node", ms, z);
    out.push(pos("Rahu", node.lon, true), pos("Ketu", node.lon + 180, true));
    return { date, positions: out };
  });
  return { year, month, days };
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ─── Küçük sahte veritabanı (yalnız bu testin kullandığı PostgREST alt kümesi) ────────────────────────────────────
type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;
function fakeDb(opts: { missingTables?: string[]; cap?: number } = {}) {
  const tables: Record<string, Row[]> = {};
  const log: { table: string; op: string }[] = [];
  const uniq: Record<string, string[][]> = { astro_sky_monthly_ephemeris: [["tenant_id", "save_request_id"]], astro_sky_monthly_cache: [["cache_key"]] };
  const missing = (tb: string): Err => (opts.missingTables?.includes(tb) ? { code: "PGRST205", message: `relation ${tb} does not exist` } : null);
  function from(table: string) {
    const f: [string, unknown][] = [];
    let order: { col: string; asc: boolean }[] = [];
    let range: [number, number] | null = null;
    let op: "select" | "insert" | "upsert" = "select";
    let payload: Row | null = null;
    let upsertOpts: { ignoreDuplicates?: boolean } = {};
    const run = (mode: "many" | "single" | "maybe"): { data: unknown; error: Err } => {
      log.push({ table, op });
      const me = missing(table);
      if (me) return { data: null, error: me };
      const rows = (tables[table] ??= []);
      if (op === "insert" || op === "upsert") {
        const row: Row = { id: randomUUID(), created_at: new Date(Date.now() + rows.length).toISOString(), updated_at: new Date().toISOString(), ...(payload as Row | null) };
        for (const k of uniq[table] ?? []) {
          if (rows.some((r) => k.every((c) => String(r[c]) === String(row[c])))) {
            if (op === "upsert" && upsertOpts.ignoreDuplicates) return { data: null, error: null };
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
        }
        if (table === "astro_sky_monthly_ephemeris" && opts.cap !== undefined && rows.filter((r) => r.tenant_id === row.tenant_id && r.owner_user_id === row.owner_user_id).length >= opts.cap) {
          return { data: null, error: { code: "P0001", message: `ASTRO_RECORD_CAP:${table}:${opts.cap}` } };
        }
        rows.push(row);
        return { data: mode === "many" ? [row] : row, error: null };
      }
      let hit = rows.filter((r) => f.every(([c, v]) => String(r[c]) === String(v)));
      for (const o of [...order].reverse()) hit = [...hit].sort((a, b) => (String(a[o.col]) < String(b[o.col]) ? -1 : String(a[o.col]) > String(b[o.col]) ? 1 : 0) * (o.asc ? 1 : -1));
      if (range) hit = hit.slice(range[0], range[1] + 1);
      if (mode === "many") return { data: hit, error: null };
      if (mode === "single" && hit.length !== 1) return { data: null, error: { code: "PGRST116", message: "not single" } };
      return { data: hit[0] ?? null, error: null };
    };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (f.push([c, v]), b),
      order: (col: string, o: { ascending: boolean }) => (order.push({ col, asc: o.ascending }), b),
      range: (a: number, z: number) => ((range = [a, z]), b),
      insert: (row: Row) => ((op = "insert"), (payload = row), b),
      upsert: (row: Row, o: { ignoreDuplicates?: boolean }) => {
        op = "upsert";
        payload = row;
        upsertOpts = o;
        return Promise.resolve(run("maybe"));
      },
      maybeSingle: () => Promise.resolve(run("maybe")),
      single: () => Promise.resolve(run("single")),
      then: (res: (v: { data: unknown; error: Err }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run("many")).then(res, rej),
    };
    void order;
    order = [];
    return b;
  }
  const rpc = async () => ({ data: { allowed: true, retry_after: 0 }, error: null });
  return { client: { from, rpc } as unknown as import("@supabase/supabase-js").SupabaseClient, tables, log };
}

function providerFake(responses: (req: MonthlyRequest) => unknown, counter: { n: number }, behavior: { fail?: boolean; delayMs?: number } = {}) {
  return async (endpoint: string, body: Record<string, unknown>): Promise<RoxyCallResult> => {
    counter.n++;
    if (behavior.delayMs) await new Promise((r) => setTimeout(r, behavior.delayMs));
    if (behavior.fail) return { ok: false, kind: "server_error", status: 500, attempts: 1 };
    const kind: MonthlyKind = endpoint === MONTHLY_ENDPOINT.vedic ? "vedic" : "western";
    return { ok: true, raw: responses({ kind, year: body.year as number, month: body.month as number }), attempts: 1 };
  };
}

async function main() {
  const de = de440Status();
  if (!de.ok) {
    console.log(`FAIL DE440 verisi yok (${de.reason}) — bağımsız kontrol ve sentetik yanıt üretilemez`);
    process.exit(1);
  }

  // ─── A) Sözleşme ─────────────────────────────────────────────────────────────────────────────────────────────
  await t("A1 istek doğrulama: tür, yıl, ay; ürün aralığı 1600–2600 (dışı istek atılmadan reddedilir)", () => {
    assert.ok(parseMonthlyRequest({ kind: "western", year: 2026, month: 11 }).ok);
    assert.ok(parseMonthlyRequest({ kind: "vedic", year: "2024", month: "2" }).ok);
    for (const bad of [{ kind: "x", year: 2026, month: 1 }, { kind: "western", year: 2026, month: 13 }, { kind: "western", year: 2026.5, month: 1 }, { kind: "vedic", year: 1599, month: 12 }, { kind: "vedic", year: 2601, month: 1 }, null, []]) {
      assert.equal(parseMonthlyRequest(bad).ok, false, JSON.stringify(bad));
    }
    const oor = parseMonthlyRequest({ kind: "western", year: 1551, month: 1 });
    assert.ok(!oor.ok && oor.error.code === "OUT_OF_RANGE");
  });
  await t("A2 sağlayıcı gövdesi: Batı {year,month}; Vedik koordinat sistemi AÇIKÇA 'sidereal' (tropikal/sideral karışmaz)", () => {
    assert.deepEqual(monthlyProviderBody({ kind: "western", year: 2026, month: 11 }), { year: 2026, month: 11 });
    assert.deepEqual(monthlyProviderBody({ kind: "vedic", year: 2026, month: 11 }), { year: 2026, month: 11, coordinateSystem: "sidereal" });
    assert.equal(MONTHLY_ENDPOINT.western, "/astrology/planets/monthly");
    assert.equal(MONTHLY_ENDPOINT.vedic, "/vedic-astrology/planetary-positions/monthly");
  });
  await t("A3 ay uzunlukları: 2024-02=29, 1900-02=28, 2000-02=29, 2100-02=28, 2026-11=30, 2026-12=31; tarih dizisi kesintisiz", () => {
    assert.deepEqual([daysInMonth(2024, 2), daysInMonth(1900, 2), daysInMonth(2000, 2), daysInMonth(2100, 2), daysInMonth(2026, 11), daysInMonth(2026, 12), daysInMonth(1600, 2), daysInMonth(2600, 2)], [29, 28, 29, 28, 30, 31, 29, 28]);
    const d = monthDates(2024, 2);
    assert.equal(d[0], "2024-02-01");
    assert.equal(d.at(-1), "2024-02-29");
  });

  // ─── B) İzdüşüm (katı) ───────────────────────────────────────────────────────────────────────────────────────
  const W11 = synth("western", 2026, 11);
  const V11 = synth("vedic", 2026, 11);
  const req = (kind: MonthlyKind, year = 2026, month = 11): MonthlyRequest => ({ kind, year, month });
  await t("B1 geçerli Batı (14 cisim) ve Vedik (9 graha) yanıtı kabul; cisim sırası sabit", () => {
    const w = projectMonthly(req("western"), W11);
    const v = projectMonthly(req("vedic"), V11);
    assert.ok(w.ok && v.ok);
    assert.equal(w.ok && w.days.length, 30);
    assert.equal(w.ok && w.bodies.length, 14);
    assert.equal(v.ok && v.bodies.join(","), "sun,moon,mars,mercury,jupiter,venus,saturn,rahu,ketu");
  });
  const rejects: [string, (x: ReturnType<typeof synth>) => void, MonthlyKind?][] = [
    ["yıl yankısı", (x) => (x.year = 2025)],
    ["ay yankısı", (x) => (x.month = 10)],
    ["eksik gün", (x) => x.days.pop()],
    ["fazla gün", (x) => x.days.push(clone(x.days[0]))],
    ["tarih sırası", (x) => ([x.days[3], x.days[4]] = [x.days[4], x.days[3]])],
    ["iki kez aynı cisim", (x) => x.days[2].positions.push(clone(x.days[2].positions[0]))],
    ["eksik zorunlu cisim (Mars)", (x) => (x.days[5].positions = x.days[5].positions.filter((p) => p.planet !== "Mars"))],
    ["burç adı boylamla tutarsız", (x) => (x.days[1].positions[0].sign = "Leo")],
    ["burç içi derece tutarsız", (x) => (x.days[1].positions[1].degreeInSign += 0.01)],
    ["boylam aralık dışı", (x) => (x.days[1].positions[2].longitude = 361)],
    ["retro alanı boolean değil", (x) => ((x.days[1].positions[2] as Record<string, unknown>).isRetrograde = "true")],
    ["güney düğüm karşıtlığı bozuk", (x) => (x.days[6].positions.find((p) => p.planet === "South Node")!.longitude += 0.01)],
    ["Kiron ayın yalnız bazı günlerinde", (x) => (x.days[9].positions = x.days[9].positions.filter((p) => p.planet !== "Chiron"))],
    ["Ketu karşıtlığı bozuk", (x) => (x.days[0].positions.find((p) => p.planet === "Ketu")!.longitude += 0.01), "vedic"],
  ];
  for (const [name, mut, k] of rejects) {
    await t(`B2 RED: ${name}`, () => {
      const x = clone(k === "vedic" ? V11 : W11);
      mut(x);
      const r = projectMonthly(req(k ?? "western"), x);
      assert.equal(r.ok, false);
    });
  }
  await t("B3 Kiron ayın HİÇBİR gününde yoksa kabul: tablodan çıkar, 'bu ay verilmedi' listesine girer (eksik gün yok)", () => {
    const r = projectMonthly(req("western"), synth("western", 2026, 11, { chiron: false }));
    assert.ok(r.ok && r.missingBodies.join() === "chiron" && r.bodies.length === 13 && !r.bodies.includes("chiron"));
  });
  await t("B4 bilinmeyen yeni cisim adı yok sayılır (beyaz liste); serbest metin alınmaz", () => {
    const x = clone(W11);
    for (const d of x.days) d.positions.push({ ...d.positions[0], planet: "Eris" });
    const r = projectMonthly(req("western"), x);
    assert.ok(r.ok && r.ignoredNames.includes("Eris") && !JSON.stringify(r.days).includes("Eris"));
  });
  await t("B5 burç sınırı: boylam 59,9999 → Boğa 29,9999 ve iki alanın ayrı yuvarlanmasıyla Boğa/İkizler 30/0 kenarı kabul", () => {
    const x = clone(W11);
    const p = x.days[0].positions[0];
    Object.assign(p, { longitude: 59.9999, sign: "Taurus", degreeInSign: 29.9999 });
    assert.ok(projectMonthly(req("western"), x).ok);
    Object.assign(p, { longitude: 59.9999, sign: "Gemini", degreeInSign: 0 });
    assert.ok(projectMonthly(req("western"), x).ok);
  });

  // ─── C) Biçim (ekran = Word = PDF aynı fonksiyon) ─────────────────────────────────────────────────────────────
  await t("C1 derece/dakika AŞAĞI yuvarlanır, kayan nokta tuzağı yok (23,4° → 23°24′; 59,9999° → Boğa 29°59′; 60° → İkizler 00°00′)", () => {
    assert.equal(cellParts({ lon: 23.4, retro: false }).degMin, "23°24′");
    assert.equal(cellParts({ lon: 0.0166, retro: false }).degMin, "00°00′");
    assert.equal(cellParts({ lon: 0.0167, retro: false }).degMin, "00°01′");
    const a = cellParts({ lon: 59.9999, retro: false });
    assert.equal(`${a.signName} ${a.degMin}`, "Boğa 29°59′");
    const b = cellParts({ lon: 60, retro: true });
    assert.equal(`${b.signName} ${b.degMin} ${b.retro}`, "İkizler 00°00′ true");
    assert.equal(stripVs(cellText({ lon: 359.9999, retro: true })), "♓ Balık 29°59′ ℞");
    assert.ok(cellParts({ lon: 10, retro: false }).signGlyph.endsWith("\uFE0E"), "ekranda metin sunumu (emoji değil)");
    assert.equal(cellParts({ lon: 123.4567, retro: false }).lonText, "123,4567°");
  });
  await t("C2 Türkiye saati notu yalnız 2016-10 ve sonrası (öncesinde Türkiye UTC+3 değildi)", () => {
    assert.equal(trLocalNote(2016, 9), "");
    assert.match(trLocalNote(2016, 10), /15\.00/);
    assert.match(trLocalNote(2026, 11), /15\.00/);
    assert.equal(trLocalNote(1900, 2), "");
  });
  await t("C3 yöntem metni: 12.00 UTC, kesin geçiş saati iddiası yok, Vedik'te tek ayanamsa Lahiri, sağlayıcı adı YOK", () => {
    const w = projectMonthly(req("western"), W11);
    assert.ok(w.ok);
    const cc = crossCheckMonthly("western", w.days);
    const lines = methodLines({ kind: "vedic", year: 2026, month: 11, ayanamsa: "lahiri", nodeMethod: "mean", missingBodies: [], crossCheck: cc }).join(" ");
    assert.match(lines, /12\.00 UTC/);
    assert.match(lines, /kesin saatini GÖSTERMEZ/);
    assert.match(lines, /Lahiri ayanamsası — bu tablonun TEK ayanamsasıdır/);
    assert.doesNotMatch(lines.toLowerCase(), /roxy/);
  });

  // ─── D) Bağımsız kontrol ─────────────────────────────────────────────────────────────────────────────────────
  for (const [k, y, mo] of [["western", 2024, 2], ["western", 2026, 12], ["western", 2027, 1], ["vedic", 2024, 2], ["vedic", 1900, 2], ["vedic", 2027, 1]] as const) {
    await t(`D1 ${k} ${y}-${String(mo).padStart(2, "0")}: sentetik (DE440 → 4 ondalık) tablo bağımsız kontrolden geçer (≤0,19″, retro 0 uyuşmazlık)`, () => {
      const r = projectMonthly(req(k, y, mo), synth(k, y, mo));
      assert.ok(r.ok);
      const cc = crossCheckMonthly(k, r.days);
      assert.equal(cc.status, "pass", cc.reason);
      assert.ok(cc.maxAbsArcsec <= 0.19, String(cc.maxAbsArcsec));
      assert.equal(cc.retroMismatches, 0);
      assert.equal(cc.compared, r.days.length * (k === "western" ? 11 : 8));
    });
  }
  await t("D2 tolerans dışı tek değer (Mars +3″) → FAIL (tablo gösterilmez/saklanmaz)", () => {
    const x = clone(W11);
    const p = x.days[9].positions.find((q) => q.planet === "Mars")!;
    Object.assign(p, pos("Mars", p.longitude + 3 / 3600, p.isRetrograde));
    const r = projectMonthly(req("western"), x);
    assert.ok(r.ok);
    const cc = crossCheckMonthly("western", r.days);
    assert.equal(cc.status, "fail");
    assert.equal(cc.maxAt?.body, "mars");
  });
  await t("D3 retro bayrağı ters (istasyon dışı gün) → FAIL", () => {
    const x = clone(W11);
    const p = x.days[3].positions.find((q) => q.planet === "Jupiter")!;
    p.isRetrograde = !p.isRetrograde;
    const r = projectMonthly(req("western"), x);
    assert.ok(r.ok && crossCheckMonthly("western", r.days).status === "fail");
  });
  await t("D4 YÖNTEM KORUMASI: Vedik Rahu gerçek düğümle üretilirse → FAIL (sağlayıcı ortalama düğüm verir)", () => {
    const r = projectMonthly(req("vedic"), synth("vedic", 2026, 11, { vedicNode: "true_node" }));
    assert.ok(r.ok && crossCheckMonthly("vedic", r.days).status === "fail");
  });
  await t("D5 KARIŞMA KORUMASI: Vedik tabloya tropikal değerler gelirse (≈24° fark) → FAIL", () => {
    const r = projectMonthly(req("vedic"), synth("vedic", 2026, 11, { zodiacOverride: "tropical" }));
    assert.ok(r.ok && crossCheckMonthly("vedic", r.days).status === "fail");
  });
  await t("D6 Kiron ve Lilith yerel bağımsız motoru olmadığı için 'kontrol dışı' olarak AÇIKÇA işaretlenir", () => {
    const r = projectMonthly(req("western"), W11);
    assert.ok(r.ok);
    const cc = crossCheckMonthly("western", r.days);
    assert.deepEqual(cc.uncheckedBodies, ["chiron", "lilith"]);
  });

  // ─── E) Önbellek + çağrı sayısı ──────────────────────────────────────────────────────────────────────────────
  const responder = (q: MonthlyRequest) => synth(q.kind, q.year, q.month);
  await t("E1 aynı ay: 1. istek sağlayıcı (1 çağrı), 2. istek bellek (0); tür ayrı anahtardır (+1)", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const db = fakeDb();
    const deps: MonthlyDeps = { db: db.client, callProvider: providerFake(responder, c) };
    const a = await getMonthlyEphemeris(req("western"), deps, { allowProvider: true });
    const b = await getMonthlyEphemeris(req("western"), deps, { allowProvider: true });
    const v = await getMonthlyEphemeris(req("vedic"), deps, { allowProvider: true });
    assert.ok(a.ok && a.cache === "provider" && a.providerCalls === 1);
    assert.ok(b.ok && b.cache === "memory" && b.providerCalls === 0);
    assert.ok(v.ok && v.cache === "provider" && v.result.zodiac === "sidereal" && v.result.ayanamsa === "lahiri");
    assert.equal(c.n, 2);
    assert.equal(db.tables.astro_sky_monthly_cache?.length, 2, "kalıcı önbelleğe yazıldı");
  });
  await t("E2 süreç belleği boşalınca kalıcı önbellekten okunur (0 çağrı)", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const db = fakeDb();
    await getMonthlyEphemeris(req("western", 2024, 2), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    __resetMonthlyMemoryForTests();
    const again = await getMonthlyEphemeris(req("western", 2024, 2), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    assert.ok(again.ok && again.cache === "db" && again.providerCalls === 0);
    assert.equal(c.n, 1);
  });
  await t("E3 eşzamanlı 10 istek (aynı ay) → sağlayıcıya TEK çağrı (tek uçuş)", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const deps: MonthlyDeps = { db: fakeDb().client, callProvider: providerFake(responder, c, { delayMs: 40 }) };
    const rs = await Promise.all(Array.from({ length: 10 }, () => getMonthlyEphemeris(req("vedic", 2027, 1), deps, { allowProvider: true })));
    assert.ok(rs.every((r) => r.ok));
    assert.equal(c.n, 1);
    assert.equal(rs.reduce((s, r) => s + r.providerCalls, 0), 1);
  });
  await t("E4 allowProvider:false (rapor / kayıt) önbellekte yoksa NOT_CACHED ve 0 çağrı", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const r = await getMonthlyEphemeris(req("western", 2030, 5), { db: fakeDb().client, callProvider: providerFake(responder, c) }, { allowProvider: false });
    assert.ok(!r.ok && r.error.code === "NOT_CACHED");
    assert.equal(c.n, 0);
  });
  await t("E5 sağlayıcı hatası / tutarsız yanıt / kontrol hatası ÖNBELLEĞE YAZILMAZ (sonraki istek yeniden dener)", async () => {
    __resetMonthlyMemoryForTests();
    const db = fakeDb();
    const c = { n: 0 };
    const f1 = await getMonthlyEphemeris(req("western", 2026, 3), { db: db.client, callProvider: providerFake(responder, c, { fail: true }) }, { allowProvider: true });
    assert.ok(!f1.ok && f1.error.code === "PROVIDER_FAILED" && f1.providerCalls === 1);
    const bad = (q: MonthlyRequest) => {
      const x = synth(q.kind, q.year, q.month);
      x.days.pop();
      return x;
    };
    const f2 = await getMonthlyEphemeris(req("western", 2026, 3), { db: db.client, callProvider: providerFake(bad, c) }, { allowProvider: true });
    assert.ok(!f2.ok && f2.error.code === "PROVIDER_INCONSISTENT");
    const off = (q: MonthlyRequest) => {
      const x = synth(q.kind, q.year, q.month);
      const p = x.days[0].positions[0];
      Object.assign(p, pos(p.planet, p.longitude + 0.01, p.isRetrograde));
      return x;
    };
    const f3 = await getMonthlyEphemeris(req("western", 2026, 3), { db: db.client, callProvider: providerFake(off, c) }, { allowProvider: true });
    assert.ok(!f3.ok && f3.error.code === "CROSSCHECK_FAILED");
    assert.equal(db.tables.astro_sky_monthly_cache?.length ?? 0, 0);
    assert.equal(c.n, 3);
  });
  await t("E6 hız sınırı: önbellek ıskasında sınır doluysa sağlayıcıya istek GİTMEZ", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const r = await getMonthlyEphemeris(req("western", 2026, 4), { db: null, callProvider: providerFake(responder, c), beforeProviderCall: async () => ({ ok: false, retryAfterSec: 120 }) }, { allowProvider: true });
    assert.ok(!r.ok && r.error.code === "RATE_LIMITED" && r.error.retryAfterSec === 120);
    assert.equal(c.n, 0);
  });
  await t("E7 kalıcı önbellek tablosu yoksa (migration uygulanmamış) yalnız bellekle çalışır, hata kullanıcıya yansımaz", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const db = fakeDb({ missingTables: ["astro_sky_monthly_cache"] });
    const r = await getMonthlyEphemeris(req("vedic", 2026, 12), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    const r2 = await getMonthlyEphemeris(req("vedic", 2026, 12), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    assert.ok(r.ok && r2.ok && r2.cache === "memory");
    assert.equal(c.n, 1);
  });
  await t("E8 önbellek anahtarı: yıl, ay, tür ayrıştırır; aynı girdi aynı anahtar; 64 hex", () => {
    const k = monthlyCacheKey(req("western"));
    assert.match(k, /^[0-9a-f]{64}$/);
    assert.equal(k, monthlyCacheKey(req("western")));
    assert.notEqual(k, monthlyCacheKey(req("vedic")));
    assert.notEqual(k, monthlyCacheKey(req("western", 2026, 12)));
    assert.notEqual(k, monthlyCacheKey(req("western", 2025, 11)));
  });
  await t("E9 sağlayıcı yapılandırılmamış + önbellekte yok → PROVIDER_DISABLED (0 çağrı); önbellekteki ay yine açılır", async () => {
    __resetMonthlyMemoryForTests();
    const db = fakeDb();
    const c = { n: 0 };
    await getMonthlyEphemeris(req("western", 2026, 6), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    __resetMonthlyMemoryForTests();
    const off = await getMonthlyEphemeris(req("western", 2026, 7), { db: db.client, callProvider: null }, { allowProvider: true });
    const cached = await getMonthlyEphemeris(req("western", 2026, 6), { db: db.client, callProvider: null }, { allowProvider: true });
    assert.ok(!off.ok && off.error.code === "PROVIDER_DISABLED");
    assert.ok(cached.ok && cached.cache === "db");
    assert.equal(c.n, 1);
  });

  await t("E10 iki ayrı sunucu örneği aynı ayı yazarsa (yinelenen anahtar 23505) sessizce geçilir; tek satır kalır", async () => {
    __resetMonthlyMemoryForTests();
    const db = fakeDb();
    const c = { n: 0 };
    await getMonthlyEphemeris(req("western", 2026, 8), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    // Başka örnek: bellek boş + kalıcı önbelleği henüz görmemiş gibi (okuma ıskası) → aynı anahtarı yeniden yazar.
    __resetMonthlyMemoryForTests();
    const blind = { ...db.client, from: (tb: string) => (tb === "astro_sky_monthly_cache" ? { ...db.client.from(tb), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) } : db.client.from(tb)) } as unknown as typeof db.client;
    const r = await getMonthlyEphemeris(req("western", 2026, 8), { db: blind, callProvider: providerFake(responder, c) }, { allowProvider: true });
    assert.ok(r.ok);
    assert.equal(db.tables.astro_sky_monthly_cache?.length, 1);
    assert.equal(c.n, 2);
  });

  await t("E11 önbellek satırı kişisel veri taşımaz: istek yalnız yıl/ay(/koordinat), kişi/tenant/uzman kolonu yok", async () => {
    __resetMonthlyMemoryForTests();
    const db = fakeDb();
    await getMonthlyEphemeris(req("vedic", 2026, 9), { db: db.client, callProvider: providerFake(responder, { n: 0 }) }, { allowProvider: true });
    const row = db.tables.astro_sky_monthly_cache![0];
    assert.deepEqual(Object.keys(row.request as object).sort(), ["coordinateSystem", "month", "year"]);
    const keys = Object.keys(row).filter((k) => !["id", "created_at", "updated_at"].includes(k)).sort();
    assert.deepEqual(keys, ["adapter_version", "cache_key", "endpoint", "kind", "month", "provider", "provider_api_version", "raw_response", "request", "technical", "year"]);
  });

  await t("E12 YARIŞ: kalıcı önbellek okuması yavaşken aynı ayın isteği tamamlanırsa ikinci istek bellekten döner (ikinci ücretli çağrı YOK)", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const db = fakeDb();
    const slowDb = { ...db.client, from: (tb: string) => (tb === "astro_sky_monthly_cache" ? { ...db.client.from(tb), select: () => ({ eq: () => ({ maybeSingle: () => new Promise((res) => setTimeout(() => res({ data: null, error: null }), 120)) }) }) } : db.client.from(tb)) } as unknown as typeof db.client;
    const fastDeps: MonthlyDeps = { db: db.client, callProvider: providerFake(responder, c, { delayMs: 10 }) };
    const slowDeps: MonthlyDeps = { db: slowDb, callProvider: providerFake(responder, c, { delayMs: 10 }) };
    const [a, b] = await Promise.all([getMonthlyEphemeris(req("western", 2031, 7), fastDeps, { allowProvider: true }), getMonthlyEphemeris(req("western", 2031, 7), slowDeps, { allowProvider: true })]);
    assert.ok(a.ok && b.ok);
    assert.equal(c.n, 1, `sağlayıcı çağrısı ${c.n}`);
  });
  for (const [label, outcome] of [
    ["zaman aşımı", { ok: false, kind: "timeout", status: null, attempts: 1 }],
    ["kota bitti (429)", { ok: false, kind: "rate_limited", status: 429, attempts: 1 }],
    ["anahtar/plan (401)", { ok: false, kind: "unauthorized", status: 401, attempts: 1 }],
    ["bozuk JSON", { ok: false, kind: "malformed_json", status: 200, attempts: 1 }],
  ] as const) {
    await t(`E13 sağlayıcı ${label} → PROVIDER_FAILED, önbelleğe YAZILMAZ, yeniden deneme YOK (1 çağrı)`, async () => {
      __resetMonthlyMemoryForTests();
      const db = fakeDb();
      let n = 0;
      const r = await getMonthlyEphemeris(req("vedic", 2032, 2), { db: db.client, callProvider: async () => (n++, outcome as RoxyCallResult) }, { allowProvider: true });
      assert.ok(!r.ok && r.error.code === "PROVIDER_FAILED");
      assert.equal(n, 1);
      assert.equal(db.tables.astro_sky_monthly_cache?.length ?? 0, 0);
      assert.ok(!JSON.stringify(r).match(/local-fake|apiKey|X-API-Key/i), "hata yanıtı gizli bilgi taşımaz");
    });
  }

  // ─── V) BAĞIMSIZ DOĞRULAMA ZORUNLU (Owner kararı 2026-11-25): yalnız PASS gösterilir / önbelleğe / kayda girer ────────
  const NOT_READY = () => ({ ok: false as const, reason: "test: DE440 yok" });
  const cacheRows = (db: ReturnType<typeof fakeDb>) => db.tables.astro_sky_monthly_cache?.length ?? 0;
  const withEnv = async (k: string, v: string, fn: () => Promise<void> | void) => {
    const old = process.env[k];
    process.env[k] = v;
    try {
      await fn();
    } finally {
      if (old === undefined) delete process.env[k];
      else process.env[k] = old;
    }
  };
  await t("V1 DE440 kullanılamıyor (hazırlık sorgusu false) → CROSSCHECK_UNAVAILABLE; sağlayıcı ÇAĞRILMAZ (0 ücret); bellek/önbellek boş; DE440 dönünce normal PASS (1 çağrı)", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const db = fakeDb();
    const r = await getMonthlyEphemeris(req("western", 2033, 3), { db: db.client, callProvider: providerFake(responder, c), independentCheckReady: NOT_READY }, { allowProvider: true });
    assert.ok(!r.ok && r.error.code === "CROSSCHECK_UNAVAILABLE", JSON.stringify(r));
    assert.match(r.ok ? "" : r.error.error, /Geçici bir sorun/);
    assert.equal(c.n, 0);
    assert.equal(r.providerCalls, 0);
    assert.equal(cacheRows(db), 0);
    const again = await getMonthlyEphemeris(req("western", 2033, 3), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: false });
    assert.ok(!again.ok && again.error.code === "NOT_CACHED", "doğrulanmamış sonuç belleğe yazılmadı");
    const ok = await getMonthlyEphemeris(req("western", 2033, 3), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
    assert.ok(ok.ok && ok.result.crossCheck.status === "pass" && ok.result.crossCheck.compared > 0);
    assert.equal(c.n, 1);
    assert.equal(cacheRows(db), 1);
  });
  await t("V2 GERÇEK hazırlık sorgusu: motor 'legacy' (DE440 değil) → independentCheckReady false ve crossCheck 'unavailable'; DE440'ta true", async () => {
    assert.equal(independentCheckReady().ok, true);
    await withEnv("ATLAS_PRO_EPHEMERIS_ENGINE", "legacy", () => {
      assert.equal(independentCheckReady().ok, false);
      const pr = projectMonthly(req("vedic"), synth("vedic", 2026, 11));
      assert.ok(pr.ok);
      assert.equal(crossCheckMonthly("vedic", pr.days).status, "unavailable");
    });
  });
  await t("V3 DE440 çalışmıyor (sağlayıcı çağrısından SONRA kontrol yapılamadı) → sonuç REDDEDİLİR, önbelleğe/belleğe YAZILMAZ, yeniden deneme YOK (1 çağrı)", async () => {
    __resetMonthlyMemoryForTests();
    const c = { n: 0 };
    const db = fakeDb();
    await withEnv("ATLAS_PRO_EPHEMERIS_ENGINE", "legacy", async () => {
      const r = await getMonthlyEphemeris(req("vedic", 2033, 4), { db: db.client, callProvider: providerFake(responder, c), independentCheckReady: () => ({ ok: true }) }, { allowProvider: true });
      assert.ok(!r.ok && r.error.code === "CROSSCHECK_UNAVAILABLE", JSON.stringify(r).slice(0, 200));
      assert.equal(r.providerCalls, 1);
    });
    assert.equal(c.n, 1);
    assert.equal(cacheRows(db), 0);
    const mem = await getMonthlyEphemeris(req("vedic", 2033, 4), { db: db.client, callProvider: null }, { allowProvider: false });
    assert.ok(!mem.ok && mem.error.code === "NOT_CACHED");
  });
  await t("V4 hesaplama istisnası / geçersiz tarih / eksik karşılaştırma → 'unavailable' (asla PASS değil)", () => {
    const pr = projectMonthly(req("western"), synth("western", 2026, 11));
    assert.ok(pr.ok);
    const badDate = pr.days.map((d, i) => (i === 3 ? { ...d, date: "2026-13-45" } : d));
    assert.equal(crossCheckMonthly("western", badDate).status, "unavailable");
    const missingBody = pr.days.map((d, i) => (i === 5 ? { ...d, positions: d.positions.filter((x) => x.body !== "mars") } : d));
    assert.equal(crossCheckMonthly("western", missingBody).status, "unavailable");
    assert.equal(crossCheckMonthly("western", []).status, "unavailable");
    assert.equal(isVerifiedPass({ ...crossCheckMonthly("western", pr.days), compared: 0 }), false, "compared 0 ile PASS sayılmaz");
  });
  await t("V5 bozuk/eski önbellek: 'unavailable' satırı + DOĞRU veri → yerelde yeniden kontrol PASS → gösterilir (0 çağrı); bozuk veri → CROSSCHECK_FAILED (0 çağrı); veri kontrol edilemiyor → CROSSCHECK_UNAVAILABLE (0 çağrı)", async () => {
    const pr = projectMonthly(req("western", 2034, 5), synth("western", 2034, 5));
    assert.ok(pr.ok);
    const base = { kind: "western", year: 2034, month: 5, zodiac: "tropical", ayanamsa: null, nodeMethod: "true", timeOfDay: "12:00", timeReference: "UTC", bodies: pr.bodies, missingBodies: pr.missingBodies, days: pr.days, source: { id: "provider", endpoint: MONTHLY_ENDPOINT.western, adapterVersion: "monthly-ephemeris-1", providerApiVersion: "v2", fetchedAt: "2026-11-24T00:00:00.000Z" }, crossCheck: { status: "unavailable", compared: 0, maxAbsArcsec: 0, maxAt: null, retroMismatches: 0, retroStationSkipped: 0, checkedBodies: [], uncheckedBodies: [], method: "" } };
    const tampered = { ...base, days: pr.days.map((d) => ({ ...d, positions: d.positions.map((x) => (x.body === "venus" ? { ...x, lon: (x.lon + 1) % 360 } : x)) })) };
    const broken = { ...base, days: pr.days.map((d, i) => (i === 0 ? { ...d, date: "bozuk" } : d)) };
    for (const [label, technical, expect] of [["doğru veri", base, "ok"], ["bozuk veri", tampered, "CROSSCHECK_FAILED"], ["kontrol edilemeyen veri", broken, "CROSSCHECK_UNAVAILABLE"]] as const) {
      __resetMonthlyMemoryForTests();
      const db = fakeDb();
      (db.tables.astro_sky_monthly_cache ??= []).push({ cache_key: monthlyCacheKey(req("western", 2034, 5)), technical } as never);
      const c = { n: 0 };
      const r = await getMonthlyEphemeris(req("western", 2034, 5), { db: db.client, callProvider: providerFake(responder, c) }, { allowProvider: true });
      assert.equal(c.n, 0, `${label}: ücretli çağrı yapılmamalı`);
      if (expect === "ok") assert.ok(r.ok && r.result.crossCheck.status === "pass" && r.cache === "db", label);
      else assert.ok(!r.ok && r.error.code === expect, `${label}: ${JSON.stringify(r).slice(0, 160)}`);
    }
  });
  await t("V6 önceden PASS almış önbellek satırı olduğu gibi kullanılır (yeniden hesap/bozma yok, 0 çağrı)", async () => {
    __resetMonthlyMemoryForTests();
    const pr = projectMonthly(req("vedic", 2034, 6), synth("vedic", 2034, 6));
    assert.ok(pr.ok);
    const cc = crossCheckMonthly("vedic", pr.days);
    assert.equal(cc.status, "pass");
    const technical = { kind: "vedic", year: 2034, month: 6, zodiac: "sidereal", ayanamsa: "lahiri", nodeMethod: "mean", timeOfDay: "12:00", timeReference: "UTC", bodies: pr.bodies, missingBodies: [], days: pr.days, source: { id: "provider", endpoint: MONTHLY_ENDPOINT.vedic, adapterVersion: "monthly-ephemeris-1", providerApiVersion: "v2", fetchedAt: "2026-11-24T00:00:00.000Z" }, crossCheck: cc };
    const db = fakeDb();
    (db.tables.astro_sky_monthly_cache ??= []).push({ cache_key: monthlyCacheKey(req("vedic", 2034, 6)), technical } as never);
    const c = { n: 0 };
    const r = await getMonthlyEphemeris(req("vedic", 2034, 6), { db: db.client, callProvider: providerFake(responder, c), independentCheckReady: NOT_READY }, { allowProvider: true });
    assert.ok(r.ok && r.cache === "db");
    assert.deepEqual(r.result.crossCheck, cc, "saklanan PASS kontrolü korunur");
    assert.equal(c.n, 0);
  });
  await t("V7 ensureVerified: PASS dışı kayıt anlık görüntüsü yerelde yeniden denetlenir; DE440 yoksa açılmaz", async () => {
    const pr = projectMonthly(req("western"), synth("western", 2026, 11));
    assert.ok(pr.ok);
    const e = { kind: "western", year: 2026, month: 11, days: pr.days, crossCheck: { status: "unavailable", compared: 0 } } as never;
    assert.equal(ensureVerified(e).ok, true);
    await withEnv("ATLAS_PRO_EPHEMERIS_ENGINE", "legacy", () => {
      const v = ensureVerified(e);
      assert.ok(!v.ok && v.error.code === "CROSSCHECK_UNAVAILABLE");
    });
  });

  // ─── F) Kayıt + tenant / uzman izolasyonu ────────────────────────────────────────────────────────────────────
  const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const U1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
  const U2 = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
  __resetMonthlyMemoryForTests();
  const rdb = fakeDb({ cap: 3 });
  const pc = { n: 0 };
  await getMonthlyEphemeris(req("western"), { db: rdb.client, callProvider: providerFake(responder, pc) }, { allowProvider: true });
  await getMonthlyEphemeris(req("vedic", 2024, 2), { db: rdb.client, callProvider: providerFake(responder, pc) }, { allowProvider: true });
  const ctx1 = { db: rdb.client, tenantId: TA, userId: U1 };
  let savedId = "";
  await t("F1 kayıt: içerik SUNUCU önbelleğinden (istemci tablosu yok sayılır), 0 sağlayıcı çağrısı, tür/zodyak/ayanamsa/zaman/sürüm kolonları dolu", async () => {
    const before = pc.n;
    const r = await saveMonthlyRecord(ctx1, { kind: "western", year: 2026, month: 11, saveRequestId: randomUUID(), result: { days: [] } }, { db: rdb.client });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = rdb.tables.astro_sky_monthly_ephemeris![0];
    assert.equal(row.kind, "western");
    assert.equal(row.zodiac, "tropical");
    assert.equal(row.ayanamsa, null);
    assert.equal(row.time_reference, "12:00 UTC");
    assert.equal(row.source_endpoint, "/astrology/planets/monthly");
    assert.match(String(row.methodology_version), /monthly-ephemeris-1/);
    assert.equal((row.result_snapshot as { days: unknown[] }).days.length, 30);
    assert.equal(pc.n, before);
    savedId = String((r.body.record as { id: string }).id);
    assert.match(String((r.body.record as { title: string }).title), /Efemeris · Batı \(Tropikal\) · Kasım 2026/);
  });
  await t("F2 Vedik kayıt: sideral + Lahiri kolonları", async () => {
    const r = await saveMonthlyRecord(ctx1, { kind: "vedic", year: 2024, month: 2, title: "  Şubat   2024 vedik  ", saveRequestId: randomUUID() }, { db: rdb.client });
    assert.equal(r.status, 201);
    const row = rdb.tables.astro_sky_monthly_ephemeris!.find((x) => x.kind === "vedic")!;
    assert.equal(row.zodiac, "sidereal");
    assert.equal(row.ayanamsa, "lahiri");
    assert.equal(row.title, "Şubat 2024 vedik");
  });
  await t("F3 idempotency: aynı saveRequestId ikinci kez → aynı kayıt (reused), yeni satır yok", async () => {
    const id = randomUUID();
    const a = await saveMonthlyRecord(ctx1, { kind: "western", year: 2026, month: 11, saveRequestId: id }, { db: rdb.client });
    const n = rdb.tables.astro_sky_monthly_ephemeris!.length;
    const b = await saveMonthlyRecord(ctx1, { kind: "western", year: 2026, month: 11, saveRequestId: id }, { db: rdb.client });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(b.body.reused, true);
    assert.equal(rdb.tables.astro_sky_monthly_ephemeris!.length, n);
  });
  await t("F4 önbellekte olmayan ay kaydedilemez (409; sağlayıcı çağrısı YOK)", async () => {
    const before = pc.n;
    const r = await saveMonthlyRecord(ctx1, { kind: "western", year: 2031, month: 1, saveRequestId: randomUUID() }, { db: rdb.client });
    assert.equal(r.status, 409);
    assert.equal(pc.n, before);
  });
  await t("F5 kayıt tavanı (DB tetikleyicisi taklidi) → 409 RECORD_CAP_REACHED", async () => {
    const r = await saveMonthlyRecord(ctx1, { kind: "western", year: 2026, month: 11, saveRequestId: randomUUID() }, { db: rdb.client });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "RECORD_CAP_REACHED");
  });
  await t("F6 arşivden aç: kayıtlı anlık görüntü birebir döner (0 çağrı); başka uzman / başka tenant → 404 (varlık sızmaz)", async () => {
    const before = pc.n;
    const g = await getMonthlyRecord(ctx1, savedId);
    assert.equal(g.status, 200);
    const snap = g.body.result as { days: { date: string; positions: { lon: number }[] }[] };
    assert.equal(snap.days[0].date, "2026-11-01");
    assert.deepEqual(snap, rdb.tables.astro_sky_monthly_ephemeris![0].result_snapshot);
    assert.equal((await getMonthlyRecord({ db: rdb.client, tenantId: TA, userId: U2 }, savedId)).status, 404);
    assert.equal((await getMonthlyRecord({ db: rdb.client, tenantId: TB, userId: U1 }, savedId)).status, 404);
    assert.equal((await getMonthlyRecord(ctx1, "not-a-uuid")).status, 404);
    assert.equal(pc.n, before);
  });
  await t("F7 liste: yalnız kendi kayıtları; tür/yıl süzgeci; geçersiz süzgeç 400", async () => {
    const all = await listMonthlyRecords(ctx1, new URLSearchParams());
    assert.equal((all.body.records as unknown[]).length, 3);
    const v = await listMonthlyRecords(ctx1, new URLSearchParams({ kind: "vedic" }));
    assert.equal((v.body.records as unknown[]).length, 1);
    const other = await listMonthlyRecords({ db: rdb.client, tenantId: TB, userId: U1 }, new URLSearchParams());
    assert.equal((other.body.records as unknown[]).length, 0);
    assert.equal((await listMonthlyRecords(ctx1, new URLSearchParams({ kind: "x" }))).status, 400);
    assert.equal((await listMonthlyRecords(ctx1, new URLSearchParams({ year: "20x6" }))).status, 400);
    const listed = JSON.stringify(all.body);
    assert.ok(!listed.includes("result_snapshot") && !listed.includes("raw_response"), "liste anlık görüntü / ham yanıt sızdırmaz");
  });
  await t("F9 doğrulama zorunlu (kayıt): PASS dışı + bozuk anlık görüntü açılmaz (502) ve rapora girmez; DE440 yoksa PASS dışı kayıt 503; doğrulanmamış önbellek KAYDEDİLMEZ", async () => {
    const row0 = rdb.tables.astro_sky_monthly_ephemeris![0];
    const good = row0.result_snapshot as { days: { positions: { body: string; lon: number }[] }[] };
    const id = randomUUID();
    rdb.tables.astro_sky_monthly_ephemeris!.push({
      ...row0,
      id,
      save_request_id: randomUUID(),
      result_snapshot: { ...good, crossCheck: { status: "unavailable", compared: 0 }, days: good.days.map((d) => ({ ...d, positions: d.positions.map((x) => (x.body === "mars" ? { ...x, lon: (x.lon + 2) % 360 } : x)) })) },
    });
    const g = await getMonthlyRecord(ctx1, id);
    assert.equal(g.status, 502, JSON.stringify(g.body).slice(0, 160));
    assert.equal(g.body.code, "CROSSCHECK_FAILED");
    const rep = await loadMonthlyForReport(ctx1, id);
    assert.ok(!rep.ok);
    const id2 = randomUUID();
    rdb.tables.astro_sky_monthly_ephemeris!.push({ ...row0, id: id2, save_request_id: randomUUID(), result_snapshot: { ...good, crossCheck: { status: "unavailable", compared: 0 } } });
    assert.equal((await getMonthlyRecord(ctx1, id2)).status, 200, "doğru veri yerel yeniden kontrolle açılır");
    await withEnv("ATLAS_PRO_EPHEMERIS_ENGINE", "legacy", async () => {
      assert.equal((await getMonthlyRecord(ctx1, id2)).status, 503);
      assert.equal((await getMonthlyRecord(ctx1, savedId)).status, 200, "PASS kayıt DE440 olmadan da açılır (bozulmaz)");
    });
    rdb.tables.astro_sky_monthly_ephemeris = rdb.tables.astro_sky_monthly_ephemeris!.filter((r) => r.id !== id && r.id !== id2);
    // Önbellekte PASS dışı + bozuk satır → kayıt reddedilir (502), tabloya satır eklenmez.
    __resetMonthlyMemoryForTests();
    const db = fakeDb();
    const pr = projectMonthly(req("western", 2035, 1), synth("western", 2035, 1));
    assert.ok(pr.ok);
    (db.tables.astro_sky_monthly_cache ??= []).push({ cache_key: monthlyCacheKey(req("western", 2035, 1)), technical: { kind: "western", year: 2035, month: 1, zodiac: "tropical", ayanamsa: null, bodies: pr.bodies, missingBodies: [], source: { id: "provider", endpoint: "/x" }, crossCheck: { status: "unavailable", compared: 0 }, days: pr.days.map((d) => ({ ...d, positions: d.positions.map((x) => (x.body === "sun" ? { ...x, lon: (x.lon + 1) % 360 } : x)) })) } } as never);
    const sv = await saveMonthlyRecord({ db: db.client, tenantId: TA, userId: U1 }, { kind: "western", year: 2035, month: 1, saveRequestId: randomUUID() }, { db: db.client });
    assert.equal(sv.status, 502, JSON.stringify(sv.body).slice(0, 160));
    assert.equal(db.tables.astro_sky_monthly_ephemeris?.length ?? 0, 0);
  });
  await t("F8 kayıt tablosu yoksa (migration uygulanmamış) açık 503 STORE_UNAVAILABLE", async () => {
    const db = fakeDb({ missingTables: ["astro_sky_monthly_ephemeris"] });
    const r = await listMonthlyRecords({ db: db.client, tenantId: TA, userId: U1 }, new URLSearchParams());
    assert.equal(r.status, 503);
    assert.equal(r.body.code, "STORE_UNAVAILABLE");
  });

  // ─── G) Word / PDF ───────────────────────────────────────────────────────────────────────────────────────────
  const recW = await loadMonthlyForReport(ctx1, savedId);
  assert.ok(recW.ok);
  const eW = recW.ok ? recW.result : null!;
  const eV = (await getMonthlyEphemeris(req("vedic", 2024, 2), { db: rdb.client, callProvider: null }, { allowProvider: false }));
  assert.ok(eV.ok);
  for (const [label, e, saved] of [["Batı (kayıtlı)", eW, { title: "T", savedAt: new Date().toISOString(), methodologyVersion: "m" }], ["Vedik (önbellek)", eV.ok ? eV.result : null!, null]] as const) {
    await t(`G1 ${label}: Word yatay A4, başlık satırı her sayfada (tblHeader), satır bölünmez (cantSplit), TÜM hücre değerleri modelle birebir ve sırayla`, async () => {
      const out = await renderMonthlyReport(e, "docx", { generatedAt: new Date().toISOString(), saved });
      const zip = await JSZip.loadAsync(Buffer.from(out.bytes));
      const xml = await zip.file("word/document.xml")!.async("string");
      assert.match(xml, /w:orient="landscape"/);
      assert.match(xml, /<w:tblHeader\/>|<w:tblHeader w:val="(true|1)"\/>/);
      assert.match(xml, /<w:cantSplit\/>|<w:cantSplit w:val="(true|1)"\/>/);
      const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
      const want = stripVs(out.model.rows.map((r) => r.day + r.cells.map((c) => c.top + c.bottom).join("")).join(""));
      assert.ok(text.includes(want), "tablo metni modelle aynı sırada değil");
      assert.ok(text.includes("12.00 UTC"));
      assert.ok(!/roxy/i.test(text), "sağlayıcı adı rapora girmez");
      if (e.kind === "western") assert.ok(!out.model.columns.some((c) => c.includes("Lilith")), "doğrulanmamış Lilith sütunu rapora girmez");
      assert.ok(!/<w:drawing>/.test(xml), "efemeris raporunda çark/görsel yok");
      assert.match(out.filename, e.kind === "western" ? /^efemeris-bati-tropikal-\d{4}-\d{2}\.docx$/ : /^efemeris-vedik-sideral-\d{4}-\d{2}\.docx$/);
    });
    await t(`G2 ${label}: PDF yatay A4 (842×595 pt), en az 2 sayfa (başlık tekrarı), %PDF`, async () => {
      const out = await renderMonthlyReport(e, "pdf", { generatedAt: new Date().toISOString(), saved });
      const s = Buffer.from(out.bytes).toString("latin1");
      assert.ok(s.startsWith("%PDF"));
      const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
      assert.ok(boxes.length >= 2 && boxes.every(([w, h]) => Math.abs(w - 841.89) < 0.01 && Math.abs(h - 595.28) < 0.01), `sayfa boyutu: ${JSON.stringify(boxes)}`);
      const pages = (s.match(/\/Type \/Page[^s]/g) ?? []).length;
      assert.ok(pages >= 2, `sayfa ${pages}`);
    });
  }
  await t("G3 rapor modeli: Vedik meta 'Lahiri', Batı meta 'Uygulanmaz (tropikal)'; hesaplama saati 12.00 UTC; sütun = görünür cisimler", () => {
    const mw = buildMonthlyReport(eW, { generatedAt: new Date().toISOString() });
    const mv = buildMonthlyReport(eV.ok ? eV.result : null!, { generatedAt: new Date().toISOString() });
    assert.equal(mw.meta.find((x) => x[0] === "Ayanamsa")![1], "Uygulanmaz (tropikal zodyak)");
    assert.match(mv.meta.find((x) => x[0] === "Ayanamsa")![1], /^Lahiri/);
    assert.match(mw.meta.find((x) => x[0] === "Hesaplama saati")![1], /12\.00 UTC/);
    // Doğrulanmamış Kara Ay Lilith rapora girmez (künyede adıyla yazılır); 14 cisim − Lilith = 13 + gün sütunu.
    assert.equal(mw.columns.length, 14);
    assert.ok(!mw.columns.some((c) => c.includes("Lilith")));
    assert.match(mw.meta.find((x) => x[0] === "Raporda yer almayan")![1], /Kara Ay Lilith/);
    assert.equal(mv.columns.length, 10);
    assert.equal(mv.rows.length, 29);
  });

  await t("G4 doğrulama durumu: Lilith HER ZAMAN doğrulanmamış; Kiron yalnız 1600–2100 doğrulanmış; gezegen/düğüm/Vedik doğrulanmış", () => {
    assert.equal(bodyVerification("western", "lilith", 2026).verified, false);
    assert.equal(bodyVerification("western", "chiron", 1600).verified, true);
    assert.equal(bodyVerification("western", "chiron", 2100).verified, true);
    assert.equal(bodyVerification("western", "chiron", 2101).verified, false);
    for (const b of ["sun", "moon", "mars", "north_node", "south_node"] as const) assert.equal(bodyVerification("western", b, 2600).verified, true);
    for (const b of ["sun", "moon", "rahu", "ketu"] as const) assert.equal(bodyVerification("vedic", b, 1600).verified, true);
  });
  await t("G5 Kiron 2101+ ayında rapor Kiron'u ve Lilith'i ÇIKARIR, ham değerler anlık görüntüde KALIR; yöntem metni '⚠ doğrulanmamış' der", () => {
    const r = projectMonthly(req("western", 2150, 3), synth("western", 2150, 3));
    assert.ok(r.ok);
    const e = { ...eW, year: 2150, month: 3, days: r.ok ? r.days : [], bodies: r.ok ? r.bodies : [] };
    const m = buildMonthlyReport(e, { generatedAt: new Date().toISOString() });
    assert.ok(!m.columns.some((c) => /Kiron|Lilith/.test(c)));
    assert.match(m.meta.find((x) => x[0] === "Raporda yer almayan")![1], /Kiron, Kara Ay Lilith/);
    assert.ok(e.days[0].positions.some((p) => p.body === "lilith") && e.days[0].positions.some((p) => p.body === "chiron"), "ham değer silinmez");
    const notes = m.notes.join(" ");
    assert.match(notes, /Kiron \(⚠ doğrulanmamış\)/);
    assert.match(notes, /Kara Ay Lilith \(⚠ doğrulanmamış\)/);
  });
  await t("G6 2026 Batı yöntem metni: Kiron 1600–2100 bağımsız doğrulandı ifadesi; Lilith '⚠ doğrulanmamış'", () => {
    const notes = buildMonthlyReport(eW, { generatedAt: new Date().toISOString() }).notes.join(" ");
    assert.match(notes, /Kiron: çalışma anında bağımsız kontrol edilmez; 1600–2100/);
    assert.match(notes, /Kara Ay Lilith \(⚠ doğrulanmamış\)/);
  });

  // ─── H) Rotalar (statik sıra + ayna) ─────────────────────────────────────────────────────────────────────────
  await t("H1 hesap ucu: kapı (ilk satır) → bayrak + teknik izni → gövde → doğrulama → hız sınırı → servis (allowProvider: true); uzman yüzeyi deneme kotası sayacıyla sarılı", () => {
    const full = readFileSync(join(ROOT, "app/api/admin/astroloji/efemeris/aylik/route.ts"), "utf8");
    const src = full.slice(full.indexOf("export async function POST"));
    const i = (re: RegExp) => {
      const m = re.exec(src);
      assert.ok(m, String(re));
      return m.index;
    };
    assert.ok(i(/await requireAstrologyAccess\(req\)/) < i(/monthlyAfterGate\(gate\.ctx\)/) && i(/monthlyAfterGate\(gate\.ctx\)/) < i(/readJsonBody/) && i(/readJsonBody/) < i(/parseMonthlyRequest/) && i(/parseMonthlyRequest/) < i(/await anyRate/) && i(/await anyRate/) < i(/getMonthlyEphemeris/));
    assert.match(src, /allowProvider: true/);
    const mirror = readFileSync(join(ROOT, "app/api/astroloji/efemeris/aylik/route.ts"), "utf8");
    void full;
    assert.match(mirror, /withTrialRoxyMeter\("astrology", "astroloji\/efemeris\/aylik", monthlyPost\)/);
  });
  await t("H2 rapor / kayıt / arşiv uçları sağlayıcı çağrısı BAŞLATAMAZ (allowProvider:true / callRoxy yok); uzman aynaları birebir", () => {
    for (const p of ["rapor/route.ts", "kayitlar/route.ts", "kayitlar/[id]/route.ts", "kayitlar/[id]/rapor/route.ts"]) {
      const src = readFileSync(join(ROOT, "app/api/admin/astroloji/efemeris/aylik", p), "utf8");
      assert.ok(!/allowProvider: true|callRoxy|monthlyDeps\(g\.ctx, true\)/.test(src), p);
      assert.match(src, /const gate = await requireAstrologyAccess\(req\);\n  if \(!gate\.ok\) return gate\.response;\n  const off = monthlyAfterGate\(gate\.ctx\);/, p);
      const mirror = readFileSync(join(ROOT, "app/api/astroloji/efemeris/aylik", p), "utf8").replace(/\r\n/g, "\n").replace(/^\s*\/\/.*$/gm, "").trim();
      const methods = p === "kayitlar/route.ts" ? "GET, POST" : "GET";
      assert.equal(mirror, `export { ${methods} } from "@/app/api/admin/astroloji/efemeris/aylik/${p.replace(/\/route\.ts$/, "")}/route";\nexport const runtime = "nodejs";\nexport const maxDuration = 60;`, p);
    }
  });
  await t("H3 kapı sırası: astroloji erişimi → Gökyüzü Araçları bayrağı (tek tip 404) → efemeris teknik izni (403)", () => {
    const src = readFileSync(join(ROOT, "lib/astrology/pro/monthly/routeKit.ts"), "utf8");
    const b = src.indexOf("if (!isProEphemerisEnabled()) return astrologyNotFoundResponse();");
    const c = src.indexOf("return astrologyTechniqueDenied(ctx, ASTRO_GRANT_SKY_EPHEMERIS);");
    assert.ok(b > 0 && b < c, "bayrak → teknik izni sırası");
    assert.match(src, /callRoxy\(config, endpoint, body, \{ maxRetries: 0, lang: MONTHLY_PROVIDER_LANG \}\)/);
  });
  await t("H5 maliyet koruması: yeni ay hesabından ÖNCE kullanıcı-saat 30 → kullanıcı-gün 150 → sistem-saat 200 → sistem-gün 1000 tavanları sırayla", async () => {
    const kit = await import("@/lib/astrology/pro/monthly/routeKit");
    assert.deepEqual(kit.MONTHLY_PROVIDER_CAPS.map((c) => [c.perUser, c.limit, c.windowSeconds]), [[true, 30, 3600], [true, 150, 86400], [false, 200, 3600], [false, 1000, 86400]]);
    const calls: { limit: number; window: number }[] = [];
    let deny = -1;
    const db = { rpc: async (_: string, a: { p_limit: number; p_window_seconds: number }) => (calls.push({ limit: a.p_limit, window: a.p_window_seconds }), { data: { allowed: calls.length - 1 !== deny, retry_after: 60 }, error: null }) };
    const deps = kit.monthlyDeps({ db, tenantId: "t", userId: "u" } as never, false);
    assert.deepEqual(await deps.beforeProviderCall!(), { ok: true });
    assert.equal(calls.length, 4);
    calls.length = 0;
    deny = 2; // sistem-saat tavanı dolu
    assert.deepEqual(await deps.beforeProviderCall!(), { ok: false, retryAfterSec: 60 });
    assert.equal(calls.length, 3, "dolu tavandan sonra kalan sayaçlar sorgulanmaz");
  });
  await t("H6 ΔT açıklaması: ölçülmüş dönemde (1600–2060) YOK; 2100+ öngörü döneminde Ay belirsizliği açıkça yazılır (2600: Ay ±39′); yöntem metninde ve rapor notlarında görünür", async () => {
    const f = await import("@/lib/astrology/pro/monthly/format");
    for (const [y, m] of [[1600, 1], [1900, 2], [2026, 11], [2060, 1]] as const) assert.equal(f.deltaTNote(y, m, "western"), null, `${y}-${m}`);
    const far = f.deltaTNote(2600, 12, "western")!;
    assert.match(far, /Ay ±39′/);
    assert.match(far, /Ay düğümü ±4′/);
    assert.ok(!/Ay düğümü/.test(f.deltaTNote(2600, 12, "vedic")!), "Vedik ortalama düğüm ΔT'den etkilenmez");
    assert.match(f.deltaTNote(2100, 2)!, /Ay ±59″/);
    const lines = f.methodLines({ kind: "vedic", year: 2600, month: 12, ayanamsa: "lahiri", nodeMethod: "mean", missingBodies: [], crossCheck: { status: "unavailable", compared: 0, maxAbsArcsec: 0, maxAt: null, retroMismatches: 0, retroStationSkipped: 0, checkedBodies: [], uncheckedBodies: [], method: "" } } as never);
    assert.ok(lines.some((l) => l.startsWith("Zaman belirsizliği (ΔT)")));
  });
  await t("H4 kullanıcıya görünen bileşen/rapor metinlerinde sağlayıcı adı yok", () => {
    for (const p of ["app/admin/astroloji/_components/ephemeris/MonthlyEphemerisDesk.tsx", "lib/astrology/pro/monthly/format.ts", "lib/astrology/pro/monthly/reportModel.ts"]) {
      const src = readFileSync(join(ROOT, p), "utf8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      assert.ok(!/roxy/i.test(src), p);
    }
  });

  console.log(`\nSONUÇ pro-monthly-ephemeris: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

void main();
