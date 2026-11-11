// KANIT: node .github/font-gorsel/kiyas.mjs <önce> <sonra> <çıktı>
// Piksel farkı + önce | sonra | fark yan yana görüntüleri + CDP öğe-başı font karşılaştırması + ölçü karşılaştırması.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const [, , A, B, C] = process.argv;
const adi = (s) => (s === "/" ? "ana-sayfa" : s.split("/").filter(Boolean).pop());
fs.mkdirSync(path.join(C, "yan-yana"), { recursive: true });
const md = [`## ${process.env.KIYAS_BASLIK || "#777 görsel kabul (önce = main next/font/google · sonra = #777, Google Fonts ağı engelli build)"}`, "",
  "| Ekran | Genişlik | Boyut önce → sonra | Farklı piksel | Ölçüler (başlık/buton/kart) | Taşma |", "|---|---|---|---|---|---|"];
const oa = JSON.parse(fs.readFileSync(path.join(A, "ozet.json"), "utf8"));
const ob = JSON.parse(fs.readFileSync(path.join(B, "ozet.json"), "utf8"));
const tablo = [];
for (const x of oa) {
  const y = ob.find((q) => q.ekran === x.ekran && q.w === x.w);
  const f = `${adi(x.ekran)}-${x.w}.png`;
  const a = await sharp(path.join(A, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(path.join(B, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = Math.min(a.info.width, b.info.width), H = Math.min(a.info.height, b.info.height);
  const fark = Buffer.alloc(W * H * 4); let d = 0;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const ia = (yy * a.info.width + xx) * 4, ib = (yy * b.info.width + xx) * 4, o = (yy * W + xx) * 4;
    const m = Math.max(Math.abs(a.data[ia] - b.data[ib]), Math.abs(a.data[ia + 1] - b.data[ib + 1]), Math.abs(a.data[ia + 2] - b.data[ib + 2]));
    if (m > 24) { d++; fark[o] = 255; fark[o + 3] = 255; } else { const g = 215 + (a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 20; fark[o] = fark[o + 1] = fark[o + 2] = Math.min(255, g); fark[o + 3] = 255; }
  }
  const farkPng = await sharp(fark, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const bosluk = 12;
  // Boyutlar farklıysa tuval büyüğe göre (sharp küçük tuvale büyük görüntü bindiremez); fark yalnız ortak alanda.
  await sharp({ create: { width: a.info.width + b.info.width + W + bosluk * 2, height: Math.max(a.info.height, b.info.height), channels: 3, background: "#ff00ff" } })
    .composite([{ input: path.join(A, f), left: 0, top: 0 }, { input: path.join(B, f), left: a.info.width + bosluk, top: 0 }, { input: farkPng, left: a.info.width + b.info.width + 2 * bosluk, top: 0 }])
    .png().toFile(path.join(C, "yan-yana", f));
  const olcuEsit = JSON.stringify([x.yukseklik, x.genislik, x.baslik, x.buton, x.kart]) === JSON.stringify([y.yukseklik, y.genislik, y.baslik, y.buton, y.kart]);
  const satir = { ekran: x.ekran, w: x.w, boyut: `${a.info.width}x${a.info.height} → ${b.info.width}x${b.info.height}`, ayniBoyut: a.info.width === b.info.width && a.info.height === b.info.height, fark: d, oran: (100 * d) / (W * H), olcuEsit, tasmaOnce: x.tasma, tasmaSonra: y.tasma, olcuOnce: { baslik: x.baslik, buton: x.buton, kart: x.kart }, olcuSonra: { baslik: y.baslik, buton: y.buton, kart: y.kart } };
  tablo.push(satir);
  md.push(`| ${adi(x.ekran)} (${x.durum}→${y.durum}) | ${x.w} | ${satir.boyut}${satir.ayniBoyut ? "" : " ⚠️"} | ${d} (%${satir.oran.toFixed(3)}) | ${olcuEsit ? "✓ birebir" : "⚠️ farklı"} | ${x.tasma ? "VAR" : "yok"} → ${y.tasma ? "VAR" : "yok"} |`);
}
md.push("", "### Öğe başına çizen fontlar (CDP) — yalnız FARKLI olanlar", "", "| Ekran | Genişlik | Öğe | Önce | Sonra |", "|---|---|---|---|---|");
const fontFark = [];
const yaz = (l) => (l || []).map((f) => `${f.aile}:${f.glif}`).join(" + ") || "—";
const sistem = (l) => (l || []).filter((f) => !f.aile.startsWith("ÖZEL")).map((f) => `${f.aile}:${f.glif}`).sort().join("+");
const ozelSay = (l) => (l || []).filter((f) => f.aile.startsWith("ÖZEL")).reduce((t, f) => t + f.glif, 0);
for (const x of oa) {
  const y = ob.find((q) => q.ekran === x.ekran && q.w === x.w);
  for (const k of new Set([...Object.keys(x.kullanilan), ...Object.keys(y.kullanilan)])) {
    const a = x.kullanilan[k], b = y.kullanilan[k];
    if (sistem(a) === sistem(b) && ozelSay(a) === ozelSay(b)) continue;
    fontFark.push({ ekran: x.ekran, w: x.w, oge: k, once: a, sonra: b });
    md.push(`| ${adi(x.ekran)} | ${x.w} | ${k.replace(/\|/g, "/")} | ${yaz(a)} | ${yaz(b)} |`);
  }
}
const g = [oa, ob].map((o) => o.reduce((t, q) => t + q.googleIstek.length, 0));
md.push("", `- Tarayıcıda Google Fonts isteği: önce ${g[0]}, sonra ${g[1]}`, `- Çizen font farkı olan öğe: ${fontFark.length} (özel font adları build'e göre değiştiği için yalnız SAYI ve SİSTEM fontu karşılaştırılır)`);
fs.writeFileSync(path.join(C, "kiyas.md"), md.join("\n"));
fs.writeFileSync(path.join(C, "kiyas.json"), JSON.stringify({ tablo, fontFark, google: g }, null, 1));
console.log(md.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
