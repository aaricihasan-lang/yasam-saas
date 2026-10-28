#!/usr/bin/env node
/**
 * RKS-3 kapı: select.mjs planındaki testleri izole çalıştırır ve karar verir.
 *
 *   node scripts/rks/run.mjs --plan <plan.json> [--report <rapor.json>]
 *
 * Her test: sır içermeyen ortam + net-guard ağ koruması + zaman aşımı.
 * Sonuç sınıfları: PASS | BILINEN-FAIL (known-failures.json, süreli) | YENI-FAIL | ATLANDI |
 * SAYILAMADI | ALTYAPI | AG-IHLALI. Yalnız PASS ve BILINEN-FAIL geçer; ALTYAPI bir kez yeniden
 * denenir, yine sonuç yoksa FAIL. Plan politika hataları (kapsam, assertion, zayıflatma, kritik
 * korumasız) da burada kapıya dönüşür. Seçilen test sayısı > 0 iken çalışan sayı ≠ seçilen → FAIL.
 */
import fs from "node:fs";
import { readJson } from "./lib/common.mjs";
import { judge, runTest } from "./lib/exec.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const plan = JSON.parse(fs.readFileSync(arg("--plan"), "utf8"));
const reportPath = arg("--report");
const known = new Map(readJson("scripts/rks/known-failures.json").kayitlar.map((k) => [k.file, k]));

const t0 = Date.now();
const rows = [];
for (const sel of plan.secilen) {
  // CI kapısı yalnız envanterde A olan testi çalıştırır; korunan/ertelenen/B-OWNER/C süreç başlatılmadan reddedilir.
  const t = { ...sel, requireA: true };
  let r = await runTest(t);
  let j = judge(t, r, known.get(t.file));
  let retried = false;
  if (j.durum === "ALTYAPI") { retried = true; r = await runTest(t); j = judge(t, r, known.get(t.file)); }
  rows.push({ id: t.id, file: t.file, ...j, retried, secs: r.secs, pass: r.summary?.pass ?? null, fail: r.summary?.fail ?? null, minPass: t.minPass, tail: j.ok ? [] : r.tail });
  console.log(`${j.ok ? "PASS" : "FAIL"} [${j.durum}] ${t.id} — ${j.neden} (${r.secs}s${retried ? ", yeniden denendi" : ""})`);
  if (!j.ok) for (const l of r.tail) console.log(`    │ ${l}`);
}
const secs = +((Date.now() - t0) / 1000).toFixed(1);
const failed = rows.filter((r) => !r.ok);
const errors = [...plan.errors];
if (rows.length !== plan.secilen.length) errors.push(`Seçilen ${plan.secilen.length} test, çalışan ${rows.length} (eksik çalışma)`);
for (const f of failed) errors.push(`${f.id}: ${f.durum} — ${f.neden}`);

// ── Özet (GitHub Step Summary + konsol) ──
const korumasiz = plan.dosyalar.filter((d) => ["KORUMASIZ", "HARITASIZ"].includes(d.durum));
const dolayli = plan.dosyalar.filter((d) => d.durum === "MODUL-TESTI-VAR-DOGRUDAN-KAPSAM-YOK");
const rksDisi = plan.dosyalar.filter((d) => d.durum.startsWith("RKS-DISI"));
const md = [
  `## RKS-3 merkezî regresyon kapısı — ${errors.length ? "❌ BAŞARISIZ" : "✅ GEÇTİ"}`,
  `Değişen dosya: **${plan.dosyalar.length}** · RKS-3 adımında koşan test: **${rows.length}** (${secs} sn) · geniş kapsam: ${plan.genis ? "evet" : "hayır"} · kapsam kilidi: ${plan.kapsam.durum}`,
  plan.mevcutAdimlardaKosan.length ? `Mevcut CI adımlarında (RKS-2 / AŞAMA 1) zaten koşan ilgili testler: ${plan.mevcutAdimlardaKosan.map((t) => `${t.id} (${t.calistiran})`).join(", ")}` : "",
  "",
  rows.length ? "| Test | Sonuç | PASS/FAIL | Alt sınır | Süre |\n|---|---|---|---|---|\n" + rows.map((r) => `| ${r.id} | ${r.durum} | ${r.pass ?? "—"}/${r.fail ?? "—"} | ${r.minPass} | ${r.secs}s |`).join("\n") : "_Bu değişiklik için RKS-3 adımında koşacak test seçilmedi._",
  "",
  korumasiz.length ? `### ⛔ Otomatik testi OLMAYAN değişen dosyalar (${korumasiz.length})\n` + korumasiz.map((d) => `- \`${d.file}\` — ${d.durum}${d.moduller.length ? ` (modül: ${d.moduller.join(",")})` : ""}`).join("\n") : "",
  dolayli.length ? `### ⚠ Modül testleri koştu, ama bu dosyalar DOĞRUDAN test edilmiyor (${dolayli.length}) — korunuyor SAYILMAZ\n` + dolayli.map((d) => `- \`${d.file}\` (modül: ${d.moduller.join(",")})`).join("\n") : "",
  rksDisi.length ? `### RKS dışı (Owner kararı: korunan/ertelenen alan, test çalıştırılmadı) (${rksDisi.length})\n` + rksDisi.map((d) => `- \`${d.file}\` — ${d.durum}`).join("\n") : "",
  plan.guvence ? `### Güvence düzeyi\n- Kapsam bildirimi: ${plan.guvence.kapsamBildirimi}\n- Etiketler: ${plan.guvence.etiketler}\n- Owner onayı: ${plan.guvence.ownerOnayi}` : "",
  plan.warnings.length ? "### Uyarılar\n" + plan.warnings.map((w) => `- ${w}`).join("\n") : "",
  errors.length ? "### Kapıyı durduran nedenler\n" + errors.map((e) => `- ${e}`).join("\n") : "",
].filter((x) => x !== "").join("\n");
console.log("\n" + md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify({ secs, rows, errors, warnings: plan.warnings }, null, 1));
for (const e of errors) console.log(`::error::RKS-3: ${e}`);
process.exit(errors.length ? 1 : 0);
