/**
 * Klasik Numeroloji · Doğaltaş eşleşme ÇEVRİMDIŞI analizi (ağ / DB / sağlayıcı çağrısı YOK; 0 kredi).
 *
 * Girdi (repo DIŞI, commit edilmez):
 *   - Ham kristal detayları:  C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24/birebir-denetim/ham/roxy/<id>.{en,tr}.json
 *   - Uğurlu taşlar (Yaşam Yolu başına): C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/lucky-gemstones.json
 * Çıktı: C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/DOGALTAS-ESLESME.md (yalnız ad / kimlik / sayı; açıklama metni YOK)
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/stones/offline-index.ts
 * Ortam: NUM_KLASIK_CRYSTALS_DIR, NUM_KLASIK_LUCKY_FILE, NUM_KLASIK_STONES_REPORT ile yollar değiştirilebilir.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { matchStonesForNumbers } from "../../../lib/numeroloji-klasik/stones/matcher";
import { buildStoneNameIndex, resolveStoneName, type NameResolution } from "../../../lib/numeroloji-klasik/stones/nameIndex";
import { elementKeys, planetKeys } from "../../../lib/numeroloji-klasik/stones/vocab";
import type { StoneCandidate, StoneMatchMethod } from "../../../lib/numeroloji-klasik/stones/types";

const CRYSTALS_DIR = process.env.NUM_KLASIK_CRYSTALS_DIR ?? "C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24/birebir-denetim/ham/roxy";
const LUCKY_FILE = process.env.NUM_KLASIK_LUCKY_FILE ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/lucky-gemstones.json";
const REPORT = process.env.NUM_KLASIK_STONES_REPORT ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/DOGALTAS-ESLESME.md";

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
function readJson(p: string): unknown {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// ── 1) Dizin ───────────────────────────────────────────────────────────────────────────────────
if (!existsSync(CRYSTALS_DIR)) {
  console.error(`Ham kristal klasörü yok: ${CRYSTALS_DIR}`);
  process.exit(2);
}
const ids = readdirSync(CRYSTALS_DIR)
  .filter((f) => /^[a-z0-9][a-z0-9-]*\.en\.json$/.test(f))
  .map((f) => f.replace(/\.en\.json$/, ""))
  .sort();
const index: StoneCandidate[] = [];
const vib = new Map<string, number>();
const planetRaw = new Map<string, number>();
const unknownPlanets = new Set<string>();
const unknownElements = new Set<string>();
const trMissing: string[] = [];
const trEqualsEn: string[] = [];
for (const id of ids) {
  const en = readJson(path.join(CRYSTALS_DIR, `${id}.en.json`));
  const tr = readJson(path.join(CRYSTALS_DIR, `${id}.tr.json`));
  if (!isObj(en)) continue;
  const nameEn = typeof en.name === "string" ? en.name : null;
  const nameTr = isObj(tr) && typeof tr.name === "string" ? tr.name : null;
  if (!nameTr) trMissing.push(id);
  if (nameTr && nameEn && nameTr.toLowerCase() === nameEn.toLowerCase()) trEqualsEn.push(`${id} (${nameTr})`);
  const v = typeof en.numericalVibration === "number" ? en.numericalVibration : null;
  vib.set(String(v), (vib.get(String(v)) ?? 0) + 1);
  const planet = typeof en.planet === "string" ? en.planet : "";
  if (planet) planetRaw.set(planet, (planetRaw.get(planet) ?? 0) + 1);
  if (planet && planetKeys(planet).length === 0) unknownPlanets.add(planet);
  for (const e of strs(en.elements)) if (elementKeys(e).length === 0 && !/^all\b/i.test(e.trim())) unknownElements.add(e);
  index.push({
    stoneKey: id,
    nameTr: nameTr ?? nameEn ?? id,
    nameEn,
    aliases: [],
    numericalVibration: v,
    planets: planet ? [planet] : [],
    chakras: strs(en.chakras),
    elements: strs(en.elements),
    pairsWith: strs(en.pairsWith),
  });
}
const NI = buildStoneNameIndex(index);
const pairsDangling = new Set<string>();
const known = new Set(index.map((s) => s.stoneKey));
for (const s of index) for (const p of s.pairsWith ?? []) if (!known.has(p)) pairsDangling.add(p);

// ── 2) Uğurlu taşlar ────────────────────────────────────────────────────────────────────────────
type LuckyLang = { gemstones?: string[]; rulingPlanet?: string; element?: string };
const luckyRaw = existsSync(LUCKY_FILE) ? readJson(LUCKY_FILE) : null;
const lucky: Record<string, { tr?: LuckyLang; en?: LuckyLang }> = isObj(luckyRaw) ? (luckyRaw as Record<string, { tr?: LuckyLang; en?: LuckyLang }>) : {};
const lifePaths = Object.keys(lucky).sort((a, b) => Number(a) - Number(b));

const fmtRes = (r: NameResolution): string =>
  r.status === "matched"
    ? `✓ ${r.entry.stoneKey} (${r.via})`
    : r.status === "ambiguous"
      ? `? ${r.candidates.map((c) => `${c.stoneKey}[${c.via}]`).join(", ")}`
      : "✗";

let trTotal = 0, trMatched = 0, trAmb = 0, enTotal = 0, enMatched = 0, enAmb = 0, comboMatched = 0, comboAmb = 0, comboUn = 0;
const unmatchedNames = new Set<string>();
const disagreements: string[] = [];
const rows: string[] = [];
const groupRows: string[] = [];
const planetNotes: string[] = [];
for (const lp of lifePaths) {
  const trG = strs(lucky[lp]?.tr?.gemstones);
  const enG = strs(lucky[lp]?.en?.gemstones);
  const n = Math.max(trG.length, enG.length);
  for (let i = 0; i < n; i++) {
    const t = trG[i] ?? "";
    const e = enG[i] ?? "";
    const rt = t ? resolveStoneName(NI, t) : ({ status: "unmatched" } as NameResolution);
    const re = e ? resolveStoneName(NI, e) : ({ status: "unmatched" } as NameResolution);
    if (t) {
      trTotal++;
      if (rt.status === "matched") trMatched++;
      else if (rt.status === "ambiguous") trAmb++;
    }
    if (e) {
      enTotal++;
      if (re.status === "matched") enMatched++;
      else if (re.status === "ambiguous") enAmb++;
    }
    if (rt.status === "matched" && re.status === "matched" && rt.entry.stoneKey !== re.entry.stoneKey) {
      disagreements.push(`YY ${lp}: "${t}" → ${rt.entry.stoneKey} ama "${e}" → ${re.entry.stoneKey}`);
    }
    rows.push(`| ${lp} | ${t || "—"} | ${fmtRes(rt)} | ${e || "—"} | ${fmtRes(re)} |`);
  }
  const value = Number(lp);
  const m = matchStonesForNumbers(
    { lifePath: { value, type: [11, 22, 33].includes(value) ? "master" : "single" } },
    { gemstones: trG, gemstonesAlt: enG, rulingPlanet: lucky[lp]?.tr?.rulingPlanet ?? lucky[lp]?.en?.rulingPlanet, element: lucky[lp]?.en?.element },
    index,
    { includeElement: true },
  );
  for (const p of m.providerDirect) {
    if (p.status === "matched") comboMatched++;
    else if (p.status === "ambiguous") comboAmb++;
    else {
      comboUn++;
      unmatchedNames.add(`${p.input}${enG[trG.indexOf(p.input)] ? ` / ${enG[trG.indexOf(p.input)]}` : ""}`);
    }
  }
  const cnt = (meth: StoneMatchMethod) => {
    const g = m.groups.find((x) => x.method === meth);
    return g ? `${g.items.length}/${g.total}` : "—";
  };
  groupRows.push(
    `| ${lp} | ${m.providerDirect.map((p) => `${p.input}:${p.status}${p.stoneKey ? `→${p.stoneKey}` : ""}`).join("; ")} | ${cnt("vibration_exact")} | ${cnt("vibration_root")} | ${cnt("planet")} | ${cnt("pairs_with")} | ${cnt("element")} | ${m.suggestions.length} |`,
  );
  const pn = m.notes.filter((x) => /gezegen|düğüm/i.test(x));
  if (pn.length) planetNotes.push(`- YY ${lp} (${lucky[lp]?.tr?.rulingPlanet ?? "?"}): ${pn.join(" ")}`);
}

// ── 3) Rapor ────────────────────────────────────────────────────────────────────────────────────
const vibRows = [...vib.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `| ${k === "0" ? "0 (bilinmiyor)" : k} | ${v} |`);
const planetRows = [...planetRaw.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${planetKeys(k).join(", ") || "TANINMADI"} |`);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "—");
const md = `# Numeroloji × Doğaltaş — çevrimdışı eşleşme analizi

Tarih: ${new Date().toISOString()} · Ağ / DB / sağlayıcı çağrısı YOK (0 kredi). Rapor yalnız ad / kimlik / sayı içerir.

Kaynaklar:
- Ham kristal detayları: \`${CRYSTALS_DIR}\` → **${index.length} taş** (EN+TR ad).
- Uğurlu taşlar: \`${LUCKY_FILE}\` → ${lifePaths.length ? `**${lifePaths.length} Yaşam Yolu** (${lifePaths.join(", ")})` : "**DOSYA YOK** — eşleşme bölümü boş"}.

## 1. Sayısal titreşim dağılımı

| titreşim | taş |
|---|---|
${vibRows.join("\n")}

Gözlem: değerler yalnız 0–9; usta sayı (11/22/33) değeri **hiç yok** → usta sayılı kişilerde titreşim eşleşmesi yalnız
"kök sayı üzerinden türetilmiş" (vibration_root) olabilir. 0 = bilinmiyor kabul edildi ve eşleşmeye alınmadı.

## 2. Gezegen değerleri

| ham değer | taş | anahtar |
|---|---|---|
${planetRows.join("\n")}

Tanınmayan gezegen: ${unknownPlanets.size ? [...unknownPlanets].join(", ") : "yok"} · Tanınmayan element: ${unknownElements.size ? [...unknownElements].join(", ") : "yok"}

## 3. Ad dizini kalitesi

- TR adı eksik: ${trMissing.length ? trMissing.join(", ") : "yok"}
- TR adı = EN adı (çevrilmemiş olabilir): ${trEqualsEn.length} → ${trEqualsEn.join(", ") || "—"}
- Katlanmış ad çakışması: ${NI.collisions.length ? NI.collisions.map((c) => `${c.key} → ${c.stoneKeys.join("/")}`).join("; ") : "yok"}
- Dizinde olmayan eşlikçi (pairsWith) kimlikleri: ${pairsDangling.size ? [...pairsDangling].sort().join(", ") : "yok"}

## 4. Uğurlu taş adlarının kristal kimliklerine çözümü

| dil | ad | kesin | belirsiz | çözülemeyen |
|---|---|---|---|---|
| TR | ${trTotal} | ${trMatched} (${pct(trMatched, trTotal)}) | ${trAmb} | ${trTotal - trMatched - trAmb} |
| EN | ${enTotal} | ${enMatched} (${pct(enMatched, enTotal)}) | ${enAmb} | ${enTotal - enMatched - enAmb} |
| TR + EN yedek (eşleştiricinin gerçek davranışı) | ${comboMatched + comboAmb + comboUn} | ${comboMatched} (${pct(comboMatched, comboMatched + comboAmb + comboUn)}) | ${comboAmb} | ${comboUn} |

Çözülemeyen adlar (TR / EN): ${unmatchedNames.size ? [...unmatchedNames].join("; ") : "yok"}

TR ↔ EN farklı taşa çözülen: ${disagreements.length ? `\n${disagreements.map((d) => `- ${d}`).join("\n")}` : "yok"}

| YY | TR ad | TR çözüm | EN ad | EN çözüm |
|---|---|---|---|---|
${rows.join("\n")}

Gösterim: ✓ kesin (yol) · ? belirsiz aday[yol] — otomatik seçilmez · ✗ çözülemedi (ad metin olarak gösterilir).

## 5. Yaşam Yolu başına grup sayıları (yalnız Yaşam Yolu; element AÇIK, tavan 6/20)

| YY | doğrudan | titreşim tam | kök | gezegen | eşlikçi | element | toplam öneri |
|---|---|---|---|---|---|---|---|
${groupRows.join("\n")}

Hücre: gösterilen/toplam.

Gezegen notları:
${planetNotes.join("\n") || "- yok"}
`;
writeFileSync(REPORT, md, "utf8");
console.log(`Rapor yazıldı: ${REPORT}`);
console.log(`taş=${index.length} · titreşim0=${vib.get("0") ?? 0} · TR kesin ${trMatched}/${trTotal} · EN kesin ${enMatched}/${enTotal} · TR+EN kesin ${comboMatched}, belirsiz ${comboAmb}, çözülemeyen ${comboUn}`);
