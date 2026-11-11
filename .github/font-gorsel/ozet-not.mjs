// KANIT: node .github/font-gorsel/ozet-not.mjs <indirme-dizini>
// Sonuçların ÖZETİ GitHub check-run notu (annotation) olarak yazılır — artefakt / log indirilemediğinde (hesap egress sınırı)
// REST API'den okunabilir. Her not ≤ 60 KB; adım başına en fazla 10 not.
import fs from "node:fs";
import path from "node:path";

const [, , K] = process.argv;
const oku = (p) => JSON.parse(fs.readFileSync(path.join(K, p), "utf8"));
const notlar = [];
const ekle = (baslik, satirlar) => {
  let parca = [];
  let boy = 0;
  for (const s of satirlar) {
    if (boy + s.length > 55000) {
      notlar.push([baslik, parca]);
      parca = [];
      boy = 0;
    }
    parca.push(s);
    boy += s.length + 1;
  }
  if (parca.length) notlar.push([baslik, parca]);
};

// 1) Görsel: gürültü / fark oranı, boyut, ölçü, taşma, CDP font farkı
const f = oku("fark/fark/kiyas.json");
const g = oku("fark/gurultu/kiyas.json");
const G = new Map(g.tablo.map((t) => [`${t.ekran}|${t.w}`, t]));
ekle("gorsel", [
  "ekran|w|gurultu%|fark%|boyut|olcu|tasma",
  ...f.tablo.map((t) => {
    const n = G.get(`${t.ekran}|${t.w}`);
    return `${t.ekran}|${t.w}|${n.oran.toFixed(3)}|${t.oran.toFixed(3)}|${t.ayniBoyut ? "=" : t.boyut}|${t.olcuEsit ? "ok" : JSON.stringify([t.olcuOnce, t.olcuSonra]).slice(0, 600)}|${t.tasmaOnce}/${t.tasmaSonra}`;
  }),
  `CDP font farki: ${f.fontFark.length} (gurultu ${g.fontFark.length}) · google istek ${JSON.stringify(f.google)}`,
  ...f.fontFark.slice(0, 40).map((x) => `FF ${x.ekran}|${x.w}|${x.oge}|${JSON.stringify(x.once)}|${JSON.stringify(x.sonra)}`),
]);

// 2) @font-face / yedek metrik özeti
ekle("fontface", fs.readFileSync(path.join(K, "fark/fontface.md"), "utf8").split("\n"));

// 3) Performans özeti
ekle("perf", fs.readFileSync(path.join(K, "fark/perf.md"), "utf8").split("\n").filter((s) => s.startsWith("|") || s.startsWith("- **") || s.startsWith("  ")));

// 4) Rota bazlı ön yükleme (next-font-manifest × build medya boyutları)
const rota = (t) => {
  const m = oku(`gorsel-${t}/${t}-next-font-manifest.json`);
  const b = oku(`gorsel-${t}/${t}-build.json`);
  const boy = Object.fromEntries(b.medya.map((x) => [x.dosya, x.bayt]));
  const r = {};
  for (const [k, v] of Object.entries(m.app)) {
    if (k.includes("zz-ekran")) continue;
    const d = [...new Set(v.map((x) => path.basename(x)))].sort();
    r[k] = { d, b: d.reduce((s, x) => s + (boy[x] || 0), 0) };
  }
  return r;
};
const o = rota("once");
const s = rota("sonra");
const sinif = {};
const satir = [];
for (const k of [...new Set([...Object.keys(o), ...Object.keys(s)])].sort()) {
  const a = o[k];
  const b = s[k];
  if (!a || !b) {
    sinif["YALNIZ-BIR-TARAF"] = (sinif["YALNIZ-BIR-TARAF"] || 0) + 1;
    continue;
  }
  const atlasRota = k.includes("astroloji");
  const atlasSonra = b.d.some((x) => /manrope|unbounded/.test(x));
  const fark = b.b - a.b;
  const c = atlasSonra && !atlasRota ? "ATLAS-FONTU-GEREKSIZ" : fark > 0 ? "AGIRLASTI" : fark < 0 ? "HAFIFLEDI" : "AYNI";
  sinif[c] = (sinif[c] || 0) + 1;
  satir.push(`${c}|${(fark / 1024).toFixed(1)}|${k.replace("[project]/", "")}|${(a.b / 1024).toFixed(1)}->${(b.b / 1024).toFixed(1)}|${b.d.map((x) => x.split("-s")[0].slice(0, 14)).join(" ")}`);
}
const dagilim = {};
for (const x of satir) {
  const [c, kb] = x.split("|");
  dagilim[`${c} ${kb}KB`] = (dagilim[`${c} ${kb}KB`] || 0) + 1;
}
ekle("rota", [`rota sayisi ${satir.length} · ${JSON.stringify(sinif)}`, `dagilim ${JSON.stringify(dagilim)}`, ...satir.filter((x) => !x.startsWith("AYNI") && !x.startsWith("HAFIFLEDI") || /astroloji|life-analysis|danisan|human-design|kampanya|ucretsiz|enerji|numeroloji|refleks|kupa|biyoenerji|app\/page|register/.test(x))]);

for (const [baslik, parca] of notlar.slice(0, 10)) {
  const metin = parca.join("\n").replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.log(`::notice title=${baslik}::${metin}`);
}
console.log(`not sayısı: ${notlar.length}`);
