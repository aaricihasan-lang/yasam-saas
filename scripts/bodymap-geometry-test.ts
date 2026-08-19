/**
 * GENERIC BODY-MAP MOTORU — geometri birim testleri (saf fn; DB/React yok).
 *
 * Çalıştırma:  npx tsx scripts/bodymap-geometry-test.ts
 *
 * Refleksolojiden kopyalanan alan-bağımsız geometri çekirdeğinin (contain-rect,
 * normalize, box-from-drag, resize/rotate/move transform) doğruluğunu kanıtlar.
 * Refleksolojiye DOKUNMAZ (yalnız lib/bodymap import eder).
 */
import { computeObjectContainRect } from "../lib/bodymap/geometry/containRect";
import { pointerToImageNormalized } from "../lib/bodymap/geometry/normalizePointer";
import {
  boxFromDrag,
  clamp01,
  DEFAULT_POINT_RX,
  markToPercentBox,
} from "../lib/bodymap/geometry/markGeometry";
import {
  moveMarkByDelta,
  resizeMarkByHandle,
  rotateMarkByPointer,
} from "../lib/bodymap/geometry/markTransform";
import type { BodyMark } from "../lib/bodymap/types";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function mark(over: Partial<BodyMark> = {}): BodyMark {
  return { id: "m1", label: "x", mapKey: "back_body", shape: "oval", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, angle: 0, ...over };
}

function run(): void {
  // ── clamp01 ────────────────────────────────────────────────────────────────
  ok(clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.3) === 0.3, "clamp01 sınırlar");

  // ── computeObjectContainRect ─────────────────────────────────────────────────
  {
    // 1000x400 konteyner, 480x800 içerik (portre) → yükseklik sınırlı, yatay letterbox.
    const r = computeObjectContainRect(1000, 400, 480, 800);
    const scale = 400 / 800; // 0.5
    ok(near(r.height, 400) && near(r.width, 480 * scale), "contain: portre içerik yükseklik-sınırlı");
    ok(near(r.left, (1000 - 480 * scale) / 2) && near(r.top, 0), "contain: yatay ortalanır (letterbox)");
  }
  {
    // dejenere giriş → güvenli
    const r = computeObjectContainRect(0, 0, 480, 800);
    ok(r.width === 0 && r.height === 0, "contain: sıfır konteyner güvenli");
  }

  // ── pointerToImageNormalized ─────────────────────────────────────────────────
  {
    const containerRect = { left: 0, top: 0, width: 200, height: 200 } as DOMRect;
    const imageRect = { left: 0, top: 0, width: 200, height: 200 };
    const center = pointerToImageNormalized(100, 100, containerRect, imageRect);
    ok(!!center && near(center.x, 0.5) && near(center.y, 0.5), "normalize: merkez → 0.5,0.5");
    const outside = pointerToImageNormalized(-10, 100, containerRect, imageRect);
    ok(outside === null, "normalize: alan dışı (clamp yok) → null");
    const clamped = pointerToImageNormalized(-10, 100, containerRect, imageRect, { clamp: true });
    ok(!!clamped && clamped.x === 0, "normalize: clamp → 0..1'e sıkışır");
    // letterbox offset hesaba katılır
    const off = pointerToImageNormalized(60, 10, containerRect, { left: 50, top: 0, width: 100, height: 200 });
    ok(!!off && near(off.x, 0.1), "normalize: imageRect ofseti dikkate alınır");
  }

  // ── boxFromDrag ──────────────────────────────────────────────────────────────
  {
    const tiny = boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.501 }, "oval");
    ok(tiny.rx === DEFAULT_POINT_RX && near(tiny.cx, 0.502), "boxFromDrag: küçük sürükleme → varsayılan nokta");
    const big = boxFromDrag({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 }, "rect");
    ok(big.shape === "rect" && near(big.cx, 0.4) && near(big.rx, 0.2) && near(big.ry, 0.1), "boxFromDrag: büyük sürükleme → kutu");
  }

  // ── markToPercentBox ─────────────────────────────────────────────────────────
  {
    const box = markToPercentBox(mark({ cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2, angle: 30 }));
    ok(box.left === "40%" && box.width === "20%" && box.height === "40%", "percentBox: sol/genişlik/yükseklik");
    ok(box.transform === "rotate(30deg)", "percentBox: açı transform");
    ok(markToPercentBox(mark({ angle: 0 })).transform === undefined, "percentBox: açı 0 → transform yok");
  }

  // ── resizeMarkByHandle ───────────────────────────────────────────────────────
  {
    const base = mark({ cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1, angle: 0 });
    const grown = resizeMarkByHandle(base, "r", { x: 0.75, y: 0.5 });
    ok(grown.rx > base.rx, "resize: sağ tutamak rx büyütür");
    ok(near(grown.ry, base.ry), "resize: sağ tutamak ry'yi bozmaz");
    // minimum sınır
    const shrunk = resizeMarkByHandle(base, "r", { x: 0.5, y: 0.5 });
    ok(shrunk.rx >= 0.012, "resize: minimum rx korunur");
  }

  // ── rotateMarkByPointer ──────────────────────────────────────────────────────
  {
    const base = mark({ cx: 0.5, cy: 0.5 });
    const rotated = rotateMarkByPointer(base, { x: 0.5, y: 0.9 }); // aşağı yön
    ok(typeof rotated.angle === "number" && Number.isFinite(rotated.angle), "rotate: sonlu açı üretir");
    // Tutamak yukarıyı gösterir: pointer YUKARI (dy<0) → açı ≈ 0°.
    const up = rotateMarkByPointer(base, { x: 0.5, y: 0.1 });
    ok(near(((up.angle ?? 0) % 360 + 360) % 360, 0, 1e-4), "rotate: yukarı yön ≈ 0°");
    // pointer SAĞ (dx>0, dy=0) → açı ≈ 90°.
    const right = rotateMarkByPointer(base, { x: 0.9, y: 0.5 });
    ok(near(((right.angle ?? 0) % 360 + 360) % 360, 90, 1e-4), "rotate: sağ yön ≈ 90°");
  }

  // ── moveMarkByDelta (sınır içinde kalır) ─────────────────────────────────────
  {
    const base = mark({ cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 });
    const moved = moveMarkByDelta(base, 0.2, -0.1);
    ok(near(moved.cx, 0.7) && near(moved.cy, 0.4), "move: delta uygulanır");
    const clamped = moveMarkByDelta(base, 1.0, 0); // sınır dışı
    ok(clamped.cx <= 1 - base.rx + 1e-9, "move: sağ sınırda tutulur (cx <= 1-rx)");
  }

  console.log(`\nbodymap-geometry harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Generic Body Map geometri çekirdeği doğrulandı (refleksolojiye dokunulmadı).");
}

run();
