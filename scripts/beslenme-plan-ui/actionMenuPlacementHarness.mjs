// ============================================================
// Beslenme plan editörü ⋮ aksiyon menüsü — VIEWPORT yerleşim harness'i (SAF, DOM-siz).
//
// AMAÇ: computeActionMenuPlacement'ın menüyü hiçbir kenardan taşırmadan, altta yer yoksa
//   yukarı "flip" ederek, dar ekran / mobil / uzun menü / yüksek zoom'da tüm seçenekleri
//   erişilebilir (gerekirse iç scroll) tuttuğunu kanıtlar. Gerçek masaüstü hatasının
//   (alt satır menüsü ekran dışına kayması) regresyon kilidi.
//
// Çalıştır:  node scripts/beslenme-plan-ui/actionMenuPlacementHarness.mjs
// FAIL → exit 1.
// ============================================================
import {
  computeActionMenuPlacement,
  ACTION_MENU_WIDTH,
  ACTION_MENU_MARGIN,
} from "../../app/beslenme/planlar/_components/actionMenuPlacement.ts";

const M = ACTION_MENU_MARGIN;
const W = ACTION_MENU_WIDTH;
const EPS = 0.5;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Yerleşimden menünün kapladığı dikey [topEdge, bottomEdge] kutusunu (maxHeight ile en kötü hâl) üret.
function box(p, vp) {
  if (p.placement === "down") {
    return { topEdge: p.top, bottomEdge: p.top + p.maxHeight, leftEdge: p.left, rightEdge: p.left + W };
  }
  const bottomEdge = vp.height - p.bottom;
  return { topEdge: bottomEdge - p.maxHeight, bottomEdge, leftEdge: p.left, rightEdge: p.left + W };
}

// Menü viewport'a sığıyor mu? (dikey kenarlar M payı içinde; sol kenar ≥ M).
function withinViewport(p, vp) {
  const b = box(p, vp);
  const vertOk = b.topEdge >= M - EPS && b.bottomEdge <= vp.height - M + EPS;
  const leftOk = p.left >= M - EPS;
  const rightOk = vp.width < W + 2 * M ? true : b.rightEdge <= vp.width - M + EPS; // çok dar viewport istisnası
  return { ok: vertOk && leftOk && rightOk, b, vertOk, leftOk, rightOk };
}

// ── 1) Masaüstü: üst satır → aşağı açılır, taşmaz ────────────────────────────
console.log("── Masaüstü 1440×900 ──");
{
  const vp = { width: 1440, height: 900 };
  const p = computeActionMenuPlacement({ top: 100, bottom: 120, right: 1200 }, vp, 5);
  const w = withinViewport(p, vp);
  check("üst satır → aşağı açılır", p.placement === "down");
  check("üst satır → viewport içinde (taşma yok)", w.ok, JSON.stringify({ p, b: w.b }));
  check("yatay: menü sağ kenarı tetik sağına hizalı", Math.abs(p.left + W - 1200) < EPS, String(p.left));
}

// ── 2) Masaüstü: ALT satır → yukarı flip, taşmaz (GERÇEK HATA senaryosu) ──────
{
  const vp = { width: 1440, height: 900 };
  const p = computeActionMenuPlacement({ top: 840, bottom: 860, right: 1200 }, vp, 5);
  const w = withinViewport(p, vp);
  check("alt satır → yukarı flip", p.placement === "up");
  check("alt satır → viewport içinde (menü ekran dışına KAYMAZ)", w.ok, JSON.stringify({ p, b: w.b }));
  check("alt satır → tüm menü görünür (maxHeight ≥ tahmini içerik)", p.maxHeight >= 5 * 38, String(p.maxHeight));
}

// ── 3) Sınır: altta tam yeterli yer → aşağı; bir tık eksik + üstte yer → yukarı ─
{
  const vp = { width: 1440, height: 900 };
  const est = 5 * 38 + 8; // 198
  const justFits = computeActionMenuPlacement({ top: 900 - M - est - 20, bottom: 900 - M - est, right: 1200 }, vp, 5);
  check("altta tam yeterli yer → aşağı", justFits.placement === "down", String(justFits.maxHeight));
  const justShort = computeActionMenuPlacement({ top: 760, bottom: 900 - M - (est - 40), right: 1200 }, vp, 5);
  check("altta bir tık eksik + üstte bol yer → yukarı", justShort.placement === "up");
}

// ── 4) Dar masaüstü penceresi → yatay kelepçe, taşmaz ────────────────────────
console.log("── Dar masaüstü 420×760 ──");
{
  const vp = { width: 420, height: 760 };
  const top = computeActionMenuPlacement({ top: 90, bottom: 110, right: 410 }, vp, 5);
  const bottom = computeActionMenuPlacement({ top: 700, bottom: 720, right: 410 }, vp, 5);
  check("dar: üst satır viewport içinde", withinViewport(top, vp).ok, JSON.stringify(top));
  check("dar: alt satır yukarı flip + viewport içinde", bottom.placement === "up" && withinViewport(bottom, vp).ok, JSON.stringify(bottom));
  check("dar: sol kenar ≥ MARGIN", top.left >= M - EPS && bottom.left >= M - EPS, `${top.left}/${bottom.left}`);
}

// ── 5) Mobil görünüm → dikey+yatay güvenli ───────────────────────────────────
console.log("── Mobil 360×640 ──");
{
  const vp = { width: 360, height: 640 };
  const top = computeActionMenuPlacement({ top: 70, bottom: 90, right: 344 }, vp, 5);
  const bottom = computeActionMenuPlacement({ top: 560, bottom: 580, right: 344 }, vp, 5);
  check("mobil: üst satır → aşağı + içeride", top.placement === "down" && withinViewport(top, vp).ok, JSON.stringify(top));
  check("mobil: alt satır → yukarı + içeride", bottom.placement === "up" && withinViewport(bottom, vp).ok, JSON.stringify(bottom));
}

// ── 6) Uzun menü (çok öğe) → sığmazsa iç scroll; kenardan taşmaz ──────────────
console.log("── Uzun menü / kısa viewport ──");
{
  const vp = { width: 1440, height: 400 };
  const topLong = computeActionMenuPlacement({ top: 50, bottom: 70, right: 1200 }, vp, 20);
  const w1 = withinViewport(topLong, vp);
  check("uzun menü üst: aşağı + viewport içinde (iç scroll)", topLong.placement === "down" && w1.ok, JSON.stringify(topLong));
  check("uzun menü: maxHeight > 0 (seçenekler scroll ile erişilebilir)", topLong.maxHeight > 0, String(topLong.maxHeight));

  const vp2 = { width: 1440, height: 300 };
  const midLong = computeActionMenuPlacement({ top: 150, bottom: 170, right: 1200 }, vp2, 20);
  const w2 = withinViewport(midLong, vp2);
  check("uzun menü orta/kısa: viewport içinde (taşma yok)", w2.ok, JSON.stringify({ midLong, b: w2.b }));
  check("uzun menü: maxHeight ≥ 0 (asla negatif)", midLong.maxHeight >= 0, String(midLong.maxHeight));
}

// ── 7) Aşırı dar viewport (< menü genişliği) → sol kenar MARGIN'e kelepçelenir ─
{
  const vp = { width: 180, height: 500 };
  const p = computeActionMenuPlacement({ top: 100, bottom: 120, right: 170 }, vp, 5);
  check("aşırı dar: left MARGIN'e kelepçeli (best-effort)", p.left === M, String(p.left));
}

// ── 8) Invariant taraması: pek çok tetik konumunda menü DAİMA viewport içinde ──
console.log("── Invariant taraması (200+ konum) ──");
{
  let allOk = true;
  let firstBad = null;
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 420, height: 760 },
    { width: 360, height: 640 },
    { width: 1280, height: 320 }, // yüksek zoom / kısa
  ];
  for (const vp of viewports) {
    for (const items of [1, 3, 5, 8, 20]) {
      for (let top = 0; top <= vp.height - 20; top += 20) {
        const p = computeActionMenuPlacement({ top, bottom: top + 20, right: Math.min(vp.width - 10, 1200) }, vp, items);
        const w = withinViewport(p, vp);
        if (!w.ok || p.maxHeight < 0) {
          allOk = false;
          firstBad = { vp, items, top, p, w };
          break;
        }
      }
      if (!allOk) break;
    }
    if (!allOk) break;
  }
  check("invariant: tüm konum/viewport/öğe-sayısı → menü viewport içinde & maxHeight≥0", allOk, JSON.stringify(firstBad));
}

console.log("");
console.log(`SONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:", failures.join(", ")); process.exit(1); }
console.log("✅ ActionMenu viewport yerleşimi — TÜM TESTLER PASS (flip, kelepçe, iç-scroll, taşma-yok)");
