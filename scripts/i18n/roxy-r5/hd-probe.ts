/**
 * R5 ROXY — HUMAN DESIGN dil doğrulaması (ÜCRETLİ, sayaçlı). Ürün istemcileri (callRoxyBodygraph, callRoxyConnection,
 * callRoxyPenta, callRoxyTransit, callRoxyVariables) + ürün doğrulayıcı/normalizer'ları; yalnız `lang` TR/EN.
 * DB yok, ürün ölçer yok, sentetik kişi. Ham yanıt dosyası varsa ÇAĞRI YAPILMAZ.
 *
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/i18n/roxy-r5/hd-probe.ts --confirm-paid --max 36
 */
import fs from "node:fs";
import path from "node:path";
import { callRoxyBodygraph } from "@/lib/human-design/providers/roxy/client";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { validateRoxyBodygraph } from "@/lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "@/lib/human-design/providers/roxy/normalize";
import { extractSystemReading } from "@/lib/human-design/providers/roxy/systemReading";
import { callRoxyConnection, callRoxyPenta, type RoxyBirthMoment } from "@/lib/human-design/providers/roxy/relationClient";
import { validateRoxyConnection } from "@/lib/human-design/relations/connection";
import { validateRoxyPenta } from "@/lib/human-design/relations/penta";
import { callRoxyTransit } from "@/lib/human-design/transit/roxyTransitClient";
import { validateRoxyTransit } from "@/lib/human-design/transit/personalTransit";
import { callRoxyVariables } from "@/lib/human-design/variables/roxyVariablesClient";
import { validateRoxyVariables } from "@/lib/human-design/variables/variablesContract";
import { parseRoxyPlanets, roxyPlanetsRequest } from "@/lib/human-design/transit/roxyPlanetsClient";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { localDateTimeToUtc } from "@/lib/human-design/engine/time";
import { roxyUtcParts } from "@/lib/human-design/api/hdBirthUtc";
import { BudgetError, KANIT, argMax, meteredFetch, runCallCount, saveRaw, setCtx, setRunMax } from "./meter";
import { compareRaw, diffLeaves, stable, textLang } from "./textcheck";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm-paid");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
setRunMax(argMax(36));

type Local = { id: string; date: string; time: string; tz: string; lat: number; lon: number };
export const HD_PERSONAS: Local[] = [
  { id: "p1", date: "1990-04-01", time: "14:30", tz: "Europe/Istanbul", lat: 41.0082, lon: 28.9784 },
  { id: "p2", date: "1985-12-21", time: "03:15", tz: "Europe/Oslo", lat: 69.6492, lon: 18.9553 },
  { id: "p3", date: "2000-02-29", time: "23:50", tz: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
  { id: "hm", date: "1962-10-05", time: "00:00", tz: "Europe/Istanbul", lat: 38.4192, lon: 27.1287 },
  { id: "hp", date: "1960-08-19", time: "21:15", tz: "Europe/Istanbul", lat: 38.4192, lon: 27.1287 },
  { id: "hr", date: "1964-03-20", time: "20:00", tz: "Europe/Istanbul", lat: 38.4192, lon: 27.1287 },
  { id: "fix", date: "2018-07-20", time: "16:00", tz: "UTC", lat: 37.871399, lon: 32.484699 },
];
const PARTNER: Local = { id: "es", date: "1988-09-10", time: "08:05", tz: "Europe/Istanbul", lat: 39.9334, lon: 32.8597 };

function utcOf(p: Local): string {
  return localDateTimeToUtc({ date: p.date, time: p.time, timezone: p.tz, location: { latitude: p.lat, longitude: p.lon } } as never).toISOString();
}
function moment(p: Local): RoxyBirthMoment & { utcIso: string } {
  const utcIso = utcOf(p);
  const u = roxyUtcParts(utcIso)!;
  return { date: u.date, time: u.time, timezone: u.timezone, latitude: p.lat, longitude: p.lon, nodeType: "true", utcIso };
}

type Res = { ok: true; raw: unknown; cached: boolean } | { ok: false; error: string };
async function cached(file: string, amac: string, kisi: string, call: () => Promise<{ ok: boolean; raw?: unknown; kind?: string; status?: number | null }>, meta: Record<string, unknown>): Promise<Res> {
  const full = path.join(KANIT, "roxy", "ham", file);
  if (fs.existsSync(full)) return { ok: true, raw: JSON.parse(fs.readFileSync(full, "utf8")).response, cached: true };
  if (!CONFIRM) return { ok: false, error: "ücretli çağrı onayı yok" };
  setCtx({ modul: "hd", amac, kisi });
  const r = await call();
  if (!r.ok) return { ok: false, error: `${r.kind} ${r.status ?? "-"}` };
  saveRaw(file, { ...meta, response: r.raw });
  return { ok: true, raw: r.raw, cached: false };
}

const rows: Record<string, unknown>[] = [];
const want = (k: string) => !ONLY || ONLY.includes(k);

async function getJson(pathq: string, lang: string): Promise<{ ok: boolean; raw?: unknown; kind?: string; status?: number | null }> {
  const cfg = readRoxyServerConfig()!;
  try {
    const res = await meteredFetch(`${cfg.baseUrl}${pathq}?lang=${lang}`, { method: "GET", headers: { Accept: "application/json", "X-API-Key": cfg.apiKey } });
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return { ok: false, kind: "http", status: res.status };
    }
    return { ok: true, raw: await res.json() };
  } catch (e) {
    return { ok: false, kind: e instanceof BudgetError ? "budget" : "network", status: null };
  }
}

async function main() {
  const cfg = readRoxyServerConfig();
  if (!cfg && CONFIRM) {
    console.log("ENGELLENDİ: ROXY_API_KEY yok");
    process.exit(2);
  }
  // ── 1) Bodygraph ────────────────────────────────────────────────────────────
  if (want("bodygraph"))
    for (const p of HD_PERSONAS) {
      const m = moment(p);
      const body = { date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType: "true" as const };
      const get = (lang: "tr" | "en") => cached(`hd/bodygraph-${p.id}-${lang}.json`, `HD bodygraph TR/EN eşitlik + EN anlatı`, p.id, () => callRoxyBodygraph(cfg!, body as never, { lang, fetchImpl: meteredFetch }), { endpoint: "/human-design/bodygraph", lang, body });
      const tr = await get("tr");
      const en = await get("en");
      const row: Record<string, unknown> = { kind: "bodygraph", persona: p.id, utc: m.utcIso };
      if (!tr.ok || !en.ok) {
        row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
        rows.push(row);
        console.log("bodygraph", p.id, row.error);
        continue;
      }
      const norm = (raw: unknown, lang: string) => {
        const v = validateRoxyBodygraph(raw);
        if (!v.ok) return { ok: false as const, errors: v.errors.slice(0, 5) };
        const n = normalizeRoxyBodygraph(v.value, { date: p.date, time: `${p.time}:00`, timezone: p.tz, latitude: p.lat, longitude: p.lon, nodeType: "true", lang, birthUtcIso: m.utcIso });
        return n.ok ? { ok: true as const, chart: n.chart, codes: n.codes } : { ok: false as const, errors: n.errors.slice(0, 5) };
      };
      const a = norm(tr.raw, "tr");
      const b = norm(en.raw, "en");
      row.normTr = a.ok ? "ok" : a.errors;
      row.normEn = b.ok ? "ok" : b.errors;
      if (a.ok && b.ok) {
        const strip = (c: unknown) => JSON.parse(JSON.stringify(c, (k, v) => (k === "lang" ? undefined : v)));
        row.chartEqual = stable(strip(a.chart)) === stable(strip(b.chart));
        row.codesEqual = stable(a.codes) === stable(b.codes);
        if (!row.chartEqual) row.chartDiffs = diffLeaves(strip(a.chart), strip(b.chart));
        row.codes = a.codes;
      }
      const srTr = extractSystemReading(tr.raw);
      const srEn = extractSystemReading(en.raw);
      row.systemReadingTr = textLang(srTr);
      row.systemReadingEn = textLang(srEn);
      row.raw = compareRaw(tr.raw, en.raw);
      rows.push(row);
      console.log("bodygraph", p.id, "norm", row.normTr === "ok", row.normEn === "ok", "chartEq", row.chartEqual, "codesEq", row.codesEqual);
    }
  // ── 2) Connection (P1 + eş) / Penta (P1, P3, eş) ───────────────────────────
  const P1 = HD_PERSONAS[0], P3 = HD_PERSONAS[2];
  const mm = (p: Local) => {
    const { utcIso: _u, ...rest } = moment(p);
    return rest;
  };
  if (want("connection")) {
    const body = { personA: mm(P1), personB: mm(PARTNER) };
    const get = (lang: "tr" | "en") => cached(`hd/connection-p1es-${lang}.json`, "HD connection TR/EN eşitlik", "p1+es", () => callRoxyConnection(cfg!, body, { lang, fetchImpl: meteredFetch }), { endpoint: "/human-design/connection", lang, body });
    const tr = await get("tr"), en = await get("en");
    const row: Record<string, unknown> = { kind: "connection", persona: "p1+es" };
    if (tr.ok && en.ok) {
      const a = validateRoxyConnection(tr.raw), b = validateRoxyConnection(en.raw);
      row.validTr = a.ok; row.validEn = b.ok;
      if (a.ok && b.ok) {
        row.valueEqual = stable((a as { value: unknown }).value) === stable((b as { value: unknown }).value);
        if (!row.valueEqual) row.valueDiffs = diffLeaves((a as { value: unknown }).value, (b as { value: unknown }).value);
      } else row.validErrors = { tr: a.ok ? null : (a as { errors: string[] }).errors?.slice(0, 4), en: b.ok ? null : (b as { errors: string[] }).errors?.slice(0, 4) };
      row.raw = compareRaw(tr.raw, en.raw);
    } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
    rows.push(row);
    console.log("connection", row.valueEqual ?? row.error ?? row.validErrors);
  }
  if (want("penta")) {
    const body = { members: [mm(P1), mm(P3), mm(PARTNER)] };
    const get = (lang: "tr" | "en") => cached(`hd/penta-p1p3es-${lang}.json`, "HD penta TR/EN eşitlik", "p1+p3+es", () => callRoxyPenta(cfg!, body, { lang, fetchImpl: meteredFetch }), { endpoint: "/human-design/penta", lang, body });
    const tr = await get("tr"), en = await get("en");
    const row: Record<string, unknown> = { kind: "penta", persona: "p1+p3+es" };
    if (tr.ok && en.ok) {
      const a = validateRoxyPenta(tr.raw, 3), b = validateRoxyPenta(en.raw, 3);
      row.validTr = a.ok; row.validEn = b.ok;
      if (a.ok && b.ok) {
        row.valueEqual = stable((a as { value: unknown }).value) === stable((b as { value: unknown }).value);
        if (!row.valueEqual) row.valueDiffs = diffLeaves((a as { value: unknown }).value, (b as { value: unknown }).value);
      } else row.validErrors = { tr: a.ok ? null : (a as { errors: string[] }).errors?.slice(0, 4), en: b.ok ? null : (b as { errors: string[] }).errors?.slice(0, 4) };
      row.raw = compareRaw(tr.raw, en.raw);
    } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
    rows.push(row);
    console.log("penta", row.valueEqual ?? row.error ?? row.validErrors);
  }
  // ── 3) HD kişisel transit (P1, 2026-11-25 09:00 UTC) ───────────────────────
  if (want("transit")) {
    const body = { birthData: mm(P1), date: "2026-11-25", time: "09:00:00" };
    const get = (lang: "tr" | "en") => cached(`hd/transit-p1-${lang}.json`, "HD transit TR/EN eşitlik", "p1", () => callRoxyTransit(cfg!, body as never, { lang, fetchImpl: meteredFetch }), { endpoint: "/human-design/transit", lang, body });
    const tr = await get("tr"), en = await get("en");
    const row: Record<string, unknown> = { kind: "transit", persona: "p1" };
    if (tr.ok && en.ok) {
      const a = validateRoxyTransit(tr.raw, body), b = validateRoxyTransit(en.raw, body);
      row.validTr = a.ok; row.validEn = b.ok;
      if (a.ok && b.ok) {
        row.valueEqual = stable(a.value) === stable(b.value);
        if (!row.valueEqual) row.valueDiffs = diffLeaves(a.value, b.value);
      } else row.validErrors = { tr: a.ok ? null : a.errors.slice(0, 4), en: b.ok ? null : b.errors.slice(0, 4) };
      row.raw = compareRaw(tr.raw, en.raw);
    } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
    rows.push(row);
    console.log("transit", row.valueEqual ?? row.error ?? row.validErrors);
  }
  // ── 4) Variables (P1, HM) ───────────────────────────────────────────────────
  if (want("variables"))
    for (const p of [HD_PERSONAS[0], HD_PERSONAS[3]]) {
      const body = mm(p);
      const get = (lang: "tr" | "en") => cached(`hd/variables-${p.id}-${lang}.json`, "HD variables TR/EN eşitlik", p.id, () => callRoxyVariables(cfg!, body as never, { lang, fetchImpl: meteredFetch }), { endpoint: "/human-design/variables", lang, body });
      const tr = await get("tr"), en = await get("en");
      const row: Record<string, unknown> = { kind: "variables", persona: p.id };
      if (tr.ok && en.ok) {
        const a = validateRoxyVariables(tr.raw) as { ok: boolean; value?: unknown; errors?: string[] }, b = validateRoxyVariables(en.raw) as { ok: boolean; value?: unknown; errors?: string[] };
        row.validTr = a.ok; row.validEn = b.ok;
        if (a.ok && b.ok) {
          row.valueEqual = stable(a.value) === stable(b.value);
          if (!row.valueEqual) row.valueDiffs = diffLeaves(a.value, b.value);
        } else row.validErrors = { tr: a.errors?.slice(0, 4) ?? null, en: b.errors?.slice(0, 4) ?? null };
        row.raw = compareRaw(tr.raw, en.raw);
      } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
      rows.push(row);
      console.log("variables", p.id, row.valueEqual ?? row.error ?? row.validErrors);
    }
  // ── 5) /astrology/planets (HD transit efemerisi; ürün lang=en sabit) ───────
  if (want("planets")) {
    const body = roxyPlanetsRequest("2026-11-25T09:00:00.000Z");
    const acfg = readAstroRoxyConfig();
    const get = (lang: "tr" | "en") => cached(`hd/planets-${lang}.json`, "HD transit efemeris (/astrology/planets) TR/EN eşitlik", "-", () => callRoxy(acfg!, "/astrology/planets", body as never, { lang, maxRetries: 0, fetchImpl: meteredFetch }), { endpoint: "/astrology/planets", lang, body });
    const tr = await get("tr"), en = await get("en");
    const row: Record<string, unknown> = { kind: "planets", persona: "-" };
    if (tr.ok && en.ok) {
      const a = parseRoxyPlanets(tr.raw), b = parseRoxyPlanets(en.raw);
      row.parseTr = a.ok; row.parseEn = b.ok;
      if (a.ok && b.ok) row.valueEqual = stable(a.longitudes) === stable(b.longitudes);
      else row.parseErrors = { tr: a.ok ? null : a.errors.slice(0, 4), en: b.ok ? null : b.errors.slice(0, 4) };
      row.raw = compareRaw(tr.raw, en.raw);
    } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
    rows.push(row);
    console.log("planets", row.valueEqual ?? row.error ?? row.parseErrors);
  }
  // ── 6) Yalnız-anlatı başvuru uçları (GET; doğum verisi yok) ─────────────────
  if (want("reference")) {
    for (const ref of ["/human-design/gates/1", "/human-design/gates/36", "/human-design/gates/64", "/human-design/centers/head", "/human-design/centers/solar-plexus"]) {
      const slug = ref.split("/").slice(2).join("-");
      const get = (lang: "tr" | "en") => cached(`hd/ref-${slug}-${lang}.json`, "HD başvuru ucu (yalnız anlatı, A6 adayı) TR/EN + faturalama", "-", () => getJson(ref, lang), { endpoint: ref, lang });
      const tr = await get("tr"), en = await get("en");
      const row: Record<string, unknown> = { kind: "reference", endpoint: ref };
      if (tr.ok && en.ok) {
        row.raw = compareRaw(tr.raw, en.raw);
        row.textTr = textLang(tr.raw);
        row.textEn = textLang(en.raw);
      } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
      rows.push(row);
      console.log("ref", ref, row.error ?? "ok");
    }
  }
  const out = path.join(KANIT, "roxy", `hd-sonuc${ONLY ? "-" + ONLY.join("_") : ""}.json`);
  fs.writeFileSync(out, JSON.stringify({ zaman: new Date().toISOString(), buKosudakiCagri: runCallCount(), rows }, null, 1));
  console.log(`\nbu koşudaki ücretli çağrı: ${runCallCount()} · ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
