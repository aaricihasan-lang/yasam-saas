/**
 * Klasik Numeroloji — uç erişilebilirlik tekrarı (29.10 devam) karşılaştırması (AĞ YOK; yalnız kayıtlı dosyalar).
 *
 * `cases/11-devam-smoke.json` vakaları gece kaydedilen vakalarla BİREBİR aynı gövdeyle gönderildi. Bu betik:
 *   (1) her ucun bugünkü yanıtını normalize eder (şema hâlâ uyumlu mu),
 *   (2) bağımsız oracle ile doğrular (match / mismatch / unverified),
 *   (3) gece yanıtıyla karşılaştırır (sayısal alanlar aynı mı — sağlayıcı davranışı değişti mi),
 *   (4) ürün tohum biçimiyle (/daily, nk+20 hex) iki çağrının aynı sonucu verdiğini denetler.
 * Çalıştır: npx tsx scripts/numeroloji-klasik/live/smoke-compare.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeEndpointResponse, verifyWithOracle } from "../../../lib/numeroloji-klasik/normalize/index";
import type { ClassicEndpointId } from "../../../lib/numeroloji-klasik/endpoints";

const QA = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const raw = (id: string) => JSON.parse(readFileSync(path.join(QA, "raw", `${id}.json`), "utf8")) as { case: { path: string; body?: Record<string, unknown> }; http: number; body: unknown };

const EP: Record<string, ClassicEndpointId> = {
  "birth-day": "birth_day", bridge: "bridge", "business-name": "business_name", chaldean: "chaldean", chart: "chart",
  compatibility: "compatibility", "compound-number": "compound_number", daily: "daily", dual: "dual", expression: "expression",
  "karmic-debt": "karmic_debt", "karmic-lessons": "karmic_lessons", "life-path": "life_path", maturity: "maturity", meanings: "meanings",
  "personal-day": "personal_day", "personal-month": "personal_month", "personal-year": "personal_year", personality: "personality", "soul-urge": "soul_urge",
};

/** Sayısal yaprakları (yol → değer) toplar; metinler yok sayılır (dil/yorum değişebilir). */
function numbers(v: unknown, p = "$", out: Record<string, number> = {}): Record<string, number> {
  if (typeof v === "number") out[p] = v;
  else if (Array.isArray(v)) v.forEach((x, i) => numbers(x, `${p}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) numbers(x, `${p}.${k}`, out);
  return out;
}
function statuses(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => statuses(x, out));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ver = o.verification as { status?: string } | undefined;
    if (ver && typeof ver.status === "string") out.push(ver.status);
    for (const [k, x] of Object.entries(o)) if (k !== "verification") statuses(x, out);
  }
  return out;
}

const cases = JSON.parse(readFileSync(path.join(QA, "cases", "11-devam-smoke.json"), "utf8")) as Array<{ id: string; purpose: string }>;
let pass = 0;
let fail = 0;
const rows: string[] = [];
for (const c of cases.filter((x) => x.id.startsWith("d11-smoke-"))) {
  const key = c.id.replace("d11-smoke-", "");
  const ep = EP[key];
  const src = /kaynak vaka ([^)]+)\)/.exec(c.purpose)?.[1];
  const today = raw(c.id);
  const night = src ? raw(src) : null;
  const n = normalizeEndpointResponse(ep, today.body);
  const input = today.case.body ?? (today.case.path.match(/\/(\d+)$/) ? { n: Number(today.case.path.match(/\/(\d+)$/)![1]) } : null);
  const v = n.ok ? (verifyWithOracle(ep, input as never, n.data) as unknown) : null;
  const st = statuses(v);
  const mism = st.filter((s) => s === "mismatch").length;
  const a = numbers(today.body);
  const b = night ? numbers(night.body) : {};
  // Tarih bağımlı / sayaç alanları hariç (ör. personal-day hedefi verilmemişse UTC günü; maturity currentAge)
  const diff = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k] && !/currentAge|age\b|calendarMonth/i.test(k));
  const okRow = today.http === 200 && n.ok && diff.length === 0;
  okRow ? pass++ : fail++;
  rows.push(`${okRow ? "✓" : "✗"} ${key.padEnd(16)} http=${today.http} normalize=${n.ok ? "ok" : "RED"} oracle: ${st.filter((s) => s === "match").length} eş / ${mism} fark / ${st.filter((s) => s === "unverified").length} doğrulanamaz · geceyle sayısal fark: ${diff.length}${diff.length ? ` (${diff.slice(0, 4).join(", ")})` : ""}`);
}
const d1 = raw("d11-daily-nkseed-1");
const d2 = raw("d11-daily-nkseed-2");
const same = JSON.stringify(d1.body) === JSON.stringify(d2.body);
const dn = normalizeEndpointResponse("daily", d1.body);
same && dn.ok ? pass++ : fail++;
rows.push(`${same && dn.ok ? "✓" : "✗"} daily nk-tohum   iki çağrı birebir aynı: ${same} · normalize: ${dn.ok ? "ok" : "RED"} · sayı: ${dn.ok ? (dn.data as { number: { value: number } }).number.value : "?"}`);
console.log(rows.join("\n"));
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
