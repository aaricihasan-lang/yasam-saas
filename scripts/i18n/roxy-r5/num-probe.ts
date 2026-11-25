/**
 * R5 ROXY — KLASİK NUMEROLOJİ dil doğrulaması (ÜCRETLİ, sayaçlı). Ürün istemcisi callClassicEndpoint (maxRetries 0) +
 * ürün normalizer'ı (normalizeEndpointResponse) + bağımsız oracle (verifyWithOracle). Yalnız `lang` TR/EN. DB yok, sentetik ad.
 *
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/i18n/roxy-r5/num-probe.ts --confirm-paid --max 26
 */
import fs from "node:fs";
import path from "node:path";
import { callClassicEndpoint, readClassicProviderConfig } from "@/lib/numeroloji-klasik/server/providerClient";
import { normalizeEndpointResponse, verifyWithOracle } from "@/lib/numeroloji-klasik/normalize/index";
import type { ClassicEndpointId } from "@/lib/numeroloji-klasik/endpoints";
import { KANIT, argMax, meteredFetch, runCallCount, saveRaw, setCtx, setRunMax } from "./meter";
import { compareRaw, diffLeaves, leaves, stable, textLang } from "./textcheck";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm-paid");
setRunMax(argMax(26));

const REF = "2026-11-25";
const N1 = { fullName: "Test Persona", year: 1990, month: 4, day: 1 };
const N2 = { fullName: "Ayşe Gül Şahin Örnek", year: 1985, month: 12, day: 21 };
const N3 = { fullName: "Zoë O'Brien", year: 2000, month: 2, day: 29 };

type Case = { id: string; ep: ClassicEndpointId; payload: Record<string, unknown> | null; pathParam?: string; kisi: string };
const CASES: Case[] = [
  { id: "chart-n1", ep: "chart", payload: { ...N1, targetDate: REF }, kisi: "n1" },
  { id: "chart-n2", ep: "chart", payload: { ...N2, targetDate: REF }, kisi: "n2" },
  { id: "chart-n3", ep: "chart", payload: { ...N3, targetDate: REF }, kisi: "n3" },
  { id: "bridge-n1", ep: "bridge", payload: { ...N1 }, kisi: "n1" },
  { id: "personal_day-n1", ep: "personal_day", payload: { month: 4, day: 1, targetDate: REF }, kisi: "n1" },
  { id: "daily", ep: "daily", payload: { date: REF }, kisi: "-" },
  { id: "chaldean-n2", ep: "chaldean", payload: { name: N2.fullName }, kisi: "n2" },
  { id: "compatibility-n1n2", ep: "compatibility", payload: { person1: N1, person2: N2 }, kisi: "n1+n2" },
  { id: "business_name", ep: "business_name", payload: { name: "Yaşam Doğal Ürünler" }, kisi: "-" },
  { id: "dual-n3", ep: "dual", payload: { name: N3.fullName }, kisi: "n3" },
  { id: "meanings-7", ep: "meanings", payload: null, pathParam: "7", kisi: "-" },
  { id: "meanings-11", ep: "meanings", payload: null, pathParam: "11", kisi: "-" },
  { id: "compound-23", ep: "compound_number", payload: null, pathParam: "23", kisi: "-" },
];

async function getRaw(c: Case, lang: "tr" | "en"): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  const file = `numeroloji/${c.id}-${lang}.json`;
  const full = path.join(KANIT, "roxy", "ham", file);
  if (fs.existsSync(full)) return { ok: true, raw: JSON.parse(fs.readFileSync(full, "utf8")).response };
  if (!CONFIRM) return { ok: false, error: "ücretli çağrı onayı yok" };
  const cfg = readClassicProviderConfig();
  if (!cfg) return { ok: false, error: "ENGELLENDİ: ROXY_API_KEY yok" };
  setCtx({ modul: "numeroloji", amac: `TR/EN eşitlik ${c.ep}`, kisi: c.kisi });
  const r = await callClassicEndpoint(cfg, c.ep, c.payload, { lang, maxRetries: 0, fetchImpl: meteredFetch, pathParam: c.pathParam ?? null });
  if (!r.ok) return { ok: false, error: `${r.kind} ${r.http ?? "-"}` };
  saveRaw(file, { endpoint: c.ep, lang, payload: c.payload, pathParam: c.pathParam ?? null, response: r.raw });
  return { ok: true, raw: r.raw };
}

/** Normalize çıktıdan yalnız sayı/bool/null (dil bağımsız olmalı); tüm dizgeler (anahtar sözcük dizileri dahil) çıkarılır. */
function canonicalOnly(v: unknown): unknown {
  return leaves(v)
    .filter((l) => typeof l.value !== "string" && !/keywords\[/.test(l.path))
    .map((l) => `${l.path}=${String(l.value)}`)
    .sort();
}

async function main() {
  const rows: Record<string, unknown>[] = [];
  for (const c of CASES) {
    const tr = await getRaw(c, "tr");
    const en = await getRaw(c, "en");
    const row: Record<string, unknown> = { id: c.id, endpoint: c.ep };
    if (!tr.ok || !en.ok) {
      row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
      rows.push(row);
      console.log(c.id, row.error);
      continue;
    }
    row.raw = compareRaw(tr.raw, en.raw);
    if (c.payload) {
      const a = normalizeEndpointResponse(c.ep, tr.raw);
      const b = normalizeEndpointResponse(c.ep, en.raw);
      row.normTr = a.ok ? "ok" : a.reason;
      row.normEn = b.ok ? "ok" : b.reason;
      if (a.ok && b.ok) {
        row.normalizedEqual = stable(a.data) === stable(b.data);
        const ca = canonicalOnly(a.data), cb = canonicalOnly(b.data);
        row.canonicalEqual = stable(ca) === stable(cb);
        if (!row.canonicalEqual) row.canonicalDiffs = diffLeaves(ca, cb);
        const va = verifyWithOracle(c.ep, c.payload, a.data), vb = verifyWithOracle(c.ep, c.payload, b.data);
        row.oracleEqual = stable(canonicalOnly(va)) === stable(canonicalOnly(vb));
        row.oracleTrUnverifiedOrFail = leaves(va).filter((l) => l.value === "mismatch" || l.value === "fail").length;
        row.oracleEnUnverifiedOrFail = leaves(vb).filter((l) => l.value === "mismatch" || l.value === "fail").length;
        row.textEn = textLang(b.data);
        row.textTr = textLang(a.data);
      }
    } else {
      row.textEn = textLang(en.raw);
      row.textTr = textLang(tr.raw);
    }
    rows.push(row);
    console.log(c.id, `num ${(row.raw as { numSame: number }).numSame}/${(row.raw as { numDiff: number }).numDiff}`, "norm", row.normTr ?? "-", row.normEn ?? "-", "canonEq", row.canonicalEqual ?? "-", "oracleEq", row.oracleEqual ?? "-");
  }
  const out = path.join(KANIT, "roxy", "numeroloji-sonuc.json");
  fs.writeFileSync(out, JSON.stringify({ zaman: new Date().toISOString(), buKosudakiCagri: runCallCount(), rows }, null, 1));
  console.log(`\nbu koşudaki ücretli çağrı: ${runCallCount()} · ${out}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
