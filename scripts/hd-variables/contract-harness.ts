/**
 * HD VARIABLES — SÖZLEŞME + ÇAPRAZ DENETİM testleri (SAF; ağ / DB / ücretli çağrı YOK).
 *   • 80 GEÇERLİ sentetik yanıt: Swiss Ephemeris doğumlarından (fixtures/se-births.json) Roxy sözleşme biçiminde üretilir
 *     (Color/Tone/Base = SE; confident = Tone payı > 0,00274° — gerçek sağlayıcıda gözlenen kural). Hepsi kabul edilmeli ve
 *     yerel bağımsız çapraz denetimden geçmeli.
 *   • 60+ GEÇERSİZ / KÖTÜ NİYETLİ varyant: hepsi reddedilmeli (fail-closed); hiçbiri tamamlanmış dört ok gibi dönmemeli.
 *   • Sağlayıcı Color/Tone'u değiştirilmiş (sözleşmeye uygun ama yanlış) yanıt: yerel çapraz denetim yakalamalı.
 *   • Metin güvenliği: HTML düz metin kalır (yorumlanmaz), kontrol karakterleri atılır, uzunluk sınırı.
 * Çalıştır: npx tsx scripts/hd-variables/contract-harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateRoxyVariables } from "../../lib/human-design/variables/variablesContract";
import { applyHistoricalOffsetCaution, crossCheckVariables, localVariableBands, SUN_MAX_ARCSEC_PER_SEC } from "../../lib/human-design/variables/localVariablesCheck";
import { ARROW_SPECS, COGNITION_BY_TONE, substructureOf, toneDirection, type VariableKey } from "../../lib/human-design/variables/variablesMath";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
type SeRow = { color: number; tone: number; base: number; toneMarginArcsec: number };
const births = (JSON.parse(readFileSync(path.resolve(__dirname, "fixtures", "se-births.json"), "utf8")) as { births: Array<{ id: string; utc: string } & Record<VariableKey, SeRow>> }).births;
const MARGIN_DEG = 0.002737909255830788; // gerçek sağlayıcı yanıtlarında gözlenen değer
type J = Record<string, unknown>;

/** Roxy sözleşme biçiminde yanıt (sağlayıcının dizi sırası: determination, environment, perspective, motivation). */
function makeResponse(b: (typeof births)[number]): J {
  const order: VariableKey[] = ["determination", "environment", "perspective", "motivation"];
  const arrows = order.map((k) => {
    const s = b[k];
    const spec = ARROW_SPECS.find((x) => x.key === k)!;
    const confident = s.toneMarginArcsec > MARGIN_DEG * 3600;
    const a: J = {
      key: k, name: k[0].toUpperCase() + k.slice(1), nameLocalized: `TR-${k}`, layer: spec.layer, layerLocalized: "Katman",
      position: spec.position, positionLocalized: "Konum", activation: { planet: spec.planet, side: spec.side, planetLocalized: spec.planet === "Sun" ? "Güneş" : "Kuzey Düğüm" },
      color: s.color, tone: s.tone, base: s.base, direction: toneDirection(s.tone),
      colorLabel: `Color${s.color}`, colorLabelLocalized: `Renk ${s.color}`, directionLabel: "Active", directionLabelLocalized: "Aktif",
      description: "Okun açıklaması.", layerDescription: "Katman açıklaması.", colorMeaning: "Color anlamı.", toneMeaning: "Tone anlamı.", directionMeaning: "Yön anlamı.",
      baseName: "Base", baseNameLocalized: "Taban", confident,
    };
    if (k === "determination") a.cognition = { label: COGNITION_BY_TONE[s.tone - 1], labelLocalized: "Biliş", description: "Biliş açıklaması." };
    return a;
  });
  return { arrows, confident: arrows.every((a) => a.confident === true), confidenceMarginDeg: MARGIN_DEG, baseDescription: "Base katmanı." };
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const arrow = (r: J, k: VariableKey) => (r.arrows as J[]).find((a) => a.key === k)!;

section("1. 80 geçerli sentetik yanıt (Swiss Ephemeris tabanlı) — kabul + çapraz denetim");
let accepted = 0, crossOk = 0, uncertainSeen = 0, orderOk = 0;
for (const b of births.slice(0, 80)) {
  const v = validateRoxyVariables(makeResponse(b));
  if (!v.ok) { console.error("    red", b.id, v.errors); continue; }
  accepted++;
  if (v.value.arrows.map((a) => a.key).join() === "determination,environment,motivation,perspective") orderOk++;
  if (crossCheckVariables(v.value, localVariableBands(new Date(b.utc))).ok) crossOk++;
  if (!v.value.confident) uncertainSeen++;
}
ok(accepted === 80, `80 geçerli yanıtın kabulü ${accepted}/80`);
ok(orderOk === 80, "gösterim sırası sabit: sol üst, sol alt, sağ üst, sağ alt (sağlayıcı dizi sırasından bağımsız)");
ok(crossOk === 80, `bağımsız yerel çapraz denetim ${crossOk}/80 (doğru sonuç reddedilmez)`);
ok(uncertainSeen > 0, `geçerli yanıtlar içinde genel confident=false durumları da var (${uncertainSeen})`);

section("2. Geçersiz / kötü niyetli varyantlar — hepsi reddedilmeli");
const base0 = makeResponse(births[100]);
const variants: Array<[string, (r: J) => unknown]> = [
  ["null", () => null], ["dizi", () => []], ["metin", () => "x"], ["arrows yok", (r) => { delete r.arrows; return r; }],
  ["arrows nesne", (r) => ({ ...r, arrows: {} })], ["3 ok", (r) => ({ ...r, arrows: (r.arrows as J[]).slice(0, 3) })],
  ["5 ok", (r) => ({ ...r, arrows: [...(r.arrows as J[]), (r.arrows as J[])[0]] })],
  ["yinelenen anahtar", (r) => { (r.arrows as J[])[1].key = "determination"; return r; }],
  ["bilinmeyen anahtar", (r) => { (r.arrows as J[])[1].key = "cognition"; return r; }],
  ["anahtar sayı", (r) => { (r.arrows as J[])[1].key = 7; return r; }],
  ["confident yok", (r) => { delete r.confident; return r; }], ["confident metin", (r) => ({ ...r, confident: "true" })],
  ["margin yok", (r) => { delete r.confidenceMarginDeg; return r; }], ["margin negatif", (r) => ({ ...r, confidenceMarginDeg: -0.1 })],
  ["margin NaN", (r) => ({ ...r, confidenceMarginDeg: Number.NaN })], ["margin 5", (r) => ({ ...r, confidenceMarginDeg: 5 })],
  ["baseDescription yok", (r) => { delete r.baseDescription; return r; }], ["baseDescription boş", (r) => ({ ...r, baseDescription: "   " })],
  ["genel confident tutarsız (true)", (r) => { (r.arrows as J[])[0].confident = false; r.confident = true; return r; }],
  ["genel confident tutarsız (false)", (r) => { for (const a of r.arrows as J[]) a.confident = true; r.confident = false; return r; }],
];
for (const k of ["determination", "environment", "motivation", "perspective"] as VariableKey[]) {
  const spec = ARROW_SPECS.find((x) => x.key === k)!;
  variants.push(
    [`${k}: konum yanlış`, (r) => { arrow(r, k).position = spec.position === "Top left" ? "Top right" : "Top left"; return r; }],
    [`${k}: katman yanlış`, (r) => { arrow(r, k).layer = spec.layer === "Rave Psychology" ? "Primary Health System" : "Rave Psychology"; return r; }],
    [`${k}: taraf yanlış`, (r) => { (arrow(r, k).activation as J).side = spec.side === "design" ? "personality" : "design"; return r; }],
    [`${k}: gezegen yanlış`, (r) => { (arrow(r, k).activation as J).planet = spec.planet === "Sun" ? "Earth" : "South Node"; return r; }],
    [`${k}: activation yok`, (r) => { delete arrow(r, k).activation; return r; }],
    [`${k}: color 0`, (r) => { arrow(r, k).color = 0; return r; }],
    [`${k}: color 7`, (r) => { arrow(r, k).color = 7; return r; }],
    [`${k}: color 2.5`, (r) => { arrow(r, k).color = 2.5; return r; }],
    [`${k}: tone 7`, (r) => { arrow(r, k).tone = 7; arrow(r, k).direction = "right"; return r; }],
    [`${k}: tone metin`, (r) => { arrow(r, k).tone = "3"; return r; }],
    [`${k}: base 6`, (r) => { arrow(r, k).base = 6; return r; }],
    [`${k}: base 0`, (r) => { arrow(r, k).base = 0; return r; }],
    [`${k}: yön tone ile çelişik`, (r) => { const a = arrow(r, k); a.direction = a.direction === "left" ? "right" : "left"; return r; }],
    [`${k}: kötü niyetli yön`, (r) => { arrow(r, k).direction = "<img src=x onerror=alert(1)>"; return r; }],
    [`${k}: confident yok`, (r) => { delete arrow(r, k).confident; return r; }],
    [`${k}: description yok`, (r) => { delete arrow(r, k).description; return r; }],
    [`${k}: colorMeaning boş`, (r) => { arrow(r, k).colorMeaning = ""; return r; }],
    [`${k}: baseName sayı`, (r) => { arrow(r, k).baseName = 4; return r; }],
  );
  if (k !== "determination") variants.push([`${k}: cognition yanlış okta`, (r) => { arrow(r, k).cognition = { label: "Smell", description: "x" }; return r; }]);
}
variants.push(
  ["determination: cognition yok", (r) => { delete arrow(r, "determination").cognition; return r; }],
  ["determination: cognition tone ile çelişik", (r) => { const a = arrow(r, "determination"); (a.cognition as J).label = COGNITION_BY_TONE[(Number(a.tone) % 6)]; return r; }],
  ["determination: cognition açıklamasız", (r) => { delete (arrow(r, "determination").cognition as J).description; return r; }],
);
let rejected = 0;
const leaked: string[] = [];
for (const [name, mut] of variants) {
  const v = validateRoxyVariables(mut(clone(base0)));
  if (!v.ok) rejected++;
  else leaked.push(name);
}
ok(variants.length >= 60 && rejected === variants.length, `${variants.length} geçersiz / kötü niyetli varyant → reddedilen ${rejected} (sızan ${leaked.length})`, leaked);

section("3. Sözleşmeye uygun ama YANLIŞ değer — bağımsız çapraz denetim yakalar");
let caught = 0, tried = 0;
for (const b of births.slice(200, 260)) {
  const r = makeResponse(b);
  const a = arrow(r, "motivation"); // Güneş: dar yerel bant → kaydırılmış Tone kesin yakalanmalı
  const t = Number(a.tone);
  const t2 = t <= 3 ? t + 3 : t - 3; // 3 Tone uzak (≈4′41″)
  a.tone = t2;
  a.direction = toneDirection(t2);
  const v = validateRoxyVariables(r);
  if (!v.ok) continue;
  tried++;
  if (!crossCheckVariables(v.value, localVariableBands(new Date(b.utc))).ok) caught++;
}
ok(tried >= 50 && caught === tried, `Güneş okunda 3 Tone kaydırılmış (sözleşmeye uygun) yanlış yanıt: yakalanan ${caught}/${tried}`);
let colorCaught = 0, colorTried = 0;
for (const b of births.slice(300, 360)) {
  const r = makeResponse(b);
  for (const k of ["environment", "perspective"] as VariableKey[]) {
    const a = arrow(r, k);
    a.color = (Number(a.color) % 6) + 1; // komşu Color (9′22,5″ uzak)
    const v = validateRoxyVariables(clone(r));
    if (!v.ok) continue;
    colorTried++;
    if (!crossCheckVariables(v.value, localVariableBands(new Date(b.utc))).ok) colorCaught++;
    a.color = ((Number(a.color) + 4) % 6) + 1;
  }
}
ok(colorTried >= 100 && colorCaught === colorTried, `Kuzey Düğüm oklarında Color değiştirilmiş yanlış yanıt: yakalanan ${colorCaught}/${colorTried}`);

section("4. Metin güvenliği");
const t = clone(base0);
arrow(t, "determination").description = `<script>alert(1)</script>${String.fromCharCode(0, 7)} Gizli${String.fromCharCode(0x200b)} satır${String.fromCharCode(0x2028)}sonu`;
arrow(t, "environment").colorMeaning = "x".repeat(5000);
const tv = validateRoxyVariables(t);
const d = tv.ok ? tv.value.arrows.find((a) => a.key === "determination")!.text.description : "";
const e = tv.ok ? tv.value.arrows.find((a) => a.key === "environment")!.text.colorMeaning : "";
ok(tv.ok && d === "<script>alert(1)</script> Gizli satır sonu" && ![0, 7, 0x200b, 0x2028].some((c) => d.includes(String.fromCharCode(c))), "HTML düz metin olarak kalır (React metin düğümü; yorumlanmaz), kontrol / görünmez karakterler atılır", d);
ok(tv.ok && e.length === 1500 && e.endsWith("…"), "aşırı uzun sağlayıcı metni 1 500 karakterle sınırlanır");
const loc = clone(base0);
delete arrow(loc, "motivation").nameLocalized;
delete arrow(loc, "motivation").colorLabelLocalized;
const lv = validateRoxyVariables(loc);
const mot = lv.ok ? lv.value.arrows.find((a) => a.key === "motivation")! : null;
ok(!!mot && mot.text.name === "Motivation" && mot.text.colorLabel === mot.colorLabel, "yerelleştirilmiş alan yoksa özgün (İngilizce) değere düşülür — uydurma çeviri yok");

section("5. Tarihsel saniyeli ofset — kesinlik yalnız düşer (sağlayıcının ölçülmüş saniye kesmesi)");
{
  let unchanged = 0, baseAll = 0, never = 0, sunRule = 0, nnKept = 0, overall = 0, downgraded = 0, n = 0;
  for (const b of births.slice(0, 200)) {
    const v = validateRoxyVariables(makeResponse(b));
    if (!v.ok) continue;
    n++;
    const bands = localVariableBands(new Date(b.utc));
    if (applyHistoricalOffsetCaution(v.value, bands, 10800) === v.value) unchanged++; // +03:00 — saniyesiz
    for (const off of [7016, -16965]) { // İstanbul +1:56:56 · Santiago −4:42:45
      const x = applyHistoricalOffsetCaution(v.value, bands, off);
      if (x.historicalOffset && x.arrows.every((a) => a.baseCertain === false)) baseAll++;
      if (x.arrows.every((a, i) => !a.confident || v.value.arrows[i].confident)) never++;
      if (x.confident === x.arrows.every((a) => a.confident)) overall++;
      const sec = Math.abs(off % 60);
      const sunOk = x.arrows.filter((a) => a.planet === "Sun").every((a) => {
        const orig = v.value.arrows.find((o) => o.key === a.key)!;
        const bd = bands.find((q) => q.key === a.key)!;
        const keep = orig.confident && substructureOf(bd.longitude).toneBoundaryArcsec >= MARGIN_DEG * 3600 + sec * SUN_MAX_ARCSEC_PER_SEC + bd.bandArcsec;
        if (orig.confident && !keep) downgraded++;
        return a.confident === keep;
      });
      if (sunOk) sunRule++;
      if (x.arrows.filter((a) => a.planet === "North Node").every((a) => a.confident === v.value.arrows.find((o) => o.key === a.key)!.confident)) nnKept++;
    }
  }
  ok(n === 200 && unchanged === n, `saniyesiz ofset (${n} yanıt): DTO aynen döner (kesinlik değişmez)`);
  ok(baseAll === 2 * n, `saniyeli ofset (+ ve −; ${2 * n} durum): dört okun Base'i kesinleştirilemedi, historicalOffset=true`);
  ok(never === 2 * n && overall === 2 * n, "kesinlik hiçbir durumda YÜKSELMEZ; genel bayrak dört okun VE'si");
  ok(sunRule === 2 * n && downgraded > 0, `Güneş okları: yerel Tone payı < güven payı + sapma (|s|·0,0425″) + yerel bant ise kesin sayılmaz (${downgraded} düşürme), değilse bayrak korunur`);
  ok(nnKept === 2 * n, "Kuzey Düğüm okları: sapma ≤ ~1,5″ ≪ güven payı → bayrak korunur (yalnız Base düşer)");
}

console.log(`\nHD VARIABLES SÖZLEŞME: ${pass} PASS / ${fail} FAIL  (senaryo: 80 geçerli + ${variants.length} geçersiz + ${tried + colorTried} yanlış-değer + metin)`);
if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
process.exit(0);
