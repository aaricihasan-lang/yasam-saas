// Premium BodyGraph V3 — aura silüeti (TAMAMEN skeleton.silhouette'ten türer; literal koordinat YOK).
//
// deriveAura(skeleton) → kapalı SVG path (sağ gövde aşağı → taban → sol gövde+YÜZ PROFİLİ yukarı).
// Her nokta = axisX ± knob veya knob.y. Pürüzsüzleştirme: kapalı Catmull-Rom → cubic bézier.

import { buildSkeleton, type Skeleton } from "../skeleton/skeleton";
import type { PointV3 } from "../skeleton/proportions";

const f = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

/** Kapalı Catmull-Rom → cubic bézier path. Kontrol noktaları komşu teğetlerden (tension) türer. */
function catmullRomClosed(pts: PointV3[], tension: number): string {
  const n = pts.length;
  if (n < 3) return "";
  const k = (1 - tension) / 6; // teğet ölçeği
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d + " Z";
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function deriveAura(sk: Skeleton = buildSkeleton()): string {
  const A = sk.axisX;
  const s = sk.silhouette;

  // Baş TEPESİ: elips arkı (headHalfW × hRad) üzerinden çok-noktalı örnekleme → TAM YUVARLAK,
  // hiçbir noktada sivrilik yok. headHalfW/headCenterY/crownY knob'larından türer.
  const hRad = s.headCenterY - s.crownY; // baş dikey yarıçapı
  const headTop = (deg: number): PointV3 => {
    const r = (deg * Math.PI) / 180; // 0°=sağ (rHead), 90°=crown, 180°=sol (lHead)
    return { x: A + s.headHalfW * Math.cos(r), y: s.headCenterY - hRad * Math.sin(r) };
  };

  // OMUZ geçiş noktaları (organik deltoid → dik çıkıntı/kırılma yok). neck/shoulder/waist lerp'i.
  const rTrap: PointV3 = { x: A + lerp(s.neck.halfW, s.shoulder.halfW, 0.5), y: lerp(s.neck.y, s.shoulder.y, 0.45) };
  const lTrap: PointV3 = { x: A - lerp(s.neck.halfW, s.shoulder.halfW, 0.5), y: lerp(s.neck.y, s.shoulder.y, 0.45) };
  const rUnder: PointV3 = { x: A + lerp(s.shoulder.halfW, s.waist.halfW, 0.35), y: lerp(s.shoulder.y, s.waist.y, 0.3) };
  const lUnder: PointV3 = { x: A - lerp(s.shoulder.halfW, s.waist.halfW, 0.35), y: lerp(s.shoulder.y, s.waist.y, 0.3) };

  const anchors: PointV3[] = [
    // ── baş tepesi: yuvarlak elips arkı (crown → sağ) ──
    headTop(90), // crown (tepe)
    headTop(58),
    headTop(28),
    headTop(0), // rHead (en sağ)
    // ── sağ aşağı (yüz YOK) ──
    { x: A + s.neck.halfW, y: s.neck.y },
    rTrap, // omuz slope başı
    { x: A + s.shoulder.halfW, y: s.shoulder.y },
    rUnder, // koltuk altı (yumuşak iniş)
    { x: A + s.waist.halfW, y: s.waist.y },
    { x: A + s.hip.halfW, y: s.hip.y },
    { x: A + s.footHalfW, y: s.taperY },
    { x: A, y: s.bottomY },
    // ── sol aşağı → yukarı + omuz ──
    { x: A - s.footHalfW, y: s.taperY },
    { x: A - s.hip.halfW, y: s.hip.y },
    { x: A - s.waist.halfW, y: s.waist.y },
    lUnder,
    { x: A - s.shoulder.halfW, y: s.shoulder.y },
    lTrap,
    { x: A - s.neck.halfW, y: s.neck.y },
    // ── YÜZ PROFİLİ (çene → dudak → burun → alın) ──
    { x: A - s.chin.project, y: s.chin.y },
    { x: A - s.lip.project, y: s.lip.y },
    { x: A - s.nose.project, y: s.nose.y },
    { x: A - s.brow.project, y: s.brow.y },
    // ── sol baş elips arkı (lHead → crown'a kapanır, yuvarlak) ──
    headTop(180), // lHead (en sol)
    headTop(152),
    headTop(122),
  ];
  return catmullRomClosed(anchors, s.tension);
}
