/**
 * KİŞİSEL DİJİTAL OFİS (P4) — uzman logosu güvenli bölge yerleşimi testleri (saf; DOM / ağ YOK).
 * Çalıştır: npx tsx scripts/workspace/logoPlacement.test.ts
 */
import {
  LOGO_MIN_LONG_SIDE, PLATE_PAD, freeInner, freePlacementFromBox, inflate, isFreeBoxValid, isHistoryHead, minBoxWidth,
  modeForWidth, moveBox, nudgeFreeBox, nudgePlacement, placementFromBox, pushHistory, resizeBox, resolveLogo, solveFreeLogo,
  solveLogo, zoneRect, type Rect,
} from "../../lib/workspace/logoPlacement";
import type { LogoPlacement } from "../../lib/workspace/schema";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, z: Rect) => a.x >= z.x - 1e-6 && a.y >= z.y - 1e-6 && a.x + a.w <= z.x + z.w + 1e-6 && a.y + a.h <= z.y + z.h + 1e-6;
const asRect = (b: { left: number; top: number; width: number; height: number }): Rect => ({ x: b.left, y: b.top, w: b.width, h: b.height });
const P = (zone: LogoPlacement["zone"], x: number, y: number, w: number): LogoPlacement => ({ zone, x, y, w });

// ── Mod ayrımı ──
ok(modeForWidth(640) === "mobile" && modeForWidth(320) === "mobile" && modeForWidth(641) === "desktop" && modeForWidth(1440) === "desktop", "≤640 mobil, >640 masaüstü");

// ── Boş bölgede istenen konum ──
const hero = zoneRect(1100, 300, 18); // {18,18,1064,264}
const wide = 1417 / 350;
{
  const r = solveLogo({ placement: P("hero", 1, 0.5, 0.3), aspect: wide, pad: 0, zone: hero, obstacles: [] });
  ok(r.fit && !r.moved && !r.shrunk, "engelsiz bölgede istenen konum", r);
  if (r.fit) {
    ok(Math.abs(r.width - 0.3 * hero.w) < 1e-6, "genişlik = w × bölge genişliği");
    ok(Math.abs(r.width / r.height - wide) < 1e-6, "oran korunur (esneme yok)");
    ok(Math.abs(r.left + r.width - (hero.x + hero.w)) < 1e-6, "x=1 → sağ kenara yaslı");
    ok(Math.abs(r.top + r.height / 2 - (hero.y + hero.h / 2)) < 1e-6, "y=0.5 → dikey ortalı");
    ok(inside(asRect(r), hero), "bölge içinde");
  }
}

// ── Engel (karşılama metni) asla örtülmez ──
{
  const text = inflate({ x: 40, y: 60, w: 760, h: 160 });
  const r = solveLogo({ placement: P("hero", 0, 0.5, 0.3), aspect: wide, pad: 0, zone: hero, obstacles: [text] });
  ok(r.fit && r.moved, "metnin üstüne istenen logo en yakın boş yere kaçar", r);
  if (r.fit) ok(!overlaps(asRect(r), text) && inside(asRect(r), hero), "kaçan logo metni örtmez ve bölgede kalır");
}
// Tarama: birçok konum / boyut / engel kombinasyonunda örtüşme yok
{
  let bad = 0;
  let total = 0;
  for (const w of [0.1, 0.3, 0.6, 1]) for (const x of [0, 0.25, 0.5, 0.75, 1]) for (const y of [0, 0.5, 1]) for (const aspect of [wide, 1, 0.45]) for (const plate of ["yok", "cam", "beyaz"] as const) {
    const obs = [inflate({ x: 30, y: 40, w: 500 + 100 * x, h: 150 })];
    const r = solveLogo({ placement: P("hero", x, y, w), aspect, pad: PLATE_PAD[plate], zone: hero, obstacles: obs });
    total++;
    if (r.fit && (obs.some((o) => overlaps(asRect(r), o)) || !inside(asRect(r), hero))) bad++;
  }
  ok(bad === 0, `${total} kombinasyonda hiçbir çözüm engeli örtmez / bölgeden taşmaz`, bad);
}

// ── Küçültme ve en küçük boyut ──
{
  // Metin bölgenin çoğunu kaplıyor: büyük logo sığmaz → küçülür
  const zb = zoneRect(600, 200, 18);
  const text = inflate({ x: 18, y: 18, w: 420, h: 164 });
  const r = solveLogo({ placement: P("hero", 1, 0.5, 0.9), aspect: wide, pad: 0, zone: zb, obstacles: [text] });
  ok(r.fit && r.shrunk, "sığmayan logo oran korunarak küçültülür", r);
  if (r.fit) {
    ok(!overlaps(asRect(r), text), "küçültülen logo metni örtmez");
    ok(Math.max(r.width, r.height) >= LOGO_MIN_LONG_SIDE - 1e-6, "uzun kenar ≥ 36 px");
  }
}
{
  // Bölge en küçük boyuttan bile küçük → sığmaz (başka bölgeye taşınmaz)
  const tiny = zoneRect(30, 30, 3);
  const r = solveLogo({ placement: P("toolbar", 0, 0.5, 1), aspect: 1, pad: 0, zone: tiny, obstacles: [] });
  ok(!r.fit && r.reason === "zone-too-small", "bölge 36 px'ten küçük → sığmaz", r);
}
{
  // Dikey logo: uzun kenar yükseklik; 46 px'lik şeritte (iç 40) sığar, uzun kenar ≥ 36
  const strip = zoneRect(300, 46, 3);
  const tall = 0.5;
  const r = solveLogo({ placement: P("toolbar", 0, 0.5, 1), aspect: tall, pad: 0, zone: strip, obstacles: [] });
  ok(r.fit, "dikey logo dar şeritte sığar", r);
  if (r.fit) ok(r.height >= LOGO_MIN_LONG_SIDE - 1e-6 && r.height <= strip.h + 1e-6 && Math.abs(r.width / r.height - tall) < 1e-6, "dikey logo: uzun kenar ≥ 36, şerit yüksekliğini aşmaz, oran korunur", r);
  const r2 = solveLogo({ placement: P("toolbar", 0, 0.5, 1), aspect: tall, pad: 9, zone: zoneRect(300, 40, 3), obstacles: [] });
  ok(!r2.fit, "plaketle dikey logo 34 px iç yükseklikte sığmaz (36 px kuralı)", r2);
}
{
  ok(Math.abs(minBoxWidth(4, 0) - 36) < 1e-9 && Math.abs(minBoxWidth(0.5, 0) - 18) < 1e-9 && Math.abs(minBoxWidth(1, 8) - 52) < 1e-9, "en küçük kutu genişliği: uzun kenar 36 + plaket");
  // w çok küçük istense de 36 px altına inilmez
  const r = solveLogo({ placement: P("hero", 0.5, 0.5, 0.01), aspect: 1, pad: 0, zone: hero, obstacles: [] });
  ok(r.fit && r.width >= 36 - 1e-6 && r.height >= 36 - 1e-6, "çok küçük w → 36 px'e yükseltilir", r);
}
{
  // Bölgenin tamamı engel → sığmaz
  const zb = zoneRect(400, 200, 18);
  const r = solveLogo({ placement: P("hero", 0.5, 0.5, 0.5), aspect: 1, pad: 0, zone: zb, obstacles: [inflate({ x: 0, y: 0, w: 400, h: 200 })] });
  ok(!r.fit && r.reason === "no-free-space", "tamamen dolu bölge → sığmaz", r);
}
{
  const r = solveLogo({ placement: P("hero", 0.5, 0.5, 0.5), aspect: NaN, pad: 0, zone: hero, obstacles: [] });
  ok(!r.fit && r.reason === "invalid", "geçersiz oran → güvenli ret");
  const r2 = solveLogo({ placement: P("hero", 0.5, 0.5, 0.5), aspect: 0, pad: 0, zone: hero, obstacles: [] });
  ok(!r2.fit, "sıfır oran → güvenli ret");
}
{
  // En büyük genişlik: 560 px ve bölge yüksekliği sınırı
  const big = zoneRect(2000, 1000, 0);
  const r = solveLogo({ placement: P("footer", 0.5, 0.5, 1), aspect: 1, pad: 0, zone: big, obstacles: [] });
  ok(r.fit && r.width <= 560 + 1e-6, "genişlik ≤ 560 px", r);
  const low = zoneRect(800, 60, 0);
  const r2 = solveLogo({ placement: P("sec", 1, 0.5, 1), aspect: 1, pad: 0, zone: low, obstacles: [] });
  ok(r2.fit && r2.height <= 60 + 1e-6, "kare logo bölge yüksekliğini aşmaz", r2);
}

// ── Son geçerli konum: sistem bölge SEÇMEZ; yalnız uzmanın daha önce sığmış yerleşimi korunur ──
{
  const heroG = { zone: zoneRect(360, 200, 18), obstacles: [inflate({ x: 18, y: 18, w: 324, h: 150 })] }; // metin neredeyse tüm bölge
  const footG = { zone: zoneRect(900, 132, 14), obstacles: [] };
  const toolG = { zone: zoneRect(240, 46, 3), obstacles: [] };
  const geo = (z: LogoPlacement["zone"]) => (z === "hero" ? heroG : z === "footer" ? footG : z === "toolbar" ? toolG : null);
  const want = P("hero", 1, 0.5, 0.3);
  const lastGood = P("footer", 0.5, 0.5, 0.3);
  const res = resolveLogo({ placement: want, aspect: 1, pad: 0, geometry: geo, history: [lastGood] });
  ok(res.status === "kept" && res.used === lastGood, "istenen bölge sığmayınca son geçerli konum korunur (kept)", res);
  if (res.status !== "nofit") ok(inside(asRect(res.box), footG.zone), "korunan konum kendi bölgesinin içinde");
  const none = resolveLogo({ placement: want, aspect: 1, pad: 0, geometry: geo, history: [] });
  ok(none.status === "nofit", "son geçerli konum yoksa → nofit; toolbar/footer boş olsa da OTOMATİK taşıma YOK", none);
  const missing = resolveLogo({ placement: P("sec", 1, 0.5, 1), aspect: 1, pad: 0, geometry: geo, history: [] });
  ok(missing.status === "nofit" && missing.reason === "zone-missing", "bölge ekranda yoksa → nofit (zone-missing)", missing);
  const fine = resolveLogo({ placement: lastGood, aspect: 1, pad: 0, geometry: geo, history: [want] });
  ok(fine.status === "ok" && fine.used === lastGood, "sığan yerleşim → ok (geçmişe bakılmaz)", fine);
  const stale = resolveLogo({ placement: want, aspect: 1, pad: 0, geometry: geo, history: [P("sec", 1, 0.5, 1), P("hero", 0, 0, 0.5)] });
  ok(stale.status === "nofit", "geçmişteki kayıtlar da sığmıyorsa → nofit", stale);
}
{
  let h: LogoPlacement[] = [];
  for (let i = 0; i < 9; i++) h = pushHistory(h, P("hero", i / 10, 0.5, 0.3));
  ok(h.length === 6 && h[0].x === 0.8, "geçmiş en çok 6, en yeni başta", h.length);
  h = pushHistory(h, P("hero", 0.5, 0.5, 0.3));
  ok(h[0].x === 0.5 && h.filter((p) => p.x === 0.5).length === 1, "tekrar eden yerleşim başa taşınır, çoğalmaz");
  ok(isHistoryHead(h, P("hero", 0.5, 0.5, 0.3)) && !isHistoryHead([], P("hero", 0, 0, 1)), "isHistoryHead");
}

// ── Masaüstü / mobil ayrı ──
{
  const layout = { desktop: P("hero", 1, 0.5, 0.26), mobile: P("toolbar", 0.5, 0.5, 1) };
  const nextMobile = nudgePlacement(layout.mobile, "ArrowLeft", false)!;
  const updated = { ...layout, mobile: nextMobile };
  ok(updated.desktop === layout.desktop && updated.mobile.x < layout.mobile.x, "mobil düzenleme masaüstü yerleşimini değiştirmez");
  const dRes = solveLogo({ placement: updated.desktop, aspect: wide, pad: 0, zone: hero, obstacles: [] });
  const mRes = solveLogo({ placement: updated.mobile, aspect: wide, pad: 0, zone: zoneRect(220, 46, 3), obstacles: [] });
  ok(dRes.fit && mRes.fit && (dRes.fit && mRes.fit ? dRes.width !== mRes.width : false), "iki mod kendi bölgesinde ayrı çözülür");
}

// ── Klavye ──
{
  const p = P("sec", 0.5, 0.5, 0.5);
  ok(nudgePlacement(p, "ArrowRight", false)!.x === 0.53 && nudgePlacement(p, "ArrowUp", true)!.y === 0.4, "ok tuşları (Shift büyük adım)");
  ok(nudgePlacement(P("sec", 1, 0, 1), "ArrowRight", false)!.x === 1 && nudgePlacement(P("sec", 1, 0, 1), "ArrowUp", false)!.y === 0, "kenarda sınır aşılmaz");
  ok(nudgePlacement(p, "+", false)!.w === 0.53 && nudgePlacement(P("sec", 0, 0, 0.05), "-", false)!.w === 0.04, "+ / − boyut, en az 0,04");
  ok(nudgePlacement(p, "a", false) === null && nudgePlacement(p, "ArrowLeft", false)!.zone === "sec", "bilinmeyen tuş → null; bölge değişmez");
}

// ── Sürükle / boyutlandır dönüşümleri ──
{
  const zb = zoneRect(1000, 300, 18);
  const box = { x: 500, y: 100, w: 200, h: 50 };
  const p = placementFromBox("hero", box, zb, 4, 0);
  ok(p.zone === "hero" && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, "kutu → oransal yerleşim (0–1)", p);
  const back = solveLogo({ placement: p, aspect: 4, pad: 0, zone: zb, obstacles: [] });
  ok(back.fit && Math.abs(back.left - 500) < 1 && Math.abs(back.top - 100) < 1 && Math.abs(back.width - 200) < 1, "yerleşim → kutu gidiş-dönüş tutarlı", back);
  const moved = moveBox(box, 5000, -5000, zb);
  ok(inside(moved, zb), "sürükleme bölge dışına çıkmaz", moved);
  const grown = resizeBox(box, "se", 5000, 5000, zb, 4, 0);
  ok(inside(grown, zb) && Math.abs(grown.w / grown.h - 4) < 1e-6 && grown.x === box.x && grown.y === box.y, "SE boyutlandırma: oran korunur, sol üst sabit, bölgede kalır", grown);
  const shrunk = resizeBox(box, "nw", 5000, 5000, zb, 4, 0);
  ok(Math.max(shrunk.w, shrunk.h) >= 36 - 1e-6 && Math.abs(shrunk.x + shrunk.w - (box.x + box.w)) < 1e-6, "NW küçültme: en az 36 px, sağ alt sabit", shrunk);
  const wTiny = placementFromBox("hero", { x: 18, y: 18, w: 1, h: 1 }, zb, 1, 0);
  ok(wTiny.w >= 0.04, "w şema alt sınırına kısılır");
}

// ── KDO-05 Serbest Yerleştir (page / side) ──
{
  const frame = { w: 1166, h: 1400 };
  const inner = freeInner(frame.w, frame.h);
  const heroText = inflate({ x: 40, y: 80, w: 420, h: 200 }, 6);
  const tools = inflate({ x: 860, y: 0, w: 300, h: 46 }, 6);
  const cards = [0, 1, 2].map((i) => inflate({ x: i * 280, y: 380, w: 268, h: 250 }, 6));
  const obs = [heroText, tools, ...cards];
  const wide = 4;

  // Boş noktaya bırakma → aynen
  const p = { zone: "page" as const, x: 0.6, y: 120, w: 0.15 };
  const r = solveFreeLogo({ placement: p, aspect: wide, pad: 0, frame, obstacles: obs });
  ok(r.fit && !r.moved && Math.round(r.top) === 120, "boş noktaya bırakılan logo aynen kalır", r);

  // Kutu → yerleşim → kutu gidiş-dönüş (yenileme / yeniden girişte aynı nokta)
  if (r.fit) {
    const back = freePlacementFromBox("page", asRect(r), frame);
    const r2 = solveFreeLogo({ placement: back, aspect: wide, pad: 0, frame, obstacles: obs });
    ok(r2.fit && Math.abs(r2.left - r.left) < 1.5 && Math.abs(r2.top - r.top) < 1 && Math.abs(r2.width - r.width) < 1.5, "kaydet → yeniden çiz: aynı konum ve boyut (±1 px)", { r, r2, back });
  }

  // Engelin üstüne bırakma: doğrulama reddeder; çizim çözücüsü en yakın boş noktaya alır
  const onText: Rect = { x: 100, y: 120, w: 160, h: 40 };
  ok(!isFreeBoxValid(onText, inner, obs), "karşılama metninin üstüne bırakma GEÇERSİZ");
  ok(!isFreeBoxValid({ x: 900, y: 4, w: 120, h: 30 }, inner, obs), "araç düğmelerinin üstüne bırakma GEÇERSİZ");
  ok(!isFreeBoxValid({ x: 300, y: 400, w: 100, h: 25 }, inner, obs), "modül kartının üstüne bırakma GEÇERSİZ");
  ok(!isFreeBoxValid({ x: 1100, y: 700, w: 120, h: 30 }, inner, obs), "çerçeve dışına taşan kutu GEÇERSİZ (yatay kaydırma yok)");
  ok(!isFreeBoxValid({ x: -4, y: 700, w: 120, h: 30 }, inner, obs), "sol kenardan taşan kutu GEÇERSİZ");
  ok(isFreeBoxValid({ x: 520, y: 120, w: 160, h: 40 }, inner, obs), "boş alan GEÇERLİ");
  const moved = solveFreeLogo({ placement: freePlacementFromBox("page", onText, frame), aspect: wide, pad: 0, frame, obstacles: obs });
  ok(moved.fit && moved.moved && obs.every((o) => !overlaps(asRect(moved), o)) && inside(asRect(moved), inner), "içerik değişip konum geçersizleşirse en yakın boş noktaya kaydırılır", moved);

  // Özellik testi: rastgele engeller + rastgele yerleşimler → ya sığmaz ya da çerçeve içinde ve engelsiz
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let safe = true;
  let fits = 0;
  for (let i = 0; i < 400; i++) {
    const fw = 300 + rnd() * 1300;
    const fh = 200 + rnd() * 1600;
    const os: Rect[] = Array.from({ length: Math.floor(rnd() * 14) }, () => inflate({ x: rnd() * fw, y: rnd() * fh, w: 20 + rnd() * 400, h: 20 + rnd() * 300 }, 6));
    const pl = { zone: (rnd() < 0.5 ? "page" : "side") as "page" | "side", x: rnd(), y: Math.round(rnd() * fh), w: 0.04 + rnd() * 0.9 };
    const asp = 0.3 + rnd() * 6;
    const pad = [0, 8, 9][Math.floor(rnd() * 3)];
    const res = solveFreeLogo({ placement: pl, aspect: asp, pad, frame: { w: fw, h: fh }, obstacles: os });
    if (!res.fit) continue;
    fits++;
    const b = asRect(res);
    const inn = freeInner(fw, fh);
    if (!inside(b, inn) || os.some((o) => overlaps(b, o)) || b.w < minBoxWidth(asp, pad) - 0.01) safe = false;
  }
  ok(safe && fits > 150, `400 rastgele senaryo: çizilen her logo çerçeve içinde, engelsiz, en küçük boyutun üstünde (${fits} sığdı)`);

  // Sığmıyorsa küçülür; yine sığmıyorsa gösterilmez (sistem başka çerçeve SEÇMEZ)
  const full = [inflate({ x: 0, y: 0, w: frame.w, h: frame.h }, 0)];
  const none = solveFreeLogo({ placement: p, aspect: wide, pad: 0, frame, obstacles: full });
  ok(!none.fit && none.reason === "no-free-space", "boş alan yoksa → çizilmez (no-free-space)", none);
  const narrow = solveFreeLogo({ placement: { zone: "side", x: 0.5, y: 10, w: 1 }, aspect: wide, pad: 0, frame: { w: 228, h: 300 }, obstacles: [inflate({ x: 22, y: 230, w: 150, h: 60 }, 6)] });
  ok(narrow.fit && narrow.width <= 228 - 16 && narrow.top + narrow.height <= 230 - 6, "sol menü alt alanı: alıntıyı örtmeden, alan içinde", narrow);
  const tiny = solveFreeLogo({ placement: { zone: "side", x: 0.5, y: 0, w: 1 }, aspect: 1, pad: 0, frame: { w: 40, h: 40 }, obstacles: [] });
  ok(!tiny.fit && tiny.reason === "zone-too-small", "36 px'ten dar çerçeve (daraltılmış menü) → sığmaz");
  ok(!solveFreeLogo({ placement: p, aspect: NaN, pad: 0, frame, obstacles: [] }).fit, "geçersiz oran → sığmaz");

  // Klavye / panel düğmeleri
  const box0: Rect = { x: 500, y: 120, w: 160, h: 40 };
  const right = nudgeFreeBox(box0, "ArrowRight", false, wide, 0)!;
  const big = nudgeFreeBox(box0, "ArrowDown", true, wide, 0)!;
  ok(right.x === 508 && right.y === 120 && big.y === 160, "oklar 8 px, Shift ile 40 px", { right, big });
  const grown = nudgeFreeBox(box0, "+", false, wide, 0)!;
  const shrunk = nudgeFreeBox(box0, "-", false, wide, 0)!;
  ok(grown.w > box0.w && shrunk.w < box0.w && Math.abs(grown.w / grown.h - wide) < 0.01, "+ / − oranı koruyarak büyütür / küçültür", { grown, shrunk });
  ok(nudgeFreeBox(box0, "a", false, wide, 0) === null, "bilinmeyen tuş → null");
  const minB = nudgeFreeBox({ x: 0, y: 0, w: minBoxWidth(wide, 0), h: 9 }, "-", false, wide, 0)!;
  ok(minB.w >= minBoxWidth(wide, 0) - 1e-9, "küçültme izinli en küçük boyutun altına inmez");
  ok(freePlacementFromBox("side", { x: 8, y: 4.6, w: 2, h: 1 }, { w: 200, h: 300 }).w >= 0.04, "w şema alt sınırına kısılır; y tamsayı");
}

console.log(`\nworkspace logoPlacement test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
