// GEÇİCİ CI görsel kıyas (final commit'te kaldırılır). node .github/font-kanit/kiyas.mjs <önce-dizini> <sonra-dizini> <fark-dizini>
// Piksel farkı (kanal farkı > 24), değişen satır bantları, boyut / satır kırılması ve CDP font kullanım karşılaştırması.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const [, , A, B, C] = process.argv;
fs.mkdirSync(C, { recursive: true });
const md = ["## Font görsel kıyas (önce = main next/font/google, sonra = PR next/font/local, Google Fonts AĞI ENGELLİ build)", "",
  "| Görüntü | Boyut önce → sonra | Farklı piksel | Değişen satır bantları |", "|---|---|---|---|"];
const satirlar = [];
for (const f of fs.readdirSync(A).filter((x) => x.endsWith(".png")).sort()) {
  const a = await sharp(path.join(A, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(path.join(B, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const boyut = `${a.info.width}x${a.info.height} → ${b.info.width}x${b.info.height}`;
  const W = Math.min(a.info.width, b.info.width), H = Math.min(a.info.height, b.info.height);
  const fark = Buffer.alloc(W * H * 4);
  let d = 0; const bant = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ia = (y * a.info.width + x) * 4, ib = (y * b.info.width + x) * 4, o = (y * W + x) * 4;
    const m = Math.max(Math.abs(a.data[ia] - b.data[ib]), Math.abs(a.data[ia + 1] - b.data[ib + 1]), Math.abs(a.data[ia + 2] - b.data[ib + 2]));
    if (m > 24) { d++; bant.add(Math.floor(y / 50) * 50); fark[o] = 255; fark[o + 3] = 255; }
    else { const g = 200 + (a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 15; fark[o] = fark[o + 1] = fark[o + 2] = g; fark[o + 3] = 255; }
  }
  if (d) await sharp(fark, { raw: { width: W, height: H, channels: 4 } }).png().toFile(path.join(C, f));
  const bantlar = [...bant].sort((x, y) => x - y);
  const ozet = bantlar.length ? bantlar.reduce((acc, y) => { const s = acc[acc.length - 1]; if (s && y - s[1] <= 50) s[1] = y + 50; else acc.push([y, y + 50]); return acc; }, []).map(([s, e]) => `${s}–${e}`).join(", ") : "—";
  satirlar.push({ f, boyut, d, oran: (100 * d) / (W * H), bantlar: ozet, ayniBoyut: a.info.width === b.info.width && a.info.height === b.info.height });
  md.push(`| ${f} | ${boyut}${a.info.width === b.info.width && a.info.height === b.info.height ? "" : " ⚠️"} | ${d} (%${((100 * d) / (W * H)).toFixed(4)}) | ${ozet} |`);
}
// CDP font kullanımı: her öğe için özel (web) font / sistem fontu glif sayıları
const oz = (d) => JSON.parse(fs.readFileSync(path.join(d, "ozet.json"), "utf8"));
const oa = oz(A), ob = oz(B);
md.push("", "### Tarayıcının gerçekte kullandığı fontlar (CDP getPlatformFontsForNode)", "", "| Sayfa | Genişlik | Öğe | Önce (özel/sistem: glif) | Sonra | Eşit |", "|---|---|---|---|---|---|");
let fontFark = 0;
for (const x of oa) {
  const y = ob.find((q) => q.sayfa === x.sayfa && q.w === x.w);
  if (!y) continue;
  const n = Math.max(x.kullanilan.length, y.kullanilan.length);
  for (let i = 0; i < n; i++) {
    const s = (k) => k ? k.fontlar.map((f) => `${f.aile}:${f.glif}`).sort().join(" + ") : "—";
    const ka = x.kullanilan[i], kb = y.kullanilan[i];
    const esit = s(ka) === s(kb);
    if (!esit) fontFark++;
    if (x.sayfa === "/zz-font-kanit" || !esit) md.push(`| ${x.sayfa} | ${x.w} | ${(ka || kb).etiket || i} | ${s(ka)} | ${s(kb)} | ${esit ? "✓" : "✗"} |`);
  }
}
const googleSonra = ob.reduce((t, o) => t + o.googleIstek.length, 0), googleOnce = oa.reduce((t, o) => t + o.googleIstek.length, 0);
md.push("", `- Tarayıcıda Google Fonts isteği: önce ${googleOnce}, sonra ${googleSonra}`, `- Font kullanım farkı olan öğe: ${fontFark}`);
md.push(`- Ölçüler (yükseklik / h1 / buton) farklı olan sayfa: ${oa.filter((x) => { const y = ob.find((q) => q.sayfa === x.sayfa && q.w === x.w); return y && JSON.stringify([x.yukseklik, x.genislik, x.h1, x.buton]) !== JSON.stringify([y.yukseklik, y.genislik, y.h1, y.buton]); }).map((x) => `${x.sayfa}@${x.w}`).join(", ") || "yok"}`);
fs.writeFileSync(path.join(C, "kiyas.md"), md.join("\n"));
fs.writeFileSync(path.join(C, "kiyas.json"), JSON.stringify({ satirlar, fontFark, googleOnce, googleSonra }, null, 1));
console.log(md.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
