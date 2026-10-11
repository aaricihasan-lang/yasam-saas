"use client";

/**
 * Gökyüzü Atlası — DEKORATİF 3D gök küresi sahnesi (Three.js, yalnız istemci, tembel yükleme).
 *
 * ÖNEMLİ: Bu sahne TEMSİLİDİR; gezegen/gök cismi konumları hesaplama verisi DEĞİLDİR ve hiçbir analiz verisine
 * bağlanmaz. Gerçek haritalar analiz ekranlarında mevcut hesaplamadan çizilir.
 *
 * Performans / dayanıklılık:
 *   • three ayrı parçada (dynamic import) — ana pakete girmez; SSR'da hiç çalışmaz.
 *   • WebGL yoksa / kurulum hata verirse statik SVG alternatifi gösterilir (işlevler sahneye bağlı değil).
 *   • prefers-reduced-motion → tek kare çizilir, animasyon yok.
 *   • Mobil / dar ekran: daha az yıldız, düşük piksel oranı, ~30 fps.
 *   • Sekme gizliyken veya sahne görünmüyorken döngü durur; bileşen kapanırken tüm GPU kaynakları serbest bırakılır.
 */
import { useEffect, useRef, useState } from "react";

const GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => `${g}︎`);
const GOLD = 0xd9b56f;

export type ScenePerf = { mode: "webgl" | "static" | "reduced"; avgFrameMs: number | null; frames: number; stars: number };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** WebGL yoksa: aynı kompozisyonun statik SVG karşılığı. */
export function StaticSky({ className = "" }: { className?: string }) {
  const stars = Array.from({ length: 90 }, (_, i) => {
    const x = (i * 137.508) % 100;
    const y = (i * 61.803 * 1.7) % 100;
    return { x, y, r: i % 7 === 0 ? 1.4 : i % 3 === 0 ? 0.9 : 0.55, o: 0.35 + ((i * 29) % 60) / 100 };
  });
  return (
    <svg className={className} viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="atlas-neb" cx="68%" cy="45%" r="45%">
          <stop offset="0%" stopColor="#5b4aa8" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#34316c" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#080f24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="60" fill="url(#atlas-neb)" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y * 0.6} r={s.r * 0.18} fill="#f6f2ea" opacity={s.o} />
      ))}
      <g transform="translate(68 30)" fill="none" stroke="#d9b56f">
        <circle r="22" strokeOpacity="0.5" strokeWidth="0.25" />
        <circle r="19.5" strokeOpacity="0.25" strokeWidth="0.15" />
        <ellipse rx="22" ry="7" strokeOpacity="0.45" strokeWidth="0.2" transform="rotate(-18)" />
        <ellipse rx="15" ry="13" stroke="#9cc3ff" strokeOpacity="0.3" strokeWidth="0.15" transform="rotate(30)" />
        {GLYPHS.map((g, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <text key={g} x={Math.cos(a) * 25} y={Math.sin(a) * 25 + 1} fontSize="2.6" textAnchor="middle" fill="#d9b56f" fillOpacity="0.8" stroke="none">
              {g}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

export default function CelestialScene({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"pending" | "webgl" | "static">("pending");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!webglAvailable()) {
      setMode("static");
      (window as unknown as { __atlasPerf?: ScenePerf }).__atlasPerf = { mode: "static", avgFrameMs: null, frames: 0, stars: 0 };
      return;
    }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void import("./threeSubset")
      .then((THREE) => {
        if (disposed || !hostRef.current) return;
        const reduced = prefersReducedMotion();
        const narrow = host.clientWidth < 768;
        const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
        const light = narrow || coarse;

        const renderer = new THREE.WebGLRenderer({ antialias: !light, alpha: true, powerPreference: light ? "low-power" : "default" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, light ? 1.25 : 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
        camera.position.set(0, 0, 9);

        const disposables: { dispose: () => void }[] = [];
        const track = <T extends { dispose: () => void }>(x: T) => {
          disposables.push(x);
          return x;
        };

        // ── Yıldız katmanları (farklı derinlik + hafif titreşim) ──────────────────────────────────────
        const starCount = light ? 650 : 1900;
        const starGeo = track(new THREE.BufferGeometry());
        const pos = new Float32Array(starCount * 3);
        const col = new Float32Array(starCount * 3);
        const size = new Float32Array(starCount);
        const phase = new Float32Array(starCount);
        const warm = new THREE.Color("#f6e7c8");
        const cool = new THREE.Color("#bcd3ff");
        const white = new THREE.Color("#f6f2ea");
        for (let i = 0; i < starCount; i++) {
          const layer = i % 3; // 0 uzak, 2 yakın
          const r = 40 - layer * 12 + Math.random() * 8;
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
          pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
          pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) - 4;
          const c = Math.random() < 0.15 ? warm : Math.random() < 0.3 ? cool : white;
          col[i * 3] = c.r;
          col[i * 3 + 1] = c.g;
          col[i * 3 + 2] = c.b;
          size[i] = (layer === 2 ? 2.3 : layer === 1 ? 1.6 : 1.1) * (0.6 + Math.random() * 0.8);
          phase[i] = Math.random() * Math.PI * 2;
        }
        starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        starGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        starGeo.setAttribute("size", new THREE.BufferAttribute(size, 1));
        starGeo.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
        const starMat = track(
          new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
            vertexShader: `attribute float size; attribute float phase; attribute vec3 color; uniform float uTime; uniform float uPx;
              varying float vA; varying vec3 vC;
              void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uPx * (26.0 / -mv.z);
                vA = 0.55 + 0.45 * sin(uTime * 0.9 + phase); vC = color; gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `varying float vA; varying vec3 vC;
              void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC, a * vA); }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const stars = new THREE.Points(starGeo, starMat);
        scene.add(stars);

        // ── Bulutsu (nebula) ışıkları: radyal doku + toplamalı karışım ────────────────────────────────
        const glowTex = (inner: string, outer: string) => {
          const c = document.createElement("canvas");
          c.width = c.height = 256;
          const g = c.getContext("2d")!;
          const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
          grd.addColorStop(0, inner);
          grd.addColorStop(1, outer);
          g.fillStyle = grd;
          g.fillRect(0, 0, 256, 256);
          const t = track(new THREE.CanvasTexture(c));
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        };
        const nebula = (inner: string, x: number, y: number, z: number, s: number, o: number) => {
          const m = track(new THREE.SpriteMaterial({ map: glowTex(inner, "rgba(0,0,0,0)"), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
          const sp = new THREE.Sprite(m);
          sp.position.set(x, y, z);
          sp.scale.set(s, s, 1);
          scene.add(sp);
          return sp;
        };
        nebula("rgba(110,86,207,0.55)", 3.5, 0.6, -12, 22, 0.55);
        nebula("rgba(64,170,190,0.35)", -6, -3, -16, 20, 0.35);
        nebula("rgba(217,181,111,0.30)", 6, -3.5, -10, 12, 0.35);

        // ── Gök küresi (eğik) ────────────────────────────────────────────────────────────────────────
        const sphere = new THREE.Group();
        sphere.rotation.set(0.38, 0, -0.2);
        const holder = new THREE.Group();
        holder.add(sphere);
        scene.add(holder);
        const R = 2.35;

        const lineMat = (color: number, opacity: number) => track(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
        // Koordinat ağı: enlem + boylam çizgileri
        const gridPts: number[] = [];
        for (let lat = -60; lat <= 60; lat += 30) {
          const y = R * Math.sin((lat * Math.PI) / 180);
          const rr = R * Math.cos((lat * Math.PI) / 180);
          for (let k = 0; k < 96; k++) {
            const a1 = (k / 96) * Math.PI * 2;
            const a2 = ((k + 1) / 96) * Math.PI * 2;
            gridPts.push(rr * Math.cos(a1), y, rr * Math.sin(a1), rr * Math.cos(a2), y, rr * Math.sin(a2));
          }
        }
        for (let lon = 0; lon < 180; lon += 30) {
          const a = (lon * Math.PI) / 180;
          for (let k = 0; k < 96; k++) {
            const t1 = (k / 96) * Math.PI * 2;
            const t2 = ((k + 1) / 96) * Math.PI * 2;
            gridPts.push(R * Math.cos(t1) * Math.cos(a), R * Math.sin(t1), R * Math.cos(t1) * Math.sin(a), R * Math.cos(t2) * Math.cos(a), R * Math.sin(t2), R * Math.cos(t2) * Math.sin(a));
          }
        }
        const gridGeo = track(new THREE.BufferGeometry());
        gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
        sphere.add(new THREE.LineSegments(gridGeo, lineMat(0x9cb4e8, 0.16)));

        // Ekliptik kuşağı (altın) + derece işaretleri + 12 burç sembolü
        const ecliptic = new THREE.Group();
        ecliptic.rotation.x = 0.5; // kameraya açık elips (sembollerin üst üste binmemesi için)
        sphere.add(ecliptic);
        const goldMat = track(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85 }));
        const torusGeo = track(new THREE.TorusGeometry(R * 1.02, 0.012, 8, 220));
        ecliptic.add(new THREE.Mesh(torusGeo, goldMat));
        const band2 = track(new THREE.TorusGeometry(R * 1.12, 0.006, 6, 220));
        ecliptic.add(new THREE.Mesh(band2, track(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45 }))));
        const tickPts: number[] = [];
        for (let d = 0; d < 360; d += 5) {
          const a = (d * Math.PI) / 180;
          const r1 = R * 1.02;
          const r2 = d % 30 === 0 ? R * 1.12 : R * (d % 10 === 0 ? 1.07 : 1.05);
          tickPts.push(r1 * Math.cos(a), r1 * Math.sin(a), 0, r2 * Math.cos(a), r2 * Math.sin(a), 0);
        }
        const tickGeo = track(new THREE.BufferGeometry());
        tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(tickPts, 3));
        ecliptic.add(new THREE.LineSegments(tickGeo, lineMat(GOLD, 0.55)));

        const glyphTex = (g: string) => {
          const c = document.createElement("canvas");
          c.width = c.height = 128;
          const x = c.getContext("2d")!;
          x.fillStyle = "#e8cf98";
          x.font = '78px "Segoe UI Symbol","Noto Sans Symbols 2","Apple Symbols","DejaVu Sans",serif';
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.shadowColor = "rgba(217,181,111,0.85)";
          x.shadowBlur = 14;
          x.fillText(g, 64, 70);
          const t = track(new THREE.CanvasTexture(c));
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        };
        GLYPHS.forEach((g, i) => {
          const a = ((i * 30 + 15) * Math.PI) / 180;
          const m = track(new THREE.SpriteMaterial({ map: glyphTex(g), transparent: true, depthWrite: false, opacity: 0.95 }));
          const s = new THREE.Sprite(m);
          s.position.set(R * 1.24 * Math.cos(a), R * 1.24 * Math.sin(a), 0);
          s.scale.set(0.27, 0.27, 1);
          ecliptic.add(s);
        });

        // Yörüngeler + temsili gök cisimleri (VERİ DEĞİL)
        const bodyTex = glowTex("rgba(255,255,255,1)", "rgba(255,255,255,0)");
        const orbits: { group: InstanceType<typeof THREE.Group>; body: InstanceType<typeof THREE.Sprite>; r: number; speed: number; a0: number }[] = [];
        const orbitDefs = [
          { r: 1.25, tilt: [1.2, 0.2], color: 0xb9a6f2, speed: 0.11, body: "#e9e0fa", s: 0.2 },
          { r: 1.7, tilt: [1.45, -0.35], color: 0x8fd6cb, speed: -0.075, body: "#ddf3f0", s: 0.24 },
          { r: 2.05, tilt: [1.0, 0.6], color: 0xf0c9a4, speed: 0.05, body: "#fbe7dd", s: 0.18 },
        ];
        for (const o of orbitDefs) {
          const g = new THREE.Group();
          g.rotation.set(o.tilt[0], o.tilt[1], 0);
          const og = track(new THREE.TorusGeometry(o.r, 0.004, 6, 200));
          g.add(new THREE.Mesh(og, track(new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.5 }))));
          const bm = track(new THREE.SpriteMaterial({ map: bodyTex, color: new THREE.Color(o.body), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          const body = new THREE.Sprite(bm);
          body.scale.set(o.s, o.s, 1);
          g.add(body);
          sphere.add(g);
          orbits.push({ group: g, body, r: o.r, speed: o.speed, a0: Math.random() * Math.PI * 2 });
        }
        // Merkez ışığı
        const core = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex("rgba(255,236,196,0.95)", "rgba(217,181,111,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        core.scale.set(0.7, 0.7, 1);
        (core.material as InstanceType<typeof THREE.SpriteMaterial>).opacity = 0.75;
        sphere.add(core);
        // Dış hale
        const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex("rgba(120,100,220,0.35)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        halo.scale.set(R * 3.4, R * 3.4, 1);
        holder.add(halo);

        // ── Yerleşim (sahne genişliğine göre) ────────────────────────────────────────────────────────
        const layout = () => {
          const w = host.clientWidth || 1;
          const h = host.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          if (w >= 1024) {
            holder.position.set(2.3, 0.05, 0);
            holder.scale.setScalar(0.92);
          } else if (w >= 640) {
            holder.position.set(1.95, 0.35, 0);
            holder.scale.setScalar(0.78);
          } else {
            // Mobil: küre başlığın ÜSTÜNDE (metinle çakışmaz); sahne yüksekliğinin üst bölümünde.
            holder.position.set(0, 1.55, -1);
            holder.scale.setScalar(0.62);
          }
        };
        layout();
        const ro = new ResizeObserver(() => {
          layout();
          if (reduced) renderer.render(scene, camera);
        });
        ro.observe(host);

        // ── Etkileşim: fareye çok hafif derinlik tepkisi ──────────────────────────────────────────────
        const target = { x: 0, y: 0 };
        const onMove = (e: PointerEvent) => {
          const r = host.getBoundingClientRect();
          target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
          target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
        };
        if (!coarse && !reduced) window.addEventListener("pointermove", onMove, { passive: true });

        // ── Döngü: görünür + sekme açıkken; mobilde ~30 fps ──────────────────────────────────────────
        let visible = true;
        const io = new IntersectionObserver((ents) => {
          visible = ents[0]?.isIntersecting ?? true;
          if (visible) start();
        });
        io.observe(host);
        let raf = 0;
        let last = performance.now();
        let acc = 0;
        let frames = 0;
        let costSum = 0;
        const minDt = light ? 1000 / 30 : 0;
        const perf: ScenePerf = { mode: reduced ? "reduced" : "webgl", avgFrameMs: null, frames: 0, stars: starCount };
        (window as unknown as { __atlasPerf?: ScenePerf }).__atlasPerf = perf;
        let tSec = 0;
        const frame = (now: number) => {
          raf = 0;
          if (!visible || document.hidden) return;
          const dt = now - last;
          if (dt < minDt) {
            raf = requestAnimationFrame(frame);
            return;
          }
          last = now;
          const step = Math.min(dt, 64) / 1000;
          tSec += step;
          const c0 = performance.now();
          starMat.uniforms.uTime.value = tSec;
          sphere.rotation.y += step * 0.045;
          stars.rotation.y += step * 0.004;
          for (const o of orbits) {
            const a = o.a0 + tSec * o.speed * Math.PI * 2 * 0.25;
            o.body.position.set(o.r * Math.cos(a), o.r * Math.sin(a), 0);
          }
          holder.rotation.y += (target.x * 0.12 - holder.rotation.y) * 0.04;
          holder.rotation.x += (target.y * 0.08 - holder.rotation.x) * 0.04;
          camera.position.x += (target.x * 0.25 - camera.position.x) * 0.03;
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          costSum += performance.now() - c0;
          frames++;
          acc += dt;
          if (frames % 60 === 0) {
            perf.avgFrameMs = Math.round((costSum / frames) * 100) / 100;
            perf.frames = frames;
          }
          raf = requestAnimationFrame(frame);
        };
        const start = () => {
          if (reduced || raf || disposed) return;
          last = performance.now();
          raf = requestAnimationFrame(frame);
        };
        const onVis = () => {
          if (!document.hidden) start();
        };
        document.addEventListener("visibilitychange", onVis);
        // İlk kare HER ZAMAN hemen çizilir (sekme arka plandaysa da boş görünmez); animasyon görünürken başlar.
        sphere.rotation.y = 0.6;
        for (const o of orbits) o.body.position.set(o.r * Math.cos(o.a0), o.r * Math.sin(o.a0), 0);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        if (!reduced) start();
        setMode("webgl");

        cleanup = () => {
          if (raf) cancelAnimationFrame(raf);
          ro.disconnect();
          io.disconnect();
          window.removeEventListener("pointermove", onMove);
          document.removeEventListener("visibilitychange", onVis);
          for (const d of disposables) d.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          void acc;
        };
      })
      .catch(() => {
        if (!disposed) setMode("static");
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className={className || "relative h-full w-full"} aria-hidden="true">
      <div ref={hostRef} className="absolute inset-0" />
      {mode === "static" && <StaticSky className="absolute inset-0 h-full w-full" />}
    </div>
  );
}
