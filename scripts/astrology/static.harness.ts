/**
 * ASTROLOJİ AŞAMA 1 — STATİK + KABUK KAPISI harness'i.
 *
 *   • app/api/admin/astroloji/** her route'un İLK işi requireAstrologyOwner + erken dönüş
 *   • "use client" dosyaları sunucu-yalnız astroloji modüllerini / supabase-server'ı import etmez
 *   • sunucu modülleri `import "server-only"` + assertServerOnly taşır
 *   • app/admin/astroloji/layout.tsx: kill switch + katı owner + notFound()
 *   • admin menü bağlantısı yalnız showAstrology (sunucu kararı) ile render edilir
 *   • 4 yetki anahtarı Üye Yönetimi / module_permissions / ModuleGateKey'e EKLENMEDİ (Aşama 1)
 *   • NEXT_PUBLIC_ astroloji/roxy değişkeni yok; ROXY_API_KEY istemci dosyasında geçmez
 *   • Human Design / mühürlü modül dosyalarına dokunulmadı (origin/main'e göre diff)
 *   • isAstrologyShellOwner kararı (owner / admin / kill switch / oturumsuz)
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/static.harness.ts
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isAstrologyShellOwner } from "@/lib/astrology/access/ownerGate";
import { createFakeClient, createStore } from "./fakeSupabase";

const ROOT = join(__dirname, "..", "..");
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const SERVER_ONLY_MODULES = [
  "lib/astrology/access/ownerGate",
  "lib/astrology/persistence/repo",
  "lib/astrology/engine/service",
  "lib/astrology/profiles/service",
  "lib/astrology/providers/roxy/client",
  "lib/astrology/birth/location",
  "lib/astrology/http",
  "lib/astrology/kb/service",
  "lib/astrology/analyses/service",
  "lib/astrology/audit/unmapped",
];

async function main() {
  const routeFiles = walk(join(ROOT, "app/api/admin/astroloji")).filter((f) => f.endsWith("route.ts"));
  const astroFiles = [...walk(join(ROOT, "lib/astrology")), ...walk(join(ROOT, "app/admin/astroloji")), ...routeFiles];

  await t(`route: ${routeFiles.length} route'un her handler'ı önce requireAstrologyOwner çağırır`, () => {
    assert.ok(routeFiles.length >= 7, `route sayısı ${routeFiles.length}`);
    for (const f of routeFiles) {
      const s = readFileSync(f, "utf8");
      const handlers = [...s.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*\)[^{]*\{\s*\n([^\n]*)\n([^\n]*)/g)];
      assert.ok(handlers.length > 0, `${rel(f)}: handler yok`);
      for (const h of handlers) {
        assert.match(h[2], /const gate = await requireAstrologyOwner\(req\);/, `${rel(f)} ${h[1]}: ilk satır kapı değil`);
        assert.match(h[3], /if \(!gate\.ok\) return gate\.response;/, `${rel(f)} ${h[1]}: erken dönüş yok`);
      }
      assert.ok(!/verifyUserRequest|requireModuleAccess/.test(s), `${rel(f)}: uzman guard'ı kullanılmamalı`);
    }
  });

  await t("istemci: 'use client' dosyaları sunucu-yalnız modülleri / supabase-server'ı import etmez", () => {
    const clientFiles = astroFiles.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    assert.ok(clientFiles.length >= 5, `istemci dosyası ${clientFiles.length}`);
    for (const f of clientFiles) {
      const s = readFileSync(f, "utf8");
      const imports = [...s.matchAll(/^import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const i of imports) {
        assert.ok(!SERVER_ONLY_MODULES.some((m) => i.endsWith(m.replace(/^lib\//, "")) || i === `@/${m}`), `${rel(f)} → ${i}`);
        assert.ok(!/supabase-server|dbRateLimit|adminGuard|server\/search/.test(i), `${rel(f)} → ${i}`);
        // Aşama 3: sağlayıcı adaptörleri (ham alan adları) ve motor (hash/plan) istemci paketine girmez.
        assert.ok(!/astrology\/providers\/|astrology\/engine\/|astrology\/persistence\//.test(i), `${rel(f)} → ${i} (sunucu tarafı modül)`);
      }
      assert.ok(!/ROXY_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(s), `${rel(f)}: gizli env adı istemcide`);
    }
  });

  await t("sunucu: sunucu-yalnız modüller `import \"server-only\"` + assertServerOnly taşır", () => {
    for (const m of SERVER_ONLY_MODULES) {
      const s = read(`${m}.ts`);
      assert.match(s, /^import "server-only";$/m, `${m}: server-only yok`);
      assert.match(s, /assertServerOnly\("lib\/astrology\//, `${m}: assertServerOnly yok`);
    }
  });

  await t("sunucu: kalıcılık okuma kolonları raw_response İÇERMEZ", () => {
    const s = read("lib/astrology/persistence/repo.ts");
    const m = /const RESULT_SAFE_COLUMNS =\s*\n?\s*"([^"]+)"/.exec(s);
    assert.ok(m, "RESULT_SAFE_COLUMNS bulunamadı");
    assert.ok(!m![1].includes("raw_response"));
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const uses = code.match(/raw_response/g) ?? [];
    assert.equal(uses.length, 1, `raw_response kodda yalnız INSERT'te geçmeli (bulunan ${uses.length})`);
    assert.match(code, /raw_response: r\.raw,/);
  });

  await t("kabuk: app/admin/astroloji/layout.tsx kill switch + katı owner + notFound()", () => {
    const s = read("app/admin/astroloji/layout.tsx");
    assert.match(s, /if \(!isAstrologyModuleEnabled\(\)\) notFound\(\);/);
    assert.match(s, /isAstrologyShellOwner\(db, adminId\)/);
    assert.match(s, /if \(!allowed\) notFound\(\);/);
    assert.ok(!/["']use client["']/.test(s), "layout sunucu bileşeni olmalı");
  });

  await t("menü: admin bağlantısı yalnız sunucu kararı showAstrology ile render edilir", () => {
    const s = read("app/admin/layout.tsx");
    assert.match(s, /showAstrology = await isAstrologyShellOwner\(getServerDb\(\), adminId\)/);
    assert.match(s, /\{showAstrology && \(\s*<Link href="\/admin\/astroloji"/);
    assert.equal((s.match(/\/admin\/astroloji/g) ?? []).length, 1, "astroloji bağlantısı tek ve koşullu olmalı");
  });

  await t("yetki: 4 anahtar Üye Yönetimi / module_permissions / ModuleGateKey / route registry'ye EKLENMEDİ", () => {
    for (const f of ["lib/auth/modulePermissions.ts", "lib/auth/moduleAccessCore.ts", "lib/admin/userManagement.ts", "lib/auth/moduleRouteRegistry.ts", "lib/auth/routeModuleAccess.ts", "app/page.tsx"]) {
      assert.ok(!/astrolog/i.test(read(f)), `${f}: astroloji izi var (Aşama 1'de olmamalı)`);
    }
  });

  await t("env: NEXT_PUBLIC_ astroloji/roxy değişkeni yok; kill switch tam 'true' karşılaştırması", () => {
    for (const f of astroFiles) assert.ok(!/NEXT_PUBLIC_[A-Z_]*(ASTRO|ROXY)/.test(readFileSync(f, "utf8")), rel(f));
    assert.match(read("lib/astrology/config.ts"), /env\.ASTROLOGY_MODULE_ENABLED === "true"/);
  });

  await t("izolasyon: origin/main'e göre Human Design / mühürlü modül dosyası değişmedi", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return; // git yoksa atla
    }
    const changed = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const all = [...changed, ...untracked];
    const allowed = [
      /^lib\/astrology\//,
      /^app\/admin\/astroloji\//,
      /^app\/api\/admin\/astroloji\//,
      /^scripts\/astrology\//,
      /^supabase\/migrations\/20271101000000_astrology_foundation\.sql$/,
      /^supabase\/migrations\/20271101000100_astrology_kb_analyses\.sql$/,
      /^supabase\/migrations\/20271101000200_astrology_timing_relationship\.sql$/,
      /^app\/admin\/layout\.tsx$/,
      /^lib\/backup\/ownerPilotTables\.ts$/,
      /^lib\/backup\/schema\.generated\.ts$/,
      /^scripts\/final-hardening\/backup\.harness\.ts$/,
      /^package\.json$/,
      // Aşama 5: @roxyapi/ui (MIT) tam sürüm bağımlılığı — kilit dosyası değişir.
      /^package-lock\.json$/,
      /^docs\/astrology\//,
      /^ASTROLOGY-PHASE5-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE5-1-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE5-2-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE6-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE6-1-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE6-2-PROGRESS\.md$/,
    ];
    const outside = all.filter((p) => !allowed.some((r) => r.test(p)));
    assert.deepEqual(outside, [], `kapsam dışı değişiklik: ${outside.join(", ")}`);
    assert.ok(!all.some((p) => /^lib\/human-design\/|^app\/api\/hd\/|^app\/human-design\//.test(p)), "HD dosyası değişti");
  });

  await t("kabuk kararı: owner → true; owner olmayan admin / oturumsuz → false; kill switch kapalı → DB'ye gitmeden false", async () => {
    const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
    const ADMIN = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
    const store = createStore({
      users: [
        { id: OWNER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        { id: ADMIN, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
    });
    const db = createFakeClient(store);
    const on = { ASTROLOGY_MODULE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
    assert.equal(await isAstrologyShellOwner(db, OWNER, on), true);
    assert.equal(await isAstrologyShellOwner(db, ADMIN, on), false);
    assert.equal(await isAstrologyShellOwner(db, null, on), false);
    const n = store.log.length;
    assert.equal(await isAstrologyShellOwner(db, OWNER, {} as unknown as NodeJS.ProcessEnv), false);
    assert.equal(store.log.length, n, "kill switch kapalıyken DB sorgusu");
  });

  console.log(`\nastrology static harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("static harness çöktü:", e);
  process.exit(1);
});
