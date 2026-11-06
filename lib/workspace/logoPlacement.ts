/**
 * KİŞİSEL DİJİTAL OFİS (P4) — uzman logosu güvenli bölge yerleşimi (saf; DOM / React YOK).
 *
 * P0 son kabul prototipi (kisisel-calisma-alani-p0-son-kabul/js/logoPlace.js → solve) ile birebir aynı kurallar:
 *  1) Logo yalnız bölge iç dikdörtgenine sığdırılır (oran korunur, esneme yok).
 *  2) Bölgedeki engellerden (ör. karşılama metni) kaçılır → en yakın boş konum.
 *  3) Sığmıyorsa oran korunarak küçültülür; izinli en küçük boyut: logonun UZUN kenarı 36 px.
 *  4) Yine sığmıyorsa BAŞKA BÖLGEYE OTOMATİK TAŞIMA YOK (owner Revizyon 2): bu ekran modunda uzmanın son geçerli
 *     konumu gösterilir; o da yoksa logo gösterilmez ve (yalnız düzenlemede) sarı uyarı çıkar.
 * Masaüstü (> 640 px) ve mobil (≤ 640 px) yerleşimleri ayrı saklanır ve ayrı çözülür.
 * Sol menü (Yaşam Sistemi logosu), kartlar, düğmeler, paneller bölge DEĞİLDİR; çözücü bölge dışına hiçbir koşulda çıkmaz.
 */
import type { LogoPlacement } from "./schema";

export type Rect = { x: number; y: number; w: number; h: number };
export type PlacementMode = "desktop" | "mobile";
export type LogoBox = { left: number; top: number; width: number; height: number };

/** İzinli en küçük boyut: logo görselinin uzun kenarı (px). */
export const LOGO_MIN_LONG_SIDE = 36;
export const LOGO_MAX_WIDTH = 560;
/** Engel çevresinde bırakılan boşluk (px). */
export const OBSTACLE_GAP = 10;
/** Plaket iç boşluğu (px) — CSS ile aynı. */
export const PLATE_PAD: Record<"yok" | "cam" | "beyaz", number> = { yok: 0, cam: 8, beyaz: 9 };
/** Bölge iç boşlukları (px) — prototipteki data-pad değerleri. */
export const ZONE_PAD: Record<LogoPlacement["zone"], number> = { hero: 18, cerceve: 12, toolbar: 3, sec: 3, rightTop: 12, footer: 14, page: 0, side: 0 };
export const MOBILE_MAX_WIDTH = 640;
export const HISTORY_MAX = 6;

export const modeForWidth = (w: number): PlacementMode => (w <= MOBILE_MAX_WIDTH ? "mobile" : "desktop");

export type SolveInput = {
  placement: LogoPlacement;
  /** Logo görselinin doğal genişlik / yükseklik oranı (> 0). */
  aspect: number;
  /** Plaket iç boşluğu (px). */
  pad: number;
  /** Bölgenin serbest iç dikdörtgeni (bölge-yerel px). */
  zone: Rect;
  /** Bölge-yerel engeller (boşluk payı EKLENMİŞ olarak). */
  obstacles: readonly Rect[];
};
export type SolveResult =
  | ({ fit: true; shrunk: boolean; moved: boolean } & LogoBox)
  | { fit: false; reason: "invalid" | "zone-too-small" | "no-free-space" };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
const finite = (n: number) => typeof n === "number" && Number.isFinite(n);
const sizeFor = (W: number, aspect: number, pad: number) => (W - 2 * pad) / aspect + 2 * pad;
/** Görselin (plaket hariç) uzun kenarı en az LOGO_MIN_LONG_SIDE olacak en küçük kutu genişliği. */
export const minBoxWidth = (aspect: number, pad: number) => LOGO_MIN_LONG_SIDE * Math.min(1, aspect) + 2 * pad;
export const boxHeightFor = sizeFor;

/** Engel dikdörtgenini boşluk payıyla büyütür. */
export function inflate(r: Rect, gap = OBSTACLE_GAP): Rect {
  return { x: r.x - gap, y: r.y - gap, w: r.w + 2 * gap, h: r.h + 2 * gap };
}

/** Bölge kutusu (bölge-yerel) — iç boşluk düşülür. */
export function zoneRect(width: number, height: number, pad: number): Rect {
  return { x: pad, y: pad, w: Math.max(0, width - 2 * pad), h: Math.max(0, height - 2 * pad) };
}

/** Saf çözümleyici: bölge kutusu + engeller + oransal konum → piksel kutu (bölge-yerel). Bölge DEĞİŞTİRMEZ. */
export function solveLogo(input: SolveInput): SolveResult {
  const { placement: L, aspect, pad, zone: zb, obstacles: obs } = input;
  if (!finite(aspect) || aspect <= 0 || !finite(pad) || pad < 0 || ![zb.x, zb.y, zb.w, zb.h, L.x, L.y, L.w].every(finite)) {
    return { fit: false, reason: "invalid" };
  }
  const minW = minBoxWidth(aspect, pad);
  const maxW = Math.min(LOGO_MAX_WIDTH, zb.w, (zb.h - 2 * pad) * aspect + 2 * pad);
  if (maxW < minW) return { fit: false, reason: "zone-too-small" };
  const lx = Math.min(1, Math.max(0, L.x));
  const ly = Math.min(1, Math.max(0, L.y));
  let W = Math.max(minW, Math.min(maxW, L.w * zb.w));
  for (let tries = 0; tries < 12; tries++) {
    const H = sizeFor(W, aspect, pad);
    const want: Rect = { x: zb.x + lx * (zb.w - W), y: zb.y + ly * (zb.h - H), w: W, h: H };
    const clamp = (c: Rect): Rect => ({
      ...c,
      x: Math.min(zb.x + zb.w - W, Math.max(zb.x, c.x)),
      y: Math.min(zb.y + zb.h - H, Math.max(zb.y, c.y)),
    });
    const free = (c: Rect) => obs.every((o) => !overlaps(c, o));
    const out = (c: Rect, moved: boolean): SolveResult => ({ fit: true, left: c.x, top: c.y, width: c.w, height: c.h, shrunk: tries > 0, moved });
    if (free(want)) return out(want, false);
    const cands: Rect[] = [];
    for (const o of obs) {
      cands.push(clamp({ ...want, x: o.x - W }), clamp({ ...want, x: o.x + o.w }), clamp({ ...want, y: o.y - H }), clamp({ ...want, y: o.y + o.h }));
    }
    // Bölge içi ızgara taraması: engel çevresinde yer yoksa bölgedeki diğer boş noktalar da denenir.
    const fx = zb.w - W;
    const fy = zb.h - H;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) cands.push({ ...want, x: zb.x + (fx * i) / 8, y: zb.y + (fy * j) / 6 });
    const ok = cands
      .filter(free)
      .sort((a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y));
    if (ok.length) return out(ok[0], true);
    W *= 0.86;
    if (W < minW) {
      // Son deneme tam izinli en küçük boyutta.
      if (W / 0.86 > minW + 0.01) { W = minW; continue; }
      break;
    }
  }
  return { fit: false, reason: "no-free-space" };
}

export type ResolveStatus = "ok" | "kept" | "nofit";
export type ZoneGeometry = { zone: Rect; obstacles: readonly Rect[] };
export type ResolveResult =
  | { status: "ok" | "kept"; box: LogoBox & { shrunk: boolean; moved: boolean }; used: LogoPlacement }
  | { status: "nofit"; reason: "invalid" | "zone-too-small" | "no-free-space" | "zone-missing" };

const samePlacement = (a: LogoPlacement, b: LogoPlacement) => a.zone === b.zone && a.x === b.x && a.y === b.y && a.w === b.w;

/**
 * İstenen yerleşimi KENDİ bölgesinde çözer (bölge değiştirilmez). Sığmazsa, bu ekran modunda daha önce GERÇEKTEN sığmış
 * yerleşimler (uzmanın son geçerli konumları; en yeniden eskiye) denenir → "kept" (prototip placeLogo ile aynı).
 * Hiçbiri sığmazsa "nofit": logo gösterilmez, düzenlemede uyarı çıkar. Sistem kendiliğinden yeni bölge SEÇMEZ.
 * `geometry(zone)` → o bölgenin ölçülmüş kutusu + engelleri; bölge ekranda yoksa null.
 */
export function resolveLogo(input: {
  placement: LogoPlacement;
  history?: readonly LogoPlacement[];
  aspect: number;
  pad: number;
  geometry: (zone: LogoPlacement["zone"]) => ZoneGeometry | null | undefined;
}): ResolveResult {
  const tryOne = (p: LogoPlacement): SolveResult | null => {
    const g = input.geometry(p.zone);
    if (!g) return null;
    return solveLogo({ placement: p, aspect: input.aspect, pad: input.pad, zone: g.zone, obstacles: g.obstacles });
  };
  const first = tryOne(input.placement);
  if (first?.fit) return { status: "ok", box: pickBox(first), used: input.placement };
  for (const h of input.history ?? []) {
    if (samePlacement(h, input.placement)) continue;
    const r = tryOne(h);
    if (r?.fit) return { status: "kept", box: pickBox(r), used: h };
  }
  return { status: "nofit", reason: first ? (first as Extract<SolveResult, { fit: false }>).reason : "zone-missing" };
}

function pickBox(r: Extract<SolveResult, { fit: true }>) {
  return { left: r.left, top: r.top, width: r.width, height: r.height, shrunk: r.shrunk, moved: r.moved };
}

/** Son geçerli yerleşimler listesine ekler (en yeni başta, tekrarsız, en çok HISTORY_MAX). Yeni dizi döner. */
export function pushHistory(history: readonly LogoPlacement[], p: LogoPlacement): LogoPlacement[] {
  const rest = history.filter((h) => !samePlacement(h, p));
  return [{ ...p }, ...rest].slice(0, HISTORY_MAX);
}
export const isHistoryHead = (history: readonly LogoPlacement[], p: LogoPlacement) => history.length > 0 && samePlacement(history[0], p);

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Sürükleme / boyutlandırma sonucu (bölge-yerel piksel kutu) → saklanacak oransal yerleşim (prototip end() ile aynı).
 * Bölge değişmez; w şema sınırına (0,04–1) kısılır.
 */
export function placementFromBox(zone: LogoPlacement["zone"], box: Rect, zb: Rect, aspect: number, pad: number): LogoPlacement {
  const W = Math.min(box.w, zb.w);
  const H = sizeFor(W, aspect, pad);
  const fx = zb.w - W > 0.5 ? (box.x - zb.x) / (zb.w - W) : 0.5;
  const fy = zb.h - H > 0.5 ? (box.y - zb.y) / (zb.h - H) : 0.5;
  const c01 = (v: number) => r3(Math.min(1, Math.max(0, v)));
  return { zone, x: c01(fx), y: c01(fy), w: r3(Math.min(1, Math.max(0.04, zb.w > 0 ? W / zb.w : 1))) };
}

/** Klavye: ok tuşları konum (Shift ile büyük adım), + / − boyut. Bilinmeyen tuş → null. */
export function nudgePlacement(p: LogoPlacement, key: string, shift: boolean): LogoPlacement | null {
  const step = shift ? 0.1 : 0.03;
  const n = { ...p };
  if (key === "ArrowLeft") n.x = Math.max(0, p.x - step);
  else if (key === "ArrowRight") n.x = Math.min(1, p.x + step);
  else if (key === "ArrowUp") n.y = Math.max(0, p.y - step);
  else if (key === "ArrowDown") n.y = Math.min(1, p.y + step);
  else if (key === "+" || key === "=") n.w = Math.min(1, p.w + 0.03);
  else if (key === "-" || key === "_") n.w = Math.max(0.04, p.w - 0.03);
  else return null;
  return { zone: p.zone, x: r3(n.x), y: r3(n.y), w: r3(n.w) };
}

/** Köşe tutamacıyla boyutlandırma: karşı köşe sabit, oran korunur, bölge sınırları içinde. */
export function resizeBox(start: Rect, handle: "nw" | "ne" | "sw" | "se", dx: number, dy: number, zb: Rect, aspect: number, pad: number): Rect {
  const maxByZone = Math.min(LOGO_MAX_WIDTH, zb.w, (zb.h - 2 * pad) * aspect + 2 * pad);
  const minW = minBoxWidth(aspect, pad);
  const sx = handle.includes("e") ? 1 : -1;
  const sy = handle.includes("s") ? 1 : -1;
  // Sabit kalan köşeye göre kalan alan
  const anchorX = sx > 0 ? start.x : start.x + start.w;
  const anchorY = sy > 0 ? start.y : start.y + start.h;
  const roomW = sx > 0 ? zb.x + zb.w - anchorX : anchorX - zb.x;
  const roomH = sy > 0 ? zb.y + zb.h - anchorY : anchorY - zb.y;
  const maxW = Math.max(minW, Math.min(maxByZone, roomW, (roomH - 2 * pad) * aspect + 2 * pad));
  let nw = start.w + Math.max(sx * dx, sy * dy * aspect);
  nw = Math.max(minW, Math.min(maxW, nw));
  const nh = sizeFor(nw, aspect, pad);
  return { x: sx > 0 ? anchorX : anchorX - nw, y: sy > 0 ? anchorY : anchorY - nh, w: nw, h: nh };
}

/** Sürükleme: kutuyu bölge içinde tutar. */
export function moveBox(start: Rect, dx: number, dy: number, zb: Rect): Rect {
  return {
    ...start,
    x: Math.min(zb.x + zb.w - start.w, Math.max(zb.x, start.x + dx)),
    y: Math.min(zb.y + zb.h - start.h, Math.max(zb.y, start.y + dy)),
  };
}

/* ══ KDO-05 — Serbest Yerleştir (page / side çerçeveleri) ══════════════════════════════════════════════════════════
 * Uzman logoyu çerçevenin (ana sayfa içerik alanı ya da sol menünün alt boş alanı) içinde GEÇERLİ herhangi bir noktaya
 * bırakır. Geçerli = çerçeve sınırları içinde (FREE_EDGE boşlukla) VE korunan öğelerle (Yaşam Sistemi logosu / adı,
 * karşılama metni, düğmeler, bağlantılar, başlıklar, modül kartları, sağ sütun panelleri) kesişmeyen kutu.
 *  - Sürükle-bırak / klavye / panel düğmeleri: bırakılan kutu GEÇERSİZSE kabul edilmez → son geçerli konum korunur.
 *  - Çizim: kayıtlı konum içerik değişince (ör. yeni favori şeridi) geçersizleşirse en yakın boş noktaya kaydırılır;
 *    yoksa küçültülür (uzun kenar ≥ 36 px); yine yoksa bu ekranda gösterilmez (sistem başka çerçeve SEÇMEZ).
 * Birimler: x = yatay serbest aralığın oranı (0–1; genişlik değişse de aynı kenara göre durur), y = çerçeve üstünden px
 * (içerik yüksekliği değişse de aynı noktada kalır), w = çerçeve genişliğine oran.
 */
export const FREE_EDGE = 8;
/** Bırakma noktası çevresinde aranan en uzak mesafe (px) — "kaydırma" uzmanın bıraktığı yerden fazla uzaklaşmasın. */
export const FREE_SEARCH_RADIUS = 360;
const FREE_STEP = 12;

/** Çerçevenin kullanılabilir iç dikdörtgeni (çerçeve-yerel). */
export function freeInner(frameW: number, frameH: number): Rect {
  return { x: FREE_EDGE, y: FREE_EDGE, w: Math.max(0, frameW - 2 * FREE_EDGE), h: Math.max(0, frameH - 2 * FREE_EDGE) };
}

const insideRect = (c: Rect, zb: Rect) => c.x >= zb.x - 0.5 && c.y >= zb.y - 0.5 && c.x + c.w <= zb.x + zb.w + 0.5 && c.y + c.h <= zb.y + zb.h + 0.5;

/** Kutu çerçeve içinde ve engellerden uzak mı? (sürükle-bırak doğrulaması; arama YAPMAZ) */
export function isFreeBoxValid(box: Rect, inner: Rect, obstacles: readonly Rect[]): boolean {
  if (![box.x, box.y, box.w, box.h].every(finite) || box.w <= 0 || box.h <= 0) return false;
  return insideRect(box, inner) && obstacles.every((o) => !overlaps(box, o));
}

/** Oransal / piksel yerleşim → çerçeve-yerel istenen kutu (genişlik sınırlara kısılır). */
export function freeDesiredBox(p: LogoPlacement, inner: Rect, aspect: number, pad: number): Rect | null {
  if (!finite(aspect) || aspect <= 0 || ![p.x, p.y, p.w, inner.w, inner.h].every(finite)) return null;
  const minW = minBoxWidth(aspect, pad);
  const maxW = Math.min(LOGO_MAX_WIDTH, inner.w, (inner.h - 2 * pad) * aspect + 2 * pad);
  if (maxW < minW) return null;
  const W = Math.max(minW, Math.min(maxW, p.w * (inner.w + 2 * FREE_EDGE)));
  const H = sizeFor(W, aspect, pad);
  const x = inner.x + Math.min(1, Math.max(0, p.x)) * Math.max(0, inner.w - W);
  const y = Math.min(inner.y + inner.h - H, Math.max(inner.y, p.y));
  return { x, y, w: W, h: H };
}

/**
 * Çizim çözücüsü: istenen kutu geçerliyse aynen; değilse bırakma noktasına EN YAKIN geçerli kutu (önce engel kenarları,
 * sonra FREE_SEARCH_RADIUS içinde halka taraması); yoksa küçültüp yeniden dener. Çerçeve dışına hiçbir koşulda çıkmaz.
 */
export function solveFreeLogo(input: { placement: LogoPlacement; aspect: number; pad: number; frame: { w: number; h: number }; obstacles: readonly Rect[] }): SolveResult {
  const inner = freeInner(input.frame.w, input.frame.h);
  const want0 = freeDesiredBox(input.placement, inner, input.aspect, input.pad);
  if (!want0) return { fit: false, reason: !finite(input.aspect) || input.aspect <= 0 ? "invalid" : "zone-too-small" };
  const minW = minBoxWidth(input.aspect, input.pad);
  const obs = input.obstacles;
  let W = want0.w;
  for (let tries = 0; tries < 12; tries++) {
    const H = sizeFor(W, input.aspect, input.pad);
    // Küçültmede kutu bırakılan noktanın merkezinde kalır.
    const cx = want0.x + want0.w / 2;
    const cy = want0.y + want0.h / 2;
    const want: Rect = {
      x: Math.min(inner.x + inner.w - W, Math.max(inner.x, tries ? cx - W / 2 : want0.x)),
      y: Math.min(inner.y + inner.h - H, Math.max(inner.y, tries ? cy - H / 2 : want0.y)),
      w: W, h: H,
    };
    const out = (c: Rect, moved: boolean): SolveResult => ({ fit: true, left: c.x, top: c.y, width: c.w, height: c.h, shrunk: tries > 0, moved });
    if (isFreeBoxValid(want, inner, obs)) return out(want, false);
    const clamp = (c: Rect): Rect => ({ ...c, x: Math.min(inner.x + inner.w - W, Math.max(inner.x, c.x)), y: Math.min(inner.y + inner.h - H, Math.max(inner.y, c.y)) });
    const cands: Rect[] = [];
    for (const o of obs) {
      if (Math.abs(o.x + o.w / 2 - (want.x + W / 2)) > FREE_SEARCH_RADIUS + o.w || Math.abs(o.y + o.h / 2 - (want.y + H / 2)) > FREE_SEARCH_RADIUS + o.h) continue;
      cands.push(clamp({ ...want, x: o.x - W }), clamp({ ...want, x: o.x + o.w }), clamp({ ...want, y: o.y - H }), clamp({ ...want, y: o.y + o.h }));
    }
    for (let r = FREE_STEP; r <= FREE_SEARCH_RADIUS; r += FREE_STEP) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / (FREE_STEP * 2)));
      for (let k = 0; k < n; k++) {
        const a = (2 * Math.PI * k) / n;
        cands.push(clamp({ ...want, x: want.x + r * Math.cos(a), y: want.y + r * Math.sin(a) }));
      }
    }
    let best: Rect | null = null;
    let bestD = Infinity;
    for (const c of cands) {
      const dd = Math.hypot(c.x - want.x, c.y - want.y);
      if (dd <= FREE_SEARCH_RADIUS + 0.5 && dd < bestD && isFreeBoxValid(c, inner, obs)) { best = c; bestD = dd; }
    }
    if (best) return out(best, true);
    const next = W * 0.86;
    if (next < minW) {
      if (W > minW + 0.01) { W = minW; continue; }
      break;
    }
    W = next;
  }
  return { fit: false, reason: "no-free-space" };
}

const rpx = (v: number) => Math.round(v);

/** Bırakılan kutu (çerçeve-yerel) → saklanacak serbest yerleşim. */
export function freePlacementFromBox(zone: "page" | "side", box: Rect, frame: { w: number; h: number }): LogoPlacement {
  const inner = freeInner(frame.w, frame.h);
  const room = inner.w - box.w;
  const fx = room > 0.5 ? (box.x - inner.x) / room : 0.5;
  return { zone, x: r3(Math.min(1, Math.max(0, fx))), y: Math.max(0, rpx(box.y)), w: r3(Math.min(1, Math.max(0.04, frame.w > 0 ? box.w / frame.w : 1))) };
}

/** Klavye / panel düğmeleri: kutuyu px adımla taşır (Shift ile büyük adım) ya da büyütür / küçültür. Bilinmeyen tuş → null. */
export function nudgeFreeBox(box: Rect, key: string, shift: boolean, aspect: number, pad: number): Rect | null {
  const step = shift ? 40 : 8;
  if (key === "ArrowLeft") return { ...box, x: box.x - step };
  if (key === "ArrowRight") return { ...box, x: box.x + step };
  if (key === "ArrowUp") return { ...box, y: box.y - step };
  if (key === "ArrowDown") return { ...box, y: box.y + step };
  if (key === "+" || key === "=" || key === "-" || key === "_") {
    const grow = key === "+" || key === "=";
    const W = Math.max(minBoxWidth(aspect, pad), Math.min(LOGO_MAX_WIDTH, box.w * (grow ? 1.08 : 1 / 1.08)));
    const H = sizeFor(W, aspect, pad);
    return { x: box.x + (box.w - W) / 2, y: box.y + (box.h - H) / 2, w: W, h: H };
  }
  return null;
}
