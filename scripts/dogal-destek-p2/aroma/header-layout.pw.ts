/**
 * NEW-2 (opsiyonel) — yağ detay başlığı gerçek tarayıcı yerleşim kontrolü (Playwright/Chromium).
 *
 * Next sunucusu/DB GEREKMEZ: app/aromaterapi/yaglar/[id]/page.tsx başlığındaki GERÇEK className
 * dizileri kaynaktan okunur, aynı DOM iskeletiyle statik HTML'e yerleştirilir ve projedeki
 * Tailwind ile derlenen CSS ile render edilir. 320/360/375/390/412 dikey, 812x375 yatay ve
 * 1280 masaüstünde: yatay taşma yok, eylem düğmeleri başlık/breadcrumb ile çakışmıyor, mobilde
 * başlık sütunu tam genişlik ve düğmeler ≥40px, masaüstünde eski yan yana düzen (h-8) korunuyor,
 * uzun kesintisiz başlık kırılıyor.
 * Çalıştır: npx tsx scripts/dogal-destek-p2/aroma/header-layout.pw.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { chromium } from "playwright";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

const src = readFileSync(path.join(process.cwd(), "app/aromaterapi/yaglar/[id]/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const hdr = src.slice(src.indexOf("{/* ─── HERO HEADER"), src.indexOf("</header>", src.indexOf("{/* ─── HERO HEADER")));
const cls = (re: RegExp, label: string): string => {
  const m = re.exec(hdr) ?? re.exec(src);
  if (!m) throw new Error(`className bulunamadı: ${label}`);
  return m[1];
};
const C = {
  header: cls(/<header className="([^"]+)"/, "header"),
  pad: cls(/<header[^>]*>\s*<div className="([^"]+)"/, "pad"),
  row: cls(/<div className="(flex flex-col gap-3 sm:flex-row[^"]*)"/, "row"),
  left: cls(/\{\/\* Sol: isim \+ meta \*\/\}\s*<div className="([^"]+)"/, "left"),
  crumbs: cls(/<div className="(mb-2 flex[^"]*)"/, "crumbs"),
  crumbBtn: cls(/className="(text-\[10px\] font-black uppercase[^"]*)"/, "crumbBtn"),
  h1: cls(/<h1 className="([^"]+)"/, "h1"),
  chips: cls(/<div className="(mt-2 flex flex-wrap items-center gap-1\.5)"/, "chips"),
  latin: cls(/<span className="([^"]+)">\{oil\.latin_name\}/, "latin"),
  actions: cls(/\{!isDemo && \(\s*<div className="([^"]+)"/, "actions"),
  btnBase: cls(/const btnBase = "([^"]+)"/, "btnBase"),
  silExtra: cls(/className=\{`\$\{btnBase\} (ml-auto[^`]*)`\}>\s*Sil/, "sil"),
};

function html(title: string): string {
  const b = C.btnBase;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>__CSS__</style></head>
<body class="bg-slate-50"><main class="flex min-h-screen flex-col"><div class="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-2 px-3 py-4 sm:px-5 lg:px-8 xl:px-10">
<header id="hdr" class="${C.header}"><div class="${C.pad}"><div id="row" class="${C.row}">
  <div id="left" class="${C.left}">
    <div id="crumbs" class="${C.crumbs}"><button class="${C.crumbBtn}">Aromaterapi</button><span class="text-[10px] text-amber-400">/</span><button class="${C.crumbBtn}">Yağlar</button></div>
    <h1 id="title" class="${C.h1}">${title}</h1>
    <div class="${C.chips}"><span class="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold">Uçucu Yağ</span><span class="${C.latin}">Boswellia sacra Flueck.</span><span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Reçine</span></div>
  </div>
  <div id="actions" class="${C.actions}">
    <button class="${b} border border-blue-200 bg-blue-50 text-blue-700">📄 Word'e Aktar</button>
    <button class="${b} bg-slate-900 text-white">✏️ Düzenle</button>
    <button id="sil" class="${b} ${C.silExtra}">Sil</button>
  </div>
</div></div></header></div></main></body></html>`;
}

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function main() {
  const tw = tailwindcss({ content: [{ raw: html("x") + html("y"), extension: "html" }], theme: { extend: {} }, corePlugins: {}, plugins: [] });
  const css = (await postcss([tw]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css;

  const browser = await chromium.launch();
  try {
    const viewports = [
      { w: 320, h: 640 }, { w: 360, h: 740 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 412, h: 915 },
      { w: 812, h: 375 }, { w: 1280, h: 800 },
    ];
    const titles = ["Akgünlük (Kopya)", "Akgünlükyağıçokuzunkesintisizbiradtestiçinyazılmışkayıt".repeat(2)];
    for (const vp of viewports) {
      for (const title of titles) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.setContent(html(title).replace("__CSS__", css));
        const tag = `${vp.w}x${vp.h} ${title.length > 20 ? "uzun-başlık" : "Akgünlük"}`;
        // Dize olarak değerlendirilir (tsx/esbuild __name sarmalayıcısı tarayıcıda yok).
        const m = (await page.evaluate(`(() => {
          const r = (id) => { const e = document.getElementById(id).getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; };
          const btns = Array.from(document.querySelectorAll("#actions button")).map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
          const t = document.getElementById("title");
          return {
            sw: document.documentElement.scrollWidth, iw: window.innerWidth,
            left: r("left"), title: r("title"), crumbs: r("crumbs"), hdr: r("hdr"), btns,
            titleOverflow: t.scrollWidth > t.clientWidth + 1,
          };
        })()`)) as { sw: number; iw: number; left: Box; title: Box; crumbs: Box; hdr: Box; btns: Box[]; titleOverflow: boolean };
        ok(m.sw <= m.iw + 1, `${tag}: yatay taşma yok`, { sw: m.sw, iw: m.iw });
        ok(!m.titleOverflow, `${tag}: başlık kırpılmıyor (satıra kırılıyor)`);
        const collide = m.btns.some((b) => overlap(b, m.title) || overlap(b, m.crumbs));
        ok(!collide, `${tag}: eylem düğmeleri başlık/breadcrumb ile çakışmıyor`, { btns: m.btns, title: m.title, crumbs: m.crumbs });
        ok(m.btns.every((b) => b.x >= m.hdr.x - 0.5 && b.x + b.width <= m.hdr.x + m.hdr.width + 0.5), `${tag}: düğmeler kart içinde`);
        if (vp.w < 640) {
          ok(m.left.width >= m.hdr.width - 48, `${tag}: başlık sütunu tam genişlik (${Math.round(m.left.width)}px)`, m.left);
          ok(m.btns.every((b) => b.height >= 40), `${tag}: düğme yüksekliği ≥40px`, m.btns.map((b) => b.height));
          ok(m.btns.every((b) => b.y >= m.title.y + m.title.height - 0.5), `${tag}: eylemler başlığın ALTINDA`);
          const [, duz, sil] = m.btns;
          ok(sil.x - (duz.x + duz.width) >= 8 || sil.y > duz.y, `${tag}: Sil, Düzenle'ye yapışık değil`, { duz, sil });
        } else {
          ok(m.btns.every((b) => Math.round(b.height) === 32), `${tag}: masaüstü düğme yüksekliği eski 32px (h-8)`, m.btns.map((b) => b.height));
          ok(m.btns.every((b) => b.x >= m.left.x + m.left.width - 0.5), `${tag}: masaüstü eski yan yana düzen (eylemler sağda)`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.error("Başarısız:", failures); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
