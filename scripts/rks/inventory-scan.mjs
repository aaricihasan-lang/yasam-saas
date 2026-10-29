#!/usr/bin/env node
/**
 * RKS-3 statik test envanteri (SALT-OKUNUR; hiçbir testi çalıştırmaz).
 *
 *   node scripts/rks/inventory-scan.mjs --out <dosya.json>
 *
 * Her test giriş dosyası için: import ayak izi (footprint), dokunduğu modüller, statik risk
 * sinyalleri (tarayıcı, sunucu başlatma, gizli ortam değişkeni okuma, .env okuma, production
 * alan adı, ertelenen/korunan alan) ve ÖN sınıf. Nihai A sınıfı ancak verify-candidates.mjs
 * ile izole çalıştırma kanıtından sonra inventory.json'a yazılır.
 */
import fs from "node:fs";
import path from "node:path";
import { ERTELENEN_YOL_RE, KORUNAN_YOL_RE, ROOT, git, matchesAny, readJson } from "./lib/common.mjs";
import { ImportGraph } from "./lib/graph.mjs";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;

const MODULES = readJson("scripts/rks/modules.json");
const allModules = [
  ...MODULES.modules.map((m) => ({ ...m, tur: "normal" })),
  ...MODULES.korunanAlanlar.modules.map((m) => ({ ...m, tur: "korunan" })),
  ...MODULES.ertelenenGruplar.modules.map((m) => ({ ...m, tur: "ertelenen" })),
];
export function modulesOf(file) {
  return allModules.filter((m) => matchesAny(file, m.paths));
}

const files = git(["ls-files", "scripts"]).split(/\r?\n/).filter((f) =>
  /\.(ts|mts|cts|mjs|cjs|js)$/.test(f) && !/\/(fixtures|sql|_shims)\//.test(f) && !f.endsWith(".d.ts") && !f.startsWith("scripts/rks/"));

const graph = new ImportGraph();
const importedByScripts = new Set();
for (const f of files) for (const d of graph.depsOf(f)) if (d.startsWith("scripts/")) importedByScripts.add(d);

const pkg = readJson("package.json");
const runAll = fs.readFileSync(path.join(ROOT, "scripts/final-hardening/run-all.mjs"), "utf8");
const referenced = new Map(); // file → [npm script adları]
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  for (const m of cmd.matchAll(/scripts\/[A-Za-z0-9_./-]+\.(?:ts|mts|mjs|cjs|js)/g)) {
    if (!referenced.has(m[0])) referenced.set(m[0], []);
    referenced.get(m[0]).push(name);
  }
}
for (const m of runAll.matchAll(/scripts\/[A-Za-z0-9_./-]+\.(?:ts|mts|mjs|cjs|js)/g)) {
  if (!referenced.has(m[0])) referenced.set(m[0], []);
  referenced.get(m[0]).push("test:final(run-all)");
}

const TESTLIKE = /(harness|\.test\.|\.pg\.|e2e|browser|check|verify|spec|regression|golden|audit|validate|run-all|smoke|sweep|unit|contract|parity)/i;
// Tam tanımlayıcı (\b) + atama DEĞİL (okuma). Atama (`process.env.X = yerel`) sır okuması sayılmaz.
const ENV_READ = /process\.env\.([A-Z0-9_]+)\b(?!\s*=[^=])|process\.env\[\s*['"]([A-Z0-9_]+)['"]\s*\](?!\s*=[^=])/g;
const SECRET_NAME = /(SUPABASE|ROXY|SERVICE_ROLE|DATABASE_URL|POSTGRES_URL|API_KEY|_TOKEN|SECRET|PASSWORD|ANTHROPIC|OPENAI|GEMINI|DEEPL|GOOGLE)/;

const entries = [];
for (const f of files) {
  const isRef = referenced.has(f);
  if (importedByScripts.has(f) && !isRef) continue; // yardımcı modül
  if (!isRef && !TESTLIKE.test(path.basename(f)) && !TESTLIKE.test(f)) continue;
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const fp = [...graph.footprint(f)];
  const appFiles = fp.filter((x) => !x.startsWith("scripts/"));
  const mods = new Map();
  for (const x of appFiles) for (const m of modulesOf(x)) mods.set(m.id, (mods.get(m.id) ?? 0) + 1);
  const ownMods = modulesOf(f).map((m) => m.id);
  const fpText = fp.filter((x) => x.startsWith("scripts/")).map((x) => { try { return fs.readFileSync(path.join(ROOT, x), "utf8"); } catch { return ""; } }).join("\n");

  const sig = {
    tarayici: /\b(playwright|puppeteer|chromium|webkit|firefox)\b/.test(fpText),
    sunucuBaslatir: /\bnext\s+(dev|start|build)\b|start-next|spawn\(\s*['"](?:npx|npm|next|curl|powershell|pwsh|cmd)['"]/.test(fpText),
    // Testin kendisinin (ayak izinde) atadığı değişkenler dışarıdan gelen sır DEĞİLDİR (ör. yerel test URL'si).
    gizliOkur: [...new Set([...fpText.matchAll(ENV_READ)].map((m) => m[1] ?? m[2]).filter((n) => SECRET_NAME.test(n)))]
      .filter((n) => !new RegExp(`process\\.env\\.${n}\\s*=[^=]|process\\.env\\[\\s*['"]${n}['"]\\s*\\]\\s*=[^=]`).test(fpText)),
    envDosyasi: /\bdotenv\b|\.env\.local|loadEnvConfig/.test(fpText),
    productionAdresi: /yasamsistemi\.com|\.supabase\.co\b|vercel\.app|roxyapi\.com|api\.roxy/i.test(fpText),
    postgres: /embedded-postgres|pg-migration-check/.test(fpText),
    postgrest: /POSTGREST_BIN/.test(fpText),
    testHesabi: /@(outlook|gmail|hotmail)\.com['"]/.test(fpText),
  };
  const yol = f.toLowerCase();
  // Tek kaynak: lib/common.mjs çalıştırma yasağı desenleri (runTest de aynı desenle reddeder).
  const ertelenen = ERTELENEN_YOL_RE.test(yol) || ownMods.some((m) => ["backup", "usage360"].includes(m));
  const korunanYol = KORUNAN_YOL_RE.test(yol);
  const modList = [...mods.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n }));
  // Doğrudan modüller: testin KENDİ import ettiği uygulama dosyaları (yardımcı test modülleri üzerinden
  // bir seviye). Dolaylı bağımlılıklar (ör. route → lib/demo, lib/usage) modül ataması yapmaz; onlar
  // dosya düzeyinde import izi (footprint) ile zaten seçilir.
  const direct = new Set();
  const lvl1 = [...graph.depsOf(f)];
  for (const d of lvl1) {
    if (!d.startsWith("scripts/")) direct.add(d);
    else for (const d2 of graph.depsOf(d)) if (!d2.startsWith("scripts/")) direct.add(d2);
  }
  const dogrudanModuller = [...new Set([...direct].flatMap((x) => modulesOf(x).map((m) => m.id)))];
  const korunanModul = dogrudanModuller.some((id) => allModules.find((m) => m.id === id)?.tur === "korunan")
    || (dogrudanModuller.length === 0 && modList.length > 0 && allModules.find((m) => m.id === modList[0].id)?.tur === "korunan");
  // Çalıştırıcı: npm betiğindeki komut (tsx/node + --tsconfig) esas; yoksa ayak izinde TS varsa tsx.
  const npmCmd = Object.values(pkg.scripts).map((c) => c.match(new RegExp(`(tsx(?:\\s+--tsconfig\\s+(\\S+))?|node)\\s+${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).find(Boolean);
  const runner = npmCmd ? { tsx: npmCmd[1].startsWith("tsx"), tsconfig: npmCmd[2] ?? null } : { tsx: !/\.(mjs|cjs|js)$/.test(f) || fp.some((x) => /\.(ts|tsx|mts|cts)$/.test(x)), tsconfig: null };

  let onSinif = "ADAY";
  const neden = [];
  if (ertelenen) { onSinif = "C"; neden.push("Owner kararıyla ertelenen grup (backup/usage360/hday)"); }
  else if (korunanYol || korunanModul) { onSinif = "B-OWNER"; neden.push("Korunan alan (HD/Atlas/Numeroloji/Kozmik): yalnız salt envanter"); }
  else if (sig.testHesabi || (sig.productionAdresi && (sig.gizliOkur.length || sig.envDosyasi))) { onSinif = "C"; neden.push("Production adresi/gerçek hesap + kimlik bilgisi okuma"); }
  else if (sig.tarayici || sig.sunucuBaslatir) { onSinif = "B"; neden.push(sig.tarayici ? "Tarayıcı (Playwright) gerektirir — ağ koruması tarayıcıya uygulanamaz" : "Sunucu/harici süreç başlatır"); }
  else if (sig.envDosyasi || sig.gizliOkur.length) { onSinif = "B"; neden.push(`Ortam değişkeni/sır okur: ${sig.gizliOkur.join(",") || ".env"}`); }

  entries.push({
    file: f,
    npmScripts: referenced.get(f) ?? [],
    onSinif,
    neden,
    sinyaller: sig,
    moduller: modList,
    dogrudanModuller,
    runner,
    footprintBoyut: fp.length,
    assertionSayaci: (src.match(/\b(?:ok|check|expect|assert(?:\.[a-zA-Z]+)?|H\.ok)\s*\(/g) ?? []).length,
  });
}

const sum = entries.reduce((a, e) => ((a[e.onSinif] = (a[e.onSinif] ?? 0) + 1), a), {});
console.log(`RKS envanter taraması: ${entries.length} test giriş dosyası`, sum);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tarih: new Date().toISOString(), head: git(["rev-parse", "HEAD"]).trim(), entries }, null, 1));
