// KANIT: node .github/font-gorsel/fontface-kiyas.mjs <önce build-denetim.json> <sonra build-denetim.json> <çıktı.md>
// Her yazı tipi değişkeni (--font-geist-sans …) için önce/sonra: çözülen aile, @font-face ağırlık/stil/display, unicode-range
// sayısı, yedek (Fallback) yüzün yerel fontu ve metrik geçersiz kılmaları (CLS'yi belirleyen değerler).
import fs from "node:fs";

const [, , A, B, C] = process.argv;
const a = JSON.parse(fs.readFileSync(A, "utf8"));
const b = JSON.parse(fs.readFileSync(B, "utf8"));
const temiz = (s) => (s || "").replace(/["']/g, "").trim();

function cozum(d, v) {
  const decl = d.degiskenler[v]?.[0];
  if (!decl) return null;
  const [ana, yedek] = decl.split(",").map(temiz);
  const ayni = (f) => d.yuzler.filter((y) => temiz(y.aile) === f);
  const ay = ayni(ana);
  const yy = ayni(yedek);
  const benzersiz = [...new Map(ay.map((y) => [`${y.agirlik}|${y.stil}|${y.display}|${y.unicodeRange}|${y.src}`, y])).values()];
  return {
    decl,
    agirliklar: [...new Set(benzersiz.map((y) => `${y.agirlik ?? "-"}/${y.stil ?? "normal"}`))].sort().join(" "),
    display: [...new Set(benzersiz.map((y) => y.display))].join(","),
    yuzSayisi: benzersiz.length,
    dosyaSayisi: new Set(benzersiz.map((y) => (y.src || "").match(/url\(([^)]*)\)/)?.[1])).size,
    unicodeRange: benzersiz.filter((y) => y.unicodeRange).length,
    yedek: yy[0] ? { src: yy[0].src, ascent: yy[0].ascent, descent: yy[0].descent, lineGap: yy[0].lineGap, sizeAdjust: yy[0].sizeAdjust } : null,
  };
}

const vars = [...new Set([...Object.keys(a.degiskenler), ...Object.keys(b.degiskenler)])].sort();
const md = ["## @font-face ve yedek font metrikleri (build çıktısından)", "", "| Değişken | Ağırlık/stil önce → sonra | display | yüz / dosya önce → sonra | Yedek font önce → sonra | ascent / descent / lineGap / size-adjust önce → sonra |", "|---|---|---|---|---|---|"];
const json = {};
for (const v of vars) {
  const x = cozum(a, v);
  const y = cozum(b, v);
  json[v] = { once: x, sonra: y };
  const m = (q) => (q?.yedek ? `${q.yedek.ascent} / ${q.yedek.descent} / ${q.yedek.lineGap} / ${q.yedek.sizeAdjust}` : "—");
  md.push(
    `| ${v} | ${x?.agirliklar ?? "—"} → ${y?.agirliklar ?? "—"} | ${x?.display ?? "—"} → ${y?.display ?? "—"} | ${x?.yuzSayisi ?? 0}/${x?.dosyaSayisi ?? 0} → ${y?.yuzSayisi ?? 0}/${y?.dosyaSayisi ?? 0} | ${temiz(x?.yedek?.src)} → ${temiz(y?.yedek?.src)} | ${m(x)} → ${m(y)} |`,
  );
}
md.push("", `- Font dosyası (build çıktısı): önce ${a.medya.length} dosya / ${a.medyaToplamBayt} bayt → sonra ${b.medya.length} dosya / ${b.medyaToplamBayt} bayt`);
md.push(`- Sonra: app/_fonts ile SHA-256 eşleşen build dosyası: ${b.medya.filter((m) => m.kaynak).length}/${b.medya.length}`);
md.push(`- Google Fonts adresi geçen build dosyası: önce ${a.googleAdresiGecenDosya.length} → sonra ${b.googleAdresiGecenDosya.length}`);
fs.writeFileSync(C, md.join("\n"));
fs.writeFileSync(C.replace(/\.md$/, ".json"), JSON.stringify(json, null, 1));
console.log(md.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
