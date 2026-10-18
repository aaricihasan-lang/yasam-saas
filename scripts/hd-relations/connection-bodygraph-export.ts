/**
 * Connection BodyGraph — MÜHÜRLÜ V9 GEOMETRİSİNİ DIŞA AKTARIR (owner GÖRSEL PASS, 2026-10-18).
 *
 * Güzergâh hesabı V9 taslak betiğinin (bg-drafts/v9.ts) AYNISIDIR; çıktı noktaları V9 SVG'si ile aynı biçimde
 * (2 ondalık) lib/human-design/relations/connectionBodygraphGeometry.ts dosyasına DONDURULUR. Uygulama bu dosyayı
 * hesaplamaz, yalnız okur. Geometri değişikliği owner onayı olmadan YAPILMAZ.
 *
 * Çalıştırma: npx tsx scripts/hd-relations/connection-bodygraph-export.ts
 */
import { writeFileSync } from "node:fs";
import { CHANNELS, GATE_CENTER } from "../../lib/human-design/engine/channels";
void GATE_CENTER;

type P = { x: number; y: number };

// ── Ölçek: referans piksel → çizim birimi ───────────────────────────────────
const X0 = 462, Y0 = 350, S = 0.6;
const T = (x: number, y: number): P => ({ x: 220 + (x - X0) * S, y: 22 + (y - Y0) * S });
const VIEW = { w: 440, h: 650 };

// ── Merkezler (referans ölçüsü; şekil dili Yaşam Sistemi) ───────────────────
type Center = { id: string; engine: string; points: P[]; label: string[]; labelAt: P };
const CENTERS: Center[] = [
  { id: "head", engine: "Head", points: [T(462, 350), T(527, 470), T(397, 470)], label: ["BAŞ"], labelAt: T(462, 438) },
  { id: "ajna", engine: "Ajna", points: [T(397, 510), T(527, 510), T(462, 632)], label: ["AJNA"], labelAt: T(462, 586) },
  { id: "throat", engine: "Throat", points: [T(408, 702), T(516, 702), T(516, 810), T(408, 810)], label: ["BOĞAZ"], labelAt: T(462, 760) },
  { id: "g", engine: "G", points: [T(462, 852), T(537, 927), T(462, 1002), T(387, 927)], label: ["G"], labelAt: T(462, 932) },
  { id: "heart", engine: "Heart", points: [T(590, 952), T(660, 1032), T(520, 1032)], label: ["KALP"], labelAt: T(590, 1052) },
  { id: "sacral", engine: "Sacral", points: [T(404, 1100), T(522, 1100), T(522, 1218), T(404, 1218)], label: ["SAKRAL"], labelAt: T(462, 1165) },
  { id: "root", engine: "Root", points: [T(408, 1258), T(516, 1258), T(516, 1366), T(408, 1366)], label: ["KÖK"], labelAt: T(462, 1318) },
  { id: "spleen", engine: "Spleen", points: [T(182, 1066), T(308, 1136), T(182, 1206)], label: ["DALAK"], labelAt: T(214, 1140) },
  { id: "solar", engine: "SolarPlexus", points: [T(742, 1066), T(616, 1136), T(742, 1206)], label: ["SOLAR", "PLEKSUS"], labelAt: T(710, 1137) },
];

// ── Kapılar (referanstan ölçülen konumlar) ──────────────────────────────────
const RAW: Record<number, [number, number]> = {
  64: [435, 458], 61: [462, 458], 63: [489, 458],
  47: [435, 524], 24: [462, 524], 4: [489, 524], 17: [435, 552], 11: [489, 552], 43: [462, 600],
  62: [435, 716], 23: [462, 716], 56: [489, 716], 16: [420, 736], 20: [420, 768], 35: [504, 732], 12: [504, 756], 45: [504, 780],
  31: [435, 796], 8: [462, 796], 33: [489, 796],
  1: [462, 876], 7: [436, 903], 13: [488, 903], 10: [403, 927], 25: [521, 927], 15: [436, 952], 46: [488, 952], 2: [462, 980],
  21: [590, 978], 51: [570, 1000], 26: [550, 1020], 40: [630, 1020],
  5: [435, 1114], 14: [462, 1114], 29: [489, 1114], 34: [418, 1140], 27: [418, 1184], 59: [507, 1184], 42: [435, 1204], 3: [462, 1204], 9: [489, 1204],
  53: [435, 1272], 60: [462, 1272], 52: [489, 1272], 54: [422, 1300], 38: [422, 1326], 58: [422, 1352], 19: [502, 1300], 39: [502, 1326], 41: [502, 1352],
  48: [196, 1084], 57: [224, 1100], 44: [252, 1116], 50: [280, 1132], 32: [252, 1156], 28: [224, 1172], 18: [196, 1188],
  36: [728, 1084], 22: [700, 1100], 37: [672, 1116], 6: [644, 1132], 49: [672, 1156], 55: [700, 1172], 30: [728, 1188],
};
const GP: Record<number, P> = Object.fromEntries(Object.entries(RAW).map(([g, [x, y]]) => [g, T(x, y)]));
const R = 6.2, W = 7, EDGE = 1.4;

// ── Güzergâhlar (referanstan ölçülen ara noktalar) ──────────────────────────
const CH = CHANNELS.map((c) => ({ id: c.id, a: Math.min(c.gateA, c.gateB), b: Math.max(c.gateA, c.gateB) }));
const ROUTE: Record<string, P[]> = {};
for (const c of CH) ROUTE[c.id] = [GP[c.a], GP[c.b]]; // eksen üçlüleri + kısa kanallar: düz

// ── v8: TEK PARÇA KÜBİK EĞRİLER (ölçüm gürültüsü yok) ─────────────────────
// Her yay: uçlar = kapılar; çıkış ve varış YÖNÜ aile içinde ortak → iç içe yaylar aynı biçimi paylaşır (paralel akış).
// Kontrol kolu uzunluğu kiriş uzunluğunun sabit oranı (k). Entegrasyon ağında birleşme/ayrılma noktalarında teğet sürekli.
function cubic(a: P, c1: P, c2: P, b: P, n = 96): P[] { const o: P[] = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y }); } return o; }
const nrm = (x: number, y: number): P => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
/** a'dan da yönünde çıkıp b'ye db yönünde (hareket yönü) varan tek kübik. */
function tc(a: P, da: P, b: P, db: P, k = 0.55): P[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  return cubic(a, { x: a.x + da.x * k * L, y: a.y + da.y * k * L }, { x: b.x - db.x * k * L, y: b.y - db.y * k * L }, b);
}

/** Kontrol noktası verilen ikinci derece eğri (büküm içeremez). */
function quad(a: P, c: P, b: P, n = 80): P[] { const o: P[] = []; for (let i = 0; i <= n; i++) { const u = i / n, w = 1 - u; o.push({ x: w * w * a.x + 2 * w * u * c.x + u * u * b.x, y: w * w * a.y + 2 * w * u * c.y + u * u * b.y }); } return o; }
const LEFT = nrm(-1, 0.04), RIGHT = nrm(1, 0.04);
// Dış üst yaylar (Boğaz yanından yatay çıkış → Dalak / Solar tepesine aşağı varış)
ROUTE["16-48"] = tc(GP[16], LEFT, GP[48], nrm(-0.12, 1), 0.52);
ROUTE["35-36"] = tc(GP[35], RIGHT, GP[36], nrm(0.12, 1), 0.52);
ROUTE["12-22"] = tc(GP[12], RIGHT, GP[22], nrm(0.12, 1), 0.52);
ROUTE["21-45"] = quad(GP[45], { x: GP[21].x, y: GP[45].y }, GP[21]);
// Dış alt yaylar (Dalak / Solar altından aşağı çıkış → Kök yanına yatay varış)
// Dalak / Solar alt kenarına DİK çıkış (aşağı-içe): kenar yönü (126,-70) → normal (0.49, 0.87)
const DOWN_L = nrm(0.42, 1), DOWN_R = nrm(-0.42, 1);
ROUTE["32-54"] = tc(GP[32], DOWN_L, GP[54], nrm(1, -0.05), 0.46);
ROUTE["28-38"] = tc(GP[28], DOWN_L, GP[38], nrm(1, -0.05), 0.46);
ROUTE["18-58"] = tc(GP[18], DOWN_L, GP[58], nrm(1, -0.05), 0.46);
ROUTE["19-49"] = tc(GP[49], DOWN_R, GP[19], nrm(-1, -0.05), 0.46);
ROUTE["39-55"] = tc(GP[55], DOWN_R, GP[39], nrm(-1, -0.05), 0.46);
ROUTE["30-41"] = tc(GP[30], DOWN_R, GP[41], nrm(-1, -0.05), 0.46);
// İç bağlantılar
ROUTE["40-37"] = tc(GP[40], nrm(0.22, 1), GP[37], nrm(0.45, 0.9), 0.4);
ROUTE["6-59"] = [GP[59], GP[6]];
ROUTE["27-50"] = [GP[27], GP[50]];
ROUTE["25-51"] = [GP[25], GP[51]];
ROUTE["26-44"] = tc(GP[26], nrm(-1, 0.02), GP[44], nrm(-0.62, 0.78), 0.5);
// Entegrasyon ağı: kol20 ve kol10 M'de gövde yönüyle teğet birleşir; J'den kol57 aynı yönde sürer, kol34 sağa kıvrılır
// 20 yayı: 20'den J düğümüne TEK sürekli yay (16-48 ile aynı aileden, paralel). M bu yayın üzerindedir;
// 10 borusu yaya M'de yayın kendi teğetiyle katılır. J'de yayın bitiş yönü korunarak 57 ve 34 dalları çıkar.
const J = T(250, 1010);
const A20 = tc(GP[20], LEFT, J, nrm(-0.22, 1), 0.5);
// M: 20 yayı üzerinde 10 numaralı kapının hizasının biraz altındaki ilk nokta → 10 borusu tek yönde kıvrılarak katılır (S yok)
const mIdx = (() => { for (let i = 2; i < A20.length - 2; i++) if (A20[i].y >= GP[10].y + 36) return i; return A20.length - 3; })();
const M = A20[mIdx];
const tanAt = (i: number) => nrm(A20[i + 1].x - A20[i - 1].x, A20[i + 1].y - A20[i - 1].y);
const TM = tanAt(mIdx), TJ = tanAt(A20.length - 2);
const ARM: Record<string, P[]> = {
  kol20: A20.slice(0, mIdx + 1),
  // kontrol noktası: M'deki teğetin geriye uzantısı üzerinde, 10 ile aynı yükseklikte → 10'dan yatay çıkış, M'de teğet varış
  kol10: quad(GP[10], { x: M.x - TM.x * ((M.y - GP[10].y) / TM.y), y: GP[10].y }, M),
  govde: A20.slice(mIdx),
  kol57: (() => { const d = (GP[57].x - J.x) * TJ.x + (GP[57].y - J.y) * TJ.y; return quad(J, { x: J.x + TJ.x * d * 0.5, y: J.y + TJ.y * d * 0.5 }, GP[57]); })(),
  kol34: (() => { const b = GP[34], L = Math.hypot(b.x - J.x, b.y - J.y), e = nrm(1, 0.08); return cubic(J, { x: J.x + TJ.x * 0.28 * L, y: J.y + TJ.y * 0.28 * L }, { x: b.x - e.x * 0.5 * L, y: b.y - e.y * 0.5 * L }, b); })(),
};
const rev = (p: P[]) => [...p].reverse();
const join = (...parts: P[][]) => parts.reduce<P[]>((acc, part) => { for (const q of part) { const l = acc.at(-1); if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 1e-6) acc.push(q); } return acc; }, []);
ROUTE["20-57"] = join(ARM.kol20, ARM.govde, ARM.kol57);
ROUTE["10-57"] = join(ARM.kol10, ARM.govde, ARM.kol57);
ROUTE["20-34"] = join(ARM.kol20, ARM.govde, ARM.kol34);
ROUTE["10-34"] = join(ARM.kol10, ARM.govde, ARM.kol34);
ROUTE["34-57"] = join(rev(ARM.kol34), ARM.kol57);
ROUTE["10-20"] = join(ARM.kol10, rev(ARM.kol20));
for (const c of CH) { const p = ROUTE[c.id]; if (Math.hypot(p[0].x - GP[c.a].x, p[0].y - GP[c.a].y) > 0.01) ROUTE[c.id] = [...p].reverse(); }
const INTEGRATION = new Set(["10-20", "10-34", "20-34", "10-57", "20-57", "34-57"]);

// ── Dışa aktarım ─────────────────────────────────────────────────────────────
const f2 = (n: number) => n.toFixed(2);
const pts = (p: P[]) => p.map((q) => `${f2(q.x)},${f2(q.y)}`).join(" ");
const lines: string[] = [];
lines.push("// OTOMATİK ÜRETİLDİ — elle düzenleme YOK. Kaynak: scripts/hd-relations/connection-bodygraph-export.ts");
lines.push("// Connection BodyGraph — MÜHÜRLÜ V9 kanal geometrisi (owner GÖRSEL PASS 2026-10-18). Koordinatlar V9 SVG'si ile aynı.");
lines.push("// Topoloji (kapı→merkez, 36 kanal) engine/channels'tan doğrulanır: scripts/hd-relations/connection-bodygraph-test.ts");
lines.push("");
lines.push(`export const CBG_FRONT = { w: ${VIEW.w}, h: ${VIEW.h} } as const;`);
lines.push(`export const CBG_GATE_R = ${R};`);
lines.push(`export const CBG_PIPE_W = ${W};`);
lines.push(`export const CBG_PIPE_EDGE = ${EDGE};`);
lines.push("");
lines.push("export type CbgCenter = { engine: string; points: string; label: readonly string[]; labelAt: readonly [number, number] };");
lines.push("export const CBG_CENTERS: readonly CbgCenter[] = [");
for (const c of CENTERS) lines.push(`  { engine: "${c.engine}", points: "${c.points.map((p) => `${f2(p.x)},${f2(p.y)}`).join(" ")}", label: ${JSON.stringify(c.label)}, labelAt: [${f2(c.labelAt.x)}, ${f2(c.labelAt.y)}] },`);
lines.push("];");
lines.push("");
lines.push("/** 64 kapı merkezi (V9 sırası). */");
lines.push("export const CBG_GATES: ReadonlyArray<readonly [number, number, number]> = [");
for (const [g, p] of Object.entries(GP)) lines.push(`  [${g}, ${f2(p.x)}, ${f2(p.y)}],`);
lines.push("];");
lines.push("");
lines.push("/** Tek parça kanal boruları (entegrasyon ağı dışındaki 30 kanal): küçük kapı → büyük kapı yönünde. Sıra = V9 çizim sırası. */");
lines.push("export const CBG_PIPES: ReadonlyArray<readonly [string, string]> = [");
lines.push(`  ["26-44", "${pts(ROUTE["26-44"])}"],`);
for (const c of CH) if (!INTEGRATION.has(c.id) && c.id !== "26-44") lines.push(`  ["${c.id}", "${pts(ROUTE[c.id])}"],`);
lines.push("];");
lines.push("");
lines.push("/** Entegrasyon ağı parçaları (10 · 20 · 34 · 57): M ve J düğümlerinde teğet birleşir. Sıra = V9 çizim sırası. */");
lines.push("export const CBG_NET_ARMS: ReadonlyArray<readonly [\"kol20\" | \"kol10\" | \"govde\" | \"kol57\" | \"kol34\", string]> = [");
for (const k of ["kol20", "kol10", "govde", "kol57", "kol34"]) lines.push(`  ["${k}", "${pts(ARM[k])}"],`);
lines.push("];");
lines.push("");
lines.push("/** Ağ kanalları = parçaların birleşimi (V9 ile aynı). */");
lines.push("export const CBG_NET_CHANNELS: Readonly<Record<string, readonly string[]>> = {");
lines.push(`  "10-20": ["kol10", "kol20"],
  "10-34": ["kol10", "govde", "kol34"],
  "10-57": ["kol10", "govde", "kol57"],
  "20-34": ["kol20", "govde", "kol34"],
  "20-57": ["kol20", "govde", "kol57"],
  "34-57": ["kol34", "kol57"],`);
lines.push("};");
lines.push("export const CBG_NET_ARM_OF_GATE: Readonly<Record<number, string>> = { 10: \"kol10\", 20: \"kol20\", 34: \"kol34\", 57: \"kol57\" };");
writeFileSync(process.argv[2] ?? "lib/human-design/relations/connectionBodygraphGeometry.ts", lines.join("\n") + "\n");
console.log("ok", CH.length, Object.keys(GP).length, CENTERS.length);
