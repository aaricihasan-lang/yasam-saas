#!/usr/bin/env node
// ============================================================
// YEBS — Admin-only READ-ONLY uzman vitrini STATIK HARNESS
//
// Salt-okunur kaynak doğrulaması (production'a bağlanmaz). §29 kapsamı:
// card access, route guard, API security, visibility, DTO, UI (mutation yok),
// preview, search, evidence, security. Protected-SAME kontrolü ayrıca git ile
// yapılır (bu harness dosya-içeriği invariantlarına odaklanır).
// ============================================================
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
const fails = [];
function bad(name, detail) { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ""}`); }
function check(name, cond, detail) { if (cond) pass++; else bad(name, detail); }

function read(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}
/** Yorumları (// ve /* *​/) çıkarır — invariant'lar KOD üzerinde kontrol edilir,
 *  açıklayıcı yorumlardaki yasak kelimeler false-positive üretmesin. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
function walk(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const e of readdirSync(abs)) {
    const rel = `${dir}/${e}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------- A. Card access
{
  const page = read("app/page.tsx");
  check("A1 app/page.tsx okunuyor", page !== null);
  if (page) {
    check(
      "A2 YEBS kartı isAdminUser koşuluna sarılı",
      /isAdminUser\(user\)\s*\?\s*\(\s*<Link href="\/yebs" data-yebs-admin-card/s.test(page),
      "admin-only conditional bulunamadı",
    );
    check("A3 YEBS kartı /yebs'e yönlendiriyor", /href="\/yebs"/.test(page));
    check("A4 kart admin-only işaretli", /data-admin-only="true"/.test(page));
  }
  const perms = read("lib/auth/modulePermissions.ts");
  check("A5 modulePermissions okunuyor", perms !== null);
  if (perms) {
    // Yeni `yebs` module permission key EKLENMEDİ (union'da yok).
    check(
      "A6 ModulePermissionKey union'a 'yebs' EKLENMEDİ",
      !/\|\s*["']yebs["']/.test(perms) && !/^\s*["']yebs["'],/m.test(perms),
      "'yebs' permission key bulundu (yasak)",
    );
  }
}

// ---------------------------------------------------------------- B. Route guard
{
  const g = read("lib/auth/routeModuleAccess.ts");
  check("B1 routeModuleAccess okunuyor", g !== null);
  if (g) {
    check("B2 ADMIN_ONLY_ROUTE_PREFIXES /yebs içerir", /ADMIN_ONLY_ROUTE_PREFIXES\s*=\s*\[\s*"\/yebs"/.test(g));
    check("B3 isAdminOnlyRoutePath tanımlı", /function isAdminOnlyRoutePath/.test(g));
    check("B4 canExpertAccessRoutePath admin-only → false", /isAdminOnlyRoutePath\(pathname\)\)\s*return false/.test(g));
    check("B5 evaluateRouteModuleGuard admin-only → deny", /isAdminOnlyRoutePath\(path\)\)\s*return "deny"/.test(g));
  }
}

// ---------------------------------------------------------------- C. API security
{
  const apiFiles = walk("app/api/yebs").filter((f) => f.endsWith("route.ts"));
  check("C1 en az 10 read route var", apiFiles.length >= 10, `bulunan: ${apiFiles.length}`);
  const MUT = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/;
  for (const f of apiFiles) {
    const src = read(f);
    check(`C2 ${f} verifyAdminRequest kullanıyor`, /verifyAdminRequest/.test(src));
    check(`C3 ${f} GET export ediyor`, /export\s+async\s+function\s+GET\b/.test(src));
    check(`C4 ${f} mutation method YOK`, !MUT.test(src));
    check(`C5 ${f} admin mutation servisi import ETMİYOR`, !/service\/\w*(Mutations|Transitions)/.test(src));
    check(`C6 ${f} service_role anahtarı doğrudan okumuyor`, !/SERVICE_ROLE|createClient\s*\(/.test(stripComments(src)));
  }
}

// ---------------------------------------------------------------- D. Visibility
{
  const v = read("lib/yebs/showcase/visibility.ts");
  check("D1 visibility okunuyor", v !== null);
  if (v) {
    check("D2 default published-only", /view === "published"\)\s*return status === "published"/.test(v));
    check("D3 preview archived hariç", /return status !== "archived"/.test(v));
    check("D4 evidence rejected hariç", /verificationStatus !== "rejected"/.test(v));
  }
  // Route'lar published görünümünde status:'published' geçiyor.
  for (const f of walk("app/api/yebs").filter((x) => x.endsWith("route.ts"))) {
    const src = read(f);
    if (/listTraditions|listConcepts|listSources|listClaims|listConceptRelations/.test(src)) {
      check(`D5 ${f} published filtre uyguluyor`, /view === "published".*status: "published"/s.test(src));
    }
  }
}

// ---------------------------------------------------------------- E. Stripped DTO
{
  const dto = read("lib/yebs/showcase/dto.ts");
  const api = read("app/yebs/yebsShowcaseApi.ts");
  check("E1 dto okunuyor", dto !== null);
  const dtoCode = dto ? stripComments(dto) : "";
  const apiCode = api ? stripComments(api) : "";
  const FORBIDDEN = ["expected_updated_at", "updated_at", "created_at", "request_id", "operation_id", "blocker"];
  for (const tok of FORBIDDEN) {
    check(`E2 DTO'da '${tok}' YOK (kod)`, dto && !dtoCode.includes(tok), "internal alan sızıntısı");
    check(`E3 client API'de '${tok}' YOK (kod)`, api && !apiCode.includes(tok), "internal alan sızıntısı");
  }
}

// ---------------------------------------------------------------- F. UI: mutation/action yok
{
  const uiFiles = walk("app/yebs");
  const ACTION = /(method:\s*["'](POST|PATCH|PUT|DELETE)["'])/;
  const BTN_ACTIONS = />\s*(Kaydet|Düzenle|Sil|Doğrula|Onayla|Yayınla|Arşivle)\s*</;
  for (const f of uiFiles) {
    const src = read(f);
    check(`F1 ${f} mutation fetch yok`, !ACTION.test(src));
    check(`F2 ${f} admin aksiyon butonu yok`, !BTN_ACTIONS.test(src));
    check(`F3 ${f} /api/admin/yebs çağırmıyor`, !src.includes("/api/admin/yebs"));
    check(`F4 ${f} service_role yok (kod)`, !/service_role|SERVICE_ROLE/.test(stripComments(src)));
  }
  const api = read("app/yebs/yebsShowcaseApi.ts");
  check("F5 client API yalnız GET", api && !/method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(api));
  check("F6 client BASE = /api/yebs", api && /const BASE = "\/api\/yebs"/.test(api));
}

// ---------------------------------------------------------------- G. Preview
{
  const ui = read("app/yebs/components/ui.tsx");
  check("G1 preview badge metni exact", ui && ui.includes('PREVIEW_BADGE_TEXT = "Önizleme — Yayınlanmamış"'));
  const shell = read("app/yebs/components/YebsShell.tsx");
  check("G2 preview banner metni var", shell && shell.includes("Önizleme Modu — Yayınlanmamış YEBS kayıtları"));
}

// ---------------------------------------------------------------- H. Search
{
  const home = read("app/yebs/page.tsx");
  check("H1 home paralel çoklu arama (4 entity)", home &&
    /listTraditions\(\{ q: term/.test(home) &&
    /listConcepts\(\{ q: term/.test(home) &&
    /listSources\(\{ q: term/.test(home) &&
    /listClaims\(\{ q: term/.test(home));
  check("H2 relations metin aramasına dahil değil", home && !/listRelations\(\{ q:/.test(home));
  check("H3 yeni global search endpoint YOK", !existsSync(join(ROOT, "app/api/yebs/search")));
}

// ---------------------------------------------------------------- I. Evidence
{
  const ent = read("app/yebs/components/entities.tsx");
  check("I1 evidence ham verification_status göstermiyor", ent && !/verificationStatus|verification_status/.test(ent));
  check("I2 contradiction rozet gösteriliyor", ent && /isContradiction/.test(ent));
  const claimRoute = read("app/api/yebs/claims/[id]/route.ts");
  check("I3 claim evidence rejected eliyor", claimRoute && /isEvidenceVisible\(e\.verification_status\)/.test(claimRoute));
  const relRoute = read("app/api/yebs/relations/[id]/route.ts");
  check("I4 relation evidence rejected eliyor", relRoute && /isEvidenceVisible\(e\.verification_status\)/.test(relRoute));
}

// ---------------------------------------------------------------- Sonuç
console.log(`\nYEBS Showcase Harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("\nFAIL detayları:");
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("OVERALL: PASS");
