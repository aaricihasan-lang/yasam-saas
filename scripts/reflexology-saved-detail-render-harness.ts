/**
 * REFLEKSOLOJİ — KAYITLI PROTOKOL DETAY "AYAK HARİTASI" GERÇEK-RENDER HARNESS
 *
 * NEDEN VAR (SEV-1): Kayıtlı Protokol Detay'da ayak PNG'si + atlas bölgeleri
 * TAMAMEN BOŞ (beyaz) render oluyordu. Kök neden bir CSS YÜKSEKLİK ÇÖKMESİ idi:
 * harita kabuğunun `h-full` (yüzde) yüksekliği, ata zinciri yalnız `min-height`
 * taşıdığı için ÇÖZÜLEMİYORDU (yüzde yükseklik `min-height` üzerinden zincirlenmez);
 * kabuk yalnız başlığa çöküp canvas 0px, ayak görseli 0px kalıyordu.
 *
 * Mevcut STATİK harness'ler (side-view/coordinate/organ-identity/shape-view-ghost)
 * bunu YAKALAYAMADI: hepsi saf mantık/geometri test eder, GERÇEK yerleşim (layout)
 * ölçmez. jsdom da layout hesaplamaz (getBoundingClientRect → 0). Bu yüzden bu
 * harness GERÇEK bir tarayıcıda (Playwright/Chromium) yerleşimi ölçer.
 *
 * NE DOĞRULAR:
 *  (1) KAYNAKTAN okunan harita-konteyner className'i gerçek tarayıcıda 0'dan büyük
 *      canvas + görsel kutusu üretir (ÇÖKME YOK).
 *  (2) Bilinen-KIRIK kontrol (`h-full` + yalnız min-h) gerçekten ÇÖKER → probe'un
 *      hatayı ayırt edebildiği kanıtlanır (yanlış-yeşil değil).
 *  (3) Kaynak-guard: harita konteyneri KESİN yükseklik (`h-[...]`) kullanır; salt
 *      `h-full`'a geri dönülmemiştir.
 *  (4) object-contain overlay kutusu (bölge katmanı ata'sı) 0'dan büyük ve görsel
 *      içinde → bölgeler çizilecek gerçek bir alan bulur.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirnameLocal, "..");

const LAYOUT_SRC = path.join(
  REPO,
  "app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx",
);
const FOOTMAP_SRC = path.join(
  REPO,
  "app/refleksoloji/protokol-haritasi/components/ProtocolFootMap.tsx",
);

// ── Küçük, ODAKLI Tailwind→CSS çevirici (yalnız bu zincirdeki utilite'ler) ──────
// Prefix (sm:/xl:) çözümü: hedef viewport xl (≥1280) → base, sonra sm, sonra xl
// sırayla uygulanır (sonraki kazanır).
function utilToCss(util: string): Record<string, string> | null {
  const arb = (v: string) => v.replace(/_/g, " ");
  const m = (re: RegExp) => util.match(re);
  let g: RegExpMatchArray | null;
  if (util === "relative") return { position: "relative" };
  if (util === "absolute") return { position: "absolute" };
  if (util === "flex") return { display: "flex" };
  if (util === "grid") return { display: "grid" };
  if (util === "flex-col") return { "flex-direction": "column" };
  if (util === "flex-1") return { flex: "1 1 0%" };
  if (util === "shrink-0") return { "flex-shrink": "0" };
  if (util === "w-full") return { width: "100%" };
  if (util === "h-full") return { height: "100%" };
  if (util === "min-h-0") return { "min-height": "0" };
  if (util === "min-h-screen") return { "min-height": "100vh" };
  if (util === "overflow-hidden") return { overflow: "hidden" };
  if (util === "object-contain") return { "object-fit": "contain" };
  if (util === "inset-0") return { top: "0", right: "0", bottom: "0", left: "0" };
  if (util === "grid-cols-1") return { "grid-template-columns": "1fr" };
  if (util === "items-start") return { "align-items": "start" };
  if (util === "self-start") return { "align-self": "start" };
  if (util === "sticky") return { position: "sticky" };
  if ((g = m(/^h-\[(.+)\]$/))) return { height: arb(g[1]) };
  if ((g = m(/^min-h-\[(.+)\]$/))) return { "min-height": arb(g[1]) };
  if ((g = m(/^max-h-\[(.+)\]$/))) return { "max-height": arb(g[1]) };
  if ((g = m(/^grid-cols-\[(.+)\]$/))) return { "grid-template-columns": arb(g[1]).replace(/_/g, " ") };
  if ((g = m(/^p-(\d+)$/))) return { padding: `${Number(g[1]) * 4}px` };
  if ((g = m(/^top-(\d+)$/))) return { top: `${Number(g[1]) * 4}px` };
  return null; // görsel-only utilite (renk/gölge/kenarlık) → yerleşimi etkilemez
}

function classToStyle(className: string, activePrefixes: string[]): string {
  const decls: Record<string, string> = {};
  const apply = (util: string) => {
    const css = utilToCss(util);
    if (css) Object.assign(decls, css);
  };
  const tokens = className.trim().split(/\s+/);
  // 1) base (prefixsiz)
  for (const t of tokens) if (!t.includes(":")) apply(t);
  // 2) aktif prefiksler sırayla (sm sonra xl)
  for (const p of activePrefixes) {
    for (const t of tokens) {
      if (t.startsWith(`${p}:`)) apply(t.slice(p.length + 1));
    }
  }
  return Object.entries(decls)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

// ── Kaynaktan gerçek className'leri çıkar ───────────────────────────────────────
function readMapContainerClass(): string {
  const src = readFileSync(LAYOUT_SRC, "utf8");
  // <ProtocolFootMap'ten hemen ÖNCEKI <div className="..."> (harita konteyneri)
  const idx = src.indexOf("<ProtocolFootMap");
  if (idx < 0) throw new Error("ProtocolFootMap kullanımı bulunamadı");
  const before = src.slice(0, idx);
  const divs = [...before.matchAll(/<div className="([^"]*)"/g)];
  if (divs.length === 0) throw new Error("Harita konteyner <div> bulunamadı");
  return divs[divs.length - 1][1];
}

function readFootMapClasses(): { shell: string; canvas: string; img: string } {
  const src = readFileSync(FOOTMAP_SRC, "utf8");
  const shell = src.match(/\?\s*"(flex h-full min-h-0 flex-col[^"]*)"/);
  const canvas = src.match(/ref=\{canvasRef\}\s+className="([^"]*)"/);
  const img = src.match(/className="(pointer-events-none absolute inset-0[^"]*)"/);
  if (!shell || !canvas || !img) {
    throw new Error("ProtocolFootMap kabuk/canvas/img className çözülemedi");
  }
  return { shell: shell[1], canvas: canvas[1], img: img[1] };
}

// 2x2 kırmızı PNG (natural boyut > 0; object-contain için kare) — ağ YOK
const IMG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAubQMBl3xY0wAAAABJRU5ErkJggg==";

const ACTIVE_PREFIXES = ["sm", "xl"]; // xl viewport'ta ikisi de aktif

function buildHtml(mapContainerClass: string): string {
  const fm = readFootMapClasses();
  const cls = {
    main: "relative flex min-h-screen w-full flex-col",
    grid: "grid grid-cols-1 xl:grid-cols-[58%_42%] xl:items-start",
    left: "min-w-0",
    section: readFileSync(LAYOUT_SRC, "utf8").match(/footMapPanelLargeClass =\s*\n\s*"([^"]*)"/)![1],
    div540: "relative min-h-[min(62vh,720px)] flex-1 p-3 sm:min-h-[min(68vh,800px)]",
    mapContainer: mapContainerClass,
    shell: fm.shell,
    fmHeader: "shrink-0",
    canvas: fm.canvas,
    img: fm.img,
  };
  const s = (c: string) => classToStyle(c, ACTIVE_PREFIXES);
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0}</style></head>
<body>
<main style="${s(cls.main)}">
  <div style="${s(cls.grid)}">
    <div style="${s(cls.left)}">Sol klinik sütun (uzun içerik) ${"<br>x".repeat(40)}</div>
    <section id="panel" style="${s(cls.section)}">
      <div style="${s("shrink-0")}"><h2>Ayak Haritası Önizleme</h2><p>alt başlık</p></div>
      <div style="${s(cls.div540)}">
        <div id="mapContainer" style="${s(cls.mapContainer)}">
          <div id="shell" style="${s(cls.shell)}">
            <div id="fmHeader" style="${s(cls.fmHeader)}"><p>Taban</p><button>Taban</button></div>
            <div id="canvas" style="${s(cls.canvas)}">
              <img id="footImg" src="${IMG_DATA_URI}" style="${s(cls.img)}">
              <div id="overlay" style="position:absolute;z-index:10;left:10%;top:0;width:80%;height:80%">
                <div id="region" style="position:absolute;left:20%;top:20%;width:20%;height:15%;background:red"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</main>
</body></html>`;
}

async function measure(html: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(html, { waitUntil: "load" });
    // NOT: tsx/esbuild, page.evaluate'e verilen fonksiyonları `__name` ile sarar ve
    // tarayıcıda ReferenceError üretir. Bu yüzden değerlendirme gövdesi DÜZ STRING.
    await page.waitForFunction(
      '(document.getElementById("footImg") && document.getElementById("footImg").complete) === true',
    );
    return (await page.evaluate(`(() => {
      var h = function (id) { var el = document.getElementById(id); return el ? Math.round(el.getBoundingClientRect().height) : -1; };
      var w = function (id) { var el = document.getElementById(id); return el ? Math.round(el.getBoundingClientRect().width) : -1; };
      var img = document.getElementById("footImg");
      return {
        shellH: h("shell"),
        canvasH: h("canvas"),
        imgH: h("footImg"),
        imgW: w("footImg"),
        imgNaturalH: img ? img.naturalHeight : -1,
        regionH: h("region")
      };
    })()`)) as {
      shellH: number; canvasH: number; imgH: number; imgW: number; imgNaturalH: number; regionH: number;
    };
  } finally {
    await browser.close();
  }
}

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

async function main() {
  const mapContainerClass = readMapContainerClass();

  // (3) Kaynak-guard: KESİN yükseklik var; salt h-full değil.
  const hasDefiniteHeight = /\bh-\[[^\]]*\]/.test(mapContainerClass);
  const rel  = /(^|\s)h-full(\s|$)/.test(mapContainerClass);
  add(
    "source-guard: harita konteyneri KESİN yükseklik (h-[...]) kullanır",
    hasDefiniteHeight,
    `container="${mapContainerClass}"`,
  );
  add(
    "source-guard: salt h-full yüzde-yüksekliğe geri dönülmemiş",
    !(rel && !hasDefiniteHeight),
    `h-full=${rel}`,
  );

  // (1) Kaynaktan gelen konteyner GERÇEK tarayıcıda çökmemeli.
  const live = await measure(buildHtml(mapContainerClass));
  add("gerçek-render: canvas yüksekliği > 0 (çökme yok)", live.canvasH > 0, JSON.stringify(live));
  add("gerçek-render: ayak görseli kutusu yüksekliği > 0", live.imgH > 0, `imgH=${live.imgH}`);
  add("gerçek-render: görsel doğal boyut yüklendi (>0)", live.imgNaturalH > 0, `naturalH=${live.imgNaturalH}`);
  add("gerçek-render: overlay bölge kutusu yüksekliği > 0", live.regionH > 0, `regionH=${live.regionH}`);

  // (2) Bilinen-KIRIK kontrol GERÇEKTEN çökmeli (probe hatayı ayırt ediyor mu?).
  const BROKEN = "relative h-full min-h-[min(56vh,680px)] overflow-hidden sm:min-h-[min(64vh,760px)]";
  const broken = await measure(buildHtml(BROKEN));
  add(
    "kontrol: bilinen-kırık (h-full+min-h) GERÇEKTEN çöküyor (probe geçerli)",
    broken.canvasH === 0 && broken.imgH === 0,
    JSON.stringify(broken),
  );

  // Rapor
  let failed = 0;
  for (const c of checks) {
    const tag = c.pass ? "PASS" : "FAIL";
    if (!c.pass) failed++;
    console.log(`[${tag}] ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} PASS`);
  if (failed > 0) {
    console.error(`\n${failed} kontrol BAŞARISIZ — Saved Detail render regresyonu.`);
    process.exit(1);
  }
  console.log("SAVED DETAIL RENDER: FULL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
