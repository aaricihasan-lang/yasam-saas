/**
 * R5 ROXY — Aylık efemeris (#840) uçları TR/EN (ÜCRETLİ, sayaçlı, 4 çağrı). Ürün MONTHLY_PROVIDER_LANG = "en" sabit;
 * soru: TR yanıtı ürün projeksiyonunu (projectMonthly) bozar mı, sayısal alanlar dil bağımsız mı.
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/i18n/roxy-r5/monthly-probe.ts --confirm-paid --max 4
 */
import fs from "node:fs";
import path from "node:path";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { MONTHLY_ENDPOINT, monthlyProviderBody, parseMonthlyRequest, projectMonthly } from "@/lib/astrology/pro/monthly/contract";
import { KANIT, argMax, meteredFetch, runCallCount, saveRaw, setCtx, setRunMax } from "./meter";
import { compareRaw, stable } from "./textcheck";

const CONFIRM = process.argv.includes("--confirm-paid");
setRunMax(argMax(4));
const rows: Record<string, unknown>[] = [];

async function main() {
  for (const kind of ["western", "vedic"] as const) {
    const req = parseMonthlyRequest({ kind, year: 2026, month: 12 });
    if (!req.ok) throw new Error("istek");
    const endpoint = (MONTHLY_ENDPOINT as Record<string, string>)[kind];
    const body = monthlyProviderBody(req.value);
    const get = async (lang: "tr" | "en") => {
      const file = `atlas/monthly-${kind}-2026-12-${lang}.json`;
      const full = path.join(KANIT, "roxy", "ham", file);
      if (fs.existsSync(full)) return { ok: true as const, raw: JSON.parse(fs.readFileSync(full, "utf8")).response };
      if (!CONFIRM) return { ok: false as const, error: "onay yok" };
      setCtx({ modul: "atlas", amac: `aylık efemeris ${kind} TR/EN (ürün en sabit)`, kisi: "-" });
      const r = await callRoxy(readAstroRoxyConfig()!, endpoint, body, { lang, maxRetries: 0, fetchImpl: meteredFetch });
      if (!r.ok) return { ok: false as const, error: `${r.kind} ${r.status ?? "-"}` };
      saveRaw(file, { endpoint, lang, body, response: r.raw });
      return { ok: true as const, raw: r.raw };
    };
    const tr = await get("tr"), en = await get("en");
    const row: Record<string, unknown> = { kind, endpoint };
    if (tr.ok && en.ok) {
      const a = projectMonthly(req.value, tr.raw), b = projectMonthly(req.value, en.raw);
      row.projTr = a.ok ? "ok" : a.reason;
      row.projEn = b.ok ? "ok" : b.reason;
      if (a.ok && b.ok) {
        row.daysEqual = stable(a.days) === stable(b.days);
        row.missingTr = a.missingBodies; row.missingEn = b.missingBodies;
        row.ignoredTr = a.ignoredNames.slice(0, 8); row.ignoredEn = b.ignoredNames.slice(0, 8);
      }
      const c = compareRaw(tr.raw, en.raw);
      row.raw = { numSame: c.numSame, numDiff: c.numDiff, codeDiff: c.codeDiff, codeDiffs: c.codeDiffs.slice(0, 6) };
    } else row.error = `tr=${tr.ok ? "ok" : tr.error} en=${en.ok ? "ok" : en.error}`;
    rows.push(row);
    console.log(kind, JSON.stringify(row).slice(0, 400));
  }
  fs.writeFileSync(path.join(KANIT, "roxy", "monthly-sonuc.json"), JSON.stringify({ zaman: new Date().toISOString(), buKosudakiCagri: runCallCount(), rows }, null, 1));
  console.log(`bu koşudaki ücretli çağrı: ${runCallCount()}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
