/**
 * roxy-bodygraph-audit.ts çıktısını (JSON) analiz eder — SALT OKUMA.
 *   T1 Her çizgi öğesinin uçları → en yakın kapı(lar); arka plan (tam uzunluk) çizgileri resmî 36 kanal mı?
 *   T2 Aktif (renkli) parçalar: hangi kapıdan çıkıyor, yönü kanalın diğer kapısına mı bakıyor?
 *   T3 Kayıtlı tanımlı kanallar ↔ çizilen tam (iki yarısı renkli) kanallar birebir mi?
 *   T4 Kanal güzergâhlarının birbirine yakınlığı (karışabilecek çiftler) ve kesişmeler
 *   T5 Kapı yazı boyu / rozet aralığı
 * Çalıştır: npx tsx scripts/hd-bodygraph/roxy-bodygraph-analyze.ts <audit.json>
 */
import { readFileSync } from "node:fs";
import { CHANNELS } from "../../lib/human-design/engine/channels";

type P = { x: number; y: number };
const J = JSON.parse(readFileSync(process.argv[2], "utf8")) as { shapes: Array<{ tag: string; attrs: { class?: string }; start: P | null; end: P | null; len: number; parent: string }>; gatePos: Array<[number, { x: number; y: number; fs: number }]> };
const FIX = JSON.parse(readFileSync("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json", "utf8")) as { channels: Array<{ gateA: number; gateB: number }>; gates: Array<{ gate: number }> };
const gp = new Map(J.gatePos);
const nearest = (p: P) => [...gp.entries()].map(([g, q]) => ({ g, d: Math.hypot(p.x - q.x, p.y - q.y) })).sort((a, b) => a.d - b.d)[0];
const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const official = new Set(CHANNELS.map((c) => c.id));

const segs = J.shapes.filter((s) => s.start && s.end && s.len > 3);
const classes = new Map<string, number>();
for (const s of segs) classes.set(s.attrs.class ?? "(yok)", (classes.get(s.attrs.class ?? "(yok)") ?? 0) + 1);
console.log("Sınıf dağılımı:", JSON.stringify([...classes]));

// T1: iki ucu da kapıya ≤ 12px olan öğeler → kanal adayı
const full: Array<{ id: string; cls: string; a: number; b: number }> = [];
const halfs: Array<{ from: number; toward: string; cls: string; d: number }> = [];
for (const s of segs) {
  const na = nearest(s.start!), nb = nearest(s.end!);
  if (na.d <= 12 && nb.d <= 12 && na.g !== nb.g) full.push({ id: key(na.g, nb.g), cls: s.attrs.class ?? "", a: na.g, b: nb.g });
  else if (na.d <= 12 || nb.d <= 12) {
    const from = na.d <= nb.d ? na.g : nb.g;
    const tip = na.d <= nb.d ? s.end! : s.start!;
    const o = gp.get(from)!;
    // Kanal ortağı: uç noktanın yönündeki resmî kanal kapısı
    const cands = CHANNELS.filter((c) => c.gateA === from || c.gateB === from).map((c) => ({ id: c.id, other: c.gateA === from ? c.gateB : c.gateA }));
    const best = cands.map((c) => {
      const q = gp.get(c.other)!;
      const v1 = { x: tip.x - o.x, y: tip.y - o.y }, v2 = { x: q.x - o.x, y: q.y - o.y };
      const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
      return { id: c.id, cos };
    }).sort((a, b) => b.cos - a.cos)[0];
    halfs.push({ from, toward: best ? `${best.id}(cos ${best.cos.toFixed(3)})` : "?", cls: s.attrs.class ?? "", d: Math.min(na.d, nb.d) });
  }
}
const fullIds = [...new Set(full.map((f) => f.id))];
const nonOfficial = fullIds.filter((id) => !official.has(id));
console.log(`T1 iki ucu kapıda biten çizgi: ${full.length} (benzersiz kanal ${fullIds.length}); resmî olmayan çift: ${JSON.stringify(nonOfficial)}`);
console.log(`   eksik resmî kanal (arka planda yok): ${JSON.stringify([...official].filter((id) => !fullIds.includes(id)))}`);
console.log(`T2 tek ucu kapıda (renkli parça) öğe: ${halfs.length}`);
const lowCos = halfs.filter((h) => !/cos 0\.99|cos 1\.0/.test(h.toward));
console.log(`   yönü kendi kanalına ≥0.99 hizalı olmayan parça: ${lowCos.length} ${JSON.stringify(lowCos).slice(0, 600)}`);
const defined = FIX.channels.map((c) => key(c.gateA, c.gateB)).sort();
const halfByChannel = new Map<string, Set<number>>();
for (const h of halfs) { const id = h.toward.split("(")[0]; if (!halfByChannel.has(id)) halfByChannel.set(id, new Set()); halfByChannel.get(id)!.add(h.from); }
const drawnFull = [...halfByChannel.entries()].filter(([id, set]) => { const [a, b] = id.split("-").map(Number); return set.has(a) && set.has(b); }).map(([id]) => id).sort();
console.log(`T3 kayıtlı tanımlı kanallar: ${defined.join(" ")} · iki yarısı renkli çizilen: ${drawnFull.join(" ")} · birebir: ${defined.join() === drawnFull.join()}`);
const halfOnly = [...halfByChannel.entries()].filter(([id, set]) => { const [a, b] = id.split("-").map(Number); return !(set.has(a) && set.has(b)); }).map(([id, s]) => `${id}:${[...s].join("/")}`);
console.log(`   yalnız bir yarısı renkli (yarım kanal): ${halfOnly.join(" ")}`);

// T4: arka plan çizgileri arasında kesişme ve yakınlık
const seg = (id: string) => { const [a, b] = id.split("-").map(Number); return [gp.get(a)!, gp.get(b)!] as [P, P]; };
const inter = (a: P, b: P, c: P, d: P) => { const o = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
const crit = ["7-31", "1-8", "10-20", "13-33", "21-45"];
for (const id of crit) {
  const [a, b] = seg(id);
  const x = [...official].filter((o) => o !== id && (() => { const [c, d] = seg(o); return inter(a, b, c, d); })());
  console.log(`T4 ${id}: kesiştiği kanallar ${JSON.stringify(x)}`);
}
// 7-31 ↔ 1-8 ↔ 13-33 paralel aralık
const mid = (id: string) => { const [a, b] = seg(id); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
console.log(`T4 G↔Boğaz kanal orta noktaları arası (px, 432 genişlik): 7-31↔1-8 ${Math.hypot(mid("7-31").x - mid("1-8").x, mid("7-31").y - mid("1-8").y).toFixed(1)} · 1-8↔13-33 ${Math.hypot(mid("1-8").x - mid("13-33").x, mid("1-8").y - mid("13-33").y).toFixed(1)}`);
// T5
const fs = [...gp.values()].map((g) => g.fs);
let minD = Infinity, pair = "";
const arr = [...gp.entries()];
for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const d = Math.hypot(arr[i][1].x - arr[j][1].x, arr[i][1].y - arr[j][1].y); if (d < minD) { minD = d; pair = `${arr[i][0]}-${arr[j][0]}`; } }
console.log(`T5 kapı yazı boyu ${Math.min(...fs)}px (viewBox 432); en yakın iki kapı ${pair} ${minD.toFixed(1)}px`);
