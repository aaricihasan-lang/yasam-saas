// KANIT: node .github/font-gorsel/perf-kiyas.mjs <önce perf.json> <sonra perf.json> <çıktı.md>
import fs from "node:fs";

const [, , A, B, C] = process.argv;
const a = JSON.parse(fs.readFileSync(A, "utf8"));
const b = JSON.parse(fs.readFileSync(B, "utf8"));
const f = (o, k = 0) => (o ? `${o.medyan.toFixed(k)} (${o.min.toFixed(k)}–${o.max.toFixed(k)})` : "—");
const kb = (o) => (o ? `${(o.medyan / 1024).toFixed(1)} KB` : "—");
const md = [
  "## Yazı tipi yükleme ölçümü — 390 px, ~Hızlı 3G + CPU 4×, önbellek kapalı, rota başı 5 soğuk koşu (medyan (min–maks))",
  "",
  "| Rota | Font ağ baytı önce → sonra | Font isteği | Preload (font) önce → sonra | CLS önce → sonra | LCP ms önce → sonra | fonts.ready ms önce → sonra | Ilık yeniden yükleme font ağ baytı | Dış istek / CSP ihlali |",
  "|---|---|---|---|---|---|---|---|---|",
];
for (const x of a) {
  const y = b.find((q) => q.rota === x.rota);
  const pre = (q) => q.kosular[0].preload.length;
  const dis = (q) => `${q.kosular.reduce((t, k) => t + k.disariIstek.length, 0)} / ${q.kosular.reduce((t, k) => t + k.cspIhlal.length, 0)}`;
  md.push(
    `| ${x.rota} | ${kb(x.fontAgBayt)} → ${kb(y.fontAgBayt)} | ${f(x.fontIstek)} → ${f(y.fontIstek)} | ${pre(x)} → ${pre(y)} | ${f(x.cls, 4)} → ${f(y.cls, 4)} | ${f(x.lcp)} → ${f(y.lcp)} | ${f(x.fontsReadyMs)} → ${f(y.fontsReadyMs)} | ${x.ilikFontAgBayt} → ${y.ilikFontAgBayt} | ${dis(x)} → ${dis(y)} |`,
  );
}
md.push("", "### İndirilen font dosyaları (ilk koşu)", "");
for (const x of a) {
  const y = b.find((q) => q.rota === x.rota);
  const l = (q) => q.kosular[0].fontlar.map((t) => `${t.url.split("/").pop()} ${(t.bayt / 1024).toFixed(1)} KB`).join(", ") || "—";
  md.push(`- **${x.rota}** önce: ${l(x)}`, `  sonra: ${l(y)}`, `  cache-control (sonra): ${[...new Set(y.kosular[0].fontlar.map((t) => t.cc))].join(" | ") || "—"}`);
}
fs.writeFileSync(C, md.join("\n"));
console.log(md.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
