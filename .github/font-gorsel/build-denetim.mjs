// KANIT: node .github/font-gorsel/build-denetim.mjs <çıktı.json>
// Build sonrası (next build) .next çıktısının yazı tipi denetimi:
//   • .next/static/media → her font dosyası: boyut + SHA-256 (+ app/_fonts dosyalarıyla SHA eşleşmesi)
//   • .next/static/**/*.css → bütün @font-face kuralları (aile, src, ağırlık, stil, display, unicode-range, yedek font
//     metrikleri) + yazı tipi değişkeni bildirimleri (--font-x: 'Aile', 'Aile Fallback')
//   • .next (cache hariç) içinde Google Fonts adresi geçen dosyalar
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , cikti] = process.argv;
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const gez = (d, f = []) => {
  if (!fs.existsSync(d)) return f;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) gez(p, f);
    else f.push(p);
  }
  return f;
};

const kaynak = Object.fromEntries(gez("app/_fonts").filter((p) => /\.(woff2|ttf)$/.test(p)).map((p) => [sha(p), p]));
const medya = gez(".next/static/media")
  .filter((p) => /\.(woff2?|ttf|otf)$/.test(p))
  .map((p) => ({ dosya: path.basename(p), bayt: fs.statSync(p).size, sha256: sha(p), kaynak: kaynak[sha(p)] ?? null }))
  .sort((a, b) => a.dosya.localeCompare(b.dosya));

const yuzler = [];
const degiskenler = {};
for (const p of gez(".next/static").filter((p) => p.endsWith(".css"))) {
  const css = fs.readFileSync(p, "utf8");
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const g = (ad) => (m[1].match(new RegExp(`(?:^|;)\\s*${ad}\\s*:\\s*([^;]*)`)) || [])[1]?.trim() ?? null;
    yuzler.push({
      css: path.basename(p),
      aile: g("font-family"),
      src: g("src"),
      agirlik: g("font-weight"),
      stil: g("font-style"),
      display: g("font-display"),
      unicodeRange: g("unicode-range"),
      ascent: g("ascent-override"),
      descent: g("descent-override"),
      lineGap: g("line-gap-override"),
      sizeAdjust: g("size-adjust"),
    });
  }
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]*(?:Fallback|fallback)[^;}]*)/g)) {
    (degiskenler[m[1]] ??= new Set()).add(m[2].trim());
  }
}

const google = [];
for (const p of gez(".next").filter((p) => !p.includes(`${path.sep}cache${path.sep}`) && !/\.(woff2?|ttf|png|jpe?g|webp|avif|ico)$/.test(p))) {
  const t = fs.readFileSync(p, "latin1");
  const n = (t.match(/fonts\.(googleapis|gstatic)\.com/g) || []).length;
  if (n) google.push({ dosya: p, adet: n });
}

const sonuc = {
  medya,
  medyaToplamBayt: medya.reduce((t, m) => t + m.bayt, 0),
  yuzler,
  degiskenler: Object.fromEntries(Object.entries(degiskenler).map(([k, v]) => [k, [...v]])),
  googleAdresiGecenDosya: google,
};
fs.mkdirSync(path.dirname(cikti), { recursive: true });
fs.writeFileSync(cikti, JSON.stringify(sonuc, null, 1));
console.log(`font dosyası: ${medya.length} (${sonuc.medyaToplamBayt} bayt) · @font-face: ${yuzler.length} · değişken: ${Object.keys(sonuc.degiskenler).length} · Google adresi geçen dosya: ${google.length}`);
for (const m of medya) console.log(`  ${m.dosya}  ${m.bayt}  ${m.sha256.slice(0, 16)}  ${m.kaynak ?? "-"}`);
for (const g of google) console.log(`  GOOGLE: ${g.dosya} (${g.adet})`);
