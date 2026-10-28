/**
 * Klasik Numeroloji — DOKUNULMAZLIK SINIRI harness'i.
 *
 * A) Mevcut Numeroloji kaynaklarında taban commit'e göre SIFIR fark (commit'li + çalışma ağacı + izlenmeyen dosya).
 * B) Yeni koddan mevcut `numerology_*` tablolarına yazma çağrısı yok (statik tarama).
 * C) Yeni migration'lar mevcut numerology_* tablolarını ALTER/DROP/UPDATE/DELETE/INSERT etmez.
 * D) Yeni kodun kullanıcıya görünen metinlerinde sağlayıcı adı yok (UI katmanı taraması).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/guard/boundary.harness.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.NUM_KLASIK_BASE ?? "8a58ac1a";
const ROOT = path.resolve(__dirname, "../../..");

const PROTECTED: string[] = [
  "lib/numeroloji",
  "app/numeroloji",
  "app/api/numeroloji",
  "app/api/clients/[id]/numerology-analysis",
  "app/api/clients/[id]/numerology-summary",
  "app/api/clients/[id]/word-report",
  "lib/danisan/numerologyAuto.ts",
  "lib/danisan/numerologyLink.ts",
  "lib/danisan/numerologySummary.ts",
  "app/dashboard/clients/[id]/components/NumerolojiTab.tsx",
  "app/dashboard/clients/[id]/components/useNumerologySummary.ts",
  "app/_premium/numeroloji",
  "lib/demo/demoNumeroloji.ts",
  "lib/demo/demoNumerolojiAnaliz.ts",
  "docs/numeroloji-master-number-metodolojisi.md",
  "docs/numeroloji-pdf-metodoloji-spec.md",
  "docs/numeroloji-rls-migration.sql",
];

const NEW_CODE_DIRS = ["lib/numeroloji-klasik", "app/numeroloji-merkezi", "app/numeroloji-klasik", "app/numeroloji-karsilastirma", "app/api/numeroloji-klasik"];
const UI_DIRS = ["app/numeroloji-merkezi", "app/numeroloji-klasik", "app/numeroloji-karsilastirma"];

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail?: string): void {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.log(`✗ ${label}${detail ? `\n    ${detail}` : ""}`);
  }
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    const rel = path.posix.join(dir, name);
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|sql|css)$/.test(name)) out.push(rel);
  }
  return out;
}

// A — dosya farkı
const committed = git(["diff", "--name-only", `${BASE}..HEAD`, "--", ...PROTECTED]).trim();
check(committed === "", `A1 korunan yollar: taban ${BASE} → HEAD commit farkı yok`, committed);
const working = git(["diff", "--name-only", "HEAD", "--", ...PROTECTED]).trim();
check(working === "", "A2 korunan yollar: çalışma ağacı/index farkı yok", working);
const untracked = git(["ls-files", "--others", "--exclude-standard", "--", ...PROTECTED]).trim();
check(untracked === "", "A3 korunan yollar: izlenmeyen yeni dosya yok", untracked);
const migChanged = git(["diff", "--name-status", `${BASE}`, "--", "supabase/migrations"]).trim().split("\n").filter(Boolean);
const migBad = migChanged.filter((l) => !/^A\s+supabase\/migrations\/2027120500\d{4}_numerology_classic_[a-z_]+\.sql$/.test(l));
check(migBad.length === 0, "A4 migration klasöründe yalnız yeni numerology_classic_* dosyaları eklendi (mevcutlar değişmedi)", migBad.join("\n"));

// B — yeni koddan mevcut tablolara yazma yok
const LEGACY_TABLES = [
  "numerology_records",
  "numerology_knowledge_records",
  "numerology_stone_assignments",
  "numerology_sources",
  "numerology_record_sources",
  "numerology_knowledge_source_entries",
  "numerology_analyses",
  "demo_numerology_ip_usage",
  "stones",
  "dogaltas_inventory",
  "client_stones",
  "inventory_sales",
  "inventory_sale_items",
];
const newFiles = NEW_CODE_DIRS.flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx)$/.test(f));
const writeViolations: string[] = [];
for (const f of newFiles) {
  const src = readFileSync(path.join(ROOT, f), "utf8");
  for (const t of LEGACY_TABLES) {
    const re = new RegExp(`from\\(\\s*["'\`]${t}["'\`]\\s*\\)([\\s\\S]{0,400})`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const chain = m[1].split(/;\s*\n/)[0];
      if (/\.(insert|update|upsert|delete)\s*\(/.test(chain)) writeViolations.push(`${f}: ${t}`);
    }
    if (new RegExp(`rpc\\(\\s*["'\`][a-z_]*${t}[a-z_]*["'\`]`).test(src)) writeViolations.push(`${f}: rpc(${t})`);
  }
}
check(writeViolations.length === 0, `B1 yeni kod (${newFiles.length} dosya) mevcut Numeroloji/Doğaltaş tablolarına yazmıyor`, writeViolations.join("\n"));

// C — yeni migration'lar mevcut tablolara dokunmuyor
const newMigs = git(["ls-files", "--others", "--cached", "--exclude-standard", "supabase/migrations"]).split("\n").filter((f) => /numerology_classic_/.test(f));
const migViolations: string[] = [];
for (const f of newMigs) {
  const sql = readFileSync(path.join(ROOT, f), "utf8").replace(/--.*$/gm, "");
  for (const t of LEGACY_TABLES) {
    const re = new RegExp(`\\b(alter\\s+table|drop\\s+table|update|delete\\s+from|insert\\s+into|truncate)\\s+(if\\s+exists\\s+)?(public\\.)?${t}\\b`, "i");
    if (re.test(sql)) migViolations.push(`${f}: ${t}`);
  }
}
check(migViolations.length === 0, `C1 yeni migration'lar (${newMigs.length}) mevcut tabloları değiştirmiyor`, migViolations.join("\n"));

// D — UI'da sağlayıcı adı yok
const uiFiles = UI_DIRS.flatMap((d) => walk(d)).concat(walk("lib/numeroloji-klasik/model.ts".replace(/\/model\.ts$/, "")).filter((f) => /\/(model|labels|compare\/glossary|report\/[^/]+)\.ts$/.test(f)));
const brand: string[] = [];
for (const f of uiFiles) {
  const src = readFileSync(path.join(ROOT, f), "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^\s*import\b/.test(l))
    .join("\n");
  const m = src.match(/["'`>][^"'`<]*\broxy(api)?\b[^"'`<]*["'`<]/i);
  if (m) brand.push(`${f}: ${m[0].slice(0, 80)}`);
}
check(brand.length === 0, `D1 kullanıcıya görünen katmanda (${uiFiles.length} dosya) sağlayıcı adı yok`, brand.join("\n"));

console.log(`\n${checks - failures}/${checks} PASS`);
process.exit(failures ? 1 : 0);
