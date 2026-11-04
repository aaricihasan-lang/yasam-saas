// Gökyüzü Atlası — satış öncesi geliştirme bilgilendirmesi (05.11.2026): statik sözleşme testleri.
// Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-development-notice.harness.ts
//   1) owner onaylı metin birebir (başlık, iki paragraf, "Tamam"); tarih / süre / yeni vaat yok
//   2) bileşen yalnız görsel: istek / depolama / çerez / veritabanı / sağlayıcı erişimi yok
//   3) erişilebilirlik: role=dialog, aria-modal, başlık + açıklama bağları, tek buton, arka plan inert
//   4) entegrasyon: yalnız uzman Atlas kabuğu (app/astroloji/layout.tsx) bileşeni bağlar; owner kabuğu ve sayfa değişmez
//   5) kapsam: origin/main'e göre değişen dosyalar yalnız bu görevin dosyaları (hesap motoru / API / migration yok)
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const COMPONENT = "components/astrology/AtlasDevelopmentNotice.tsx";
const LAYOUT = "app/astroloji/layout.tsx";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name} — ${(e as Error).message}`);
  }
}

// Owner onaylı metin — bileşenden BAĞIMSIZ kopya.
const TITLE = "Gökyüzü Atlası — Bilgilendirme";
const P1 = "Bu modül aktiftir. Mevcut hesaplamalar test edilmiştir ve şu anda kullanılabilir.";
const P2 = "Geliştirmelerimiz devam ediyor; yeni haritalar ve hesaplamalar aşamalı olarak eklenecektir.";

(async () => {
  const src = read(COMPONENT);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  await t("1 metin: başlık + iki paragraf + Tamam birebir", () => {
    assert.ok(src.includes(`"${TITLE}"`), "başlık");
    assert.ok(src.includes(`"${P1}"`), "1. paragraf");
    assert.ok(src.includes(`"${P2}"`), "2. paragraf");
    assert.match(code, />\s*Tamam\s*</, "buton etiketi");
  });

  await t("1 metin: tarih / süre / takvim vaadi yok", () => {
    const visible = [...code.matchAll(/"([^"]*[A-Za-zÇĞİÖŞÜçğıöşü][^"]*)"/g)].map((m) => m[1]).join(" ");
    assert.ok(!/\b20\d\d\b|yakında|ay içinde|hafta|tarih/i.test(visible), visible);
  });

  await t("2 yalnız görsel: fetch / API / depolama / çerez / sağlayıcı erişimi yok", () => {
    for (const re of [/fetch\s*\(/, /localStorage/, /sessionStorage/, /document\.cookie/, /indexedDB/, /\/api\//, /supabase/i, /roxy/i, /astroFetch/, /XMLHttpRequest/]) {
      assert.ok(!re.test(code), `yasak: ${re}`);
    }
    const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(imports, ["lucide-react", "react", "react-dom"], `içe aktarımlar: ${imports.join(", ")}`);
  });

  await t("3 erişilebilirlik: dialog rolü, aria bağları, tek buton, Esc/dış tıklama kapatmaz, arka plan inert", () => {
    assert.match(code, /role="dialog"/);
    assert.match(code, /aria-modal="true"/);
    assert.match(code, /aria-labelledby=\{titleId\}/);
    assert.match(code, /aria-describedby=\{descId\}/);
    assert.equal((code.match(/<button\b/g) ?? []).length, 1, "tek buton");
    assert.match(code, /\.inert = true/);
    assert.match(code, /e\.key === "Escape"/);
    assert.ok(!/onClick=\{[^}]*\}\s*\n?\s*>\s*\n?\s*<div\s+role="dialog"/.test(code), "dış katman tıklamayla kapanmamalı");
  });

  await t("3 görünürlük: sunucu anlık görüntüsü kapalı (SSR'da pencere yok); Atlas dışına çıkınca sıfırlanır", () => {
    assert.match(code, /useSyncExternalStore\(subscribe, \(\) => acknowledged, \(\) => true\)/);
    assert.match(code, /path === "\/astroloji" \|\| path\.startsWith\("\/astroloji\/"\)/);
  });

  await t("4 entegrasyon: uzman kabuğu bileşeni bağlar; sunucu bileşeni kalır; kill switch aynen", () => {
    const s = read(LAYOUT);
    assert.ok(!/["']use client["']/.test(s), "layout sunucu bileşeni olmalı");
    assert.match(s, /import AtlasDevelopmentNotice from "@\/components\/astrology\/AtlasDevelopmentNotice";/);
    assert.match(s, /if \(!isAstrologyModuleEnabled\(\)\) notFound\(\);/);
    assert.match(s, /\{children\}\s*<AtlasDevelopmentNotice \/>/);
  });

  await t("4 entegrasyon: owner kabuğu, Atlas sayfası ve efemeris sayfası bileşeni bağlamaz", () => {
    for (const f of ["app/admin/astroloji/layout.tsx", "app/admin/astroloji/page.tsx", "app/astroloji/page.tsx", "app/admin/astroloji/efemeris/page.tsx", "app/astroloji/efemeris/page.tsx"]) {
      assert.ok(!read(f).includes("AtlasDevelopmentNotice"), f);
    }
  });

  await t("5 kapsam: origin/main'e göre yalnız bu görevin dosyaları değişti", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return; // git yoksa atla
    }
    const changed = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const allowed = new Set([COMPONENT, LAYOUT, "scripts/astrology/atlas-development-notice.harness.ts", "scripts/astrology/atlas-development-notice-ui.e2e.cjs"]);
    const outside = [...changed, ...untracked].filter((p) => !allowed.has(p));
    assert.deepEqual(outside, [], `kapsam dışı: ${outside.join(", ")}`);
  });

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
