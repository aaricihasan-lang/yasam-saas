/**
 * FAZ1 FINAL HARDENING — PAKET AUTH (route alt-kümesi) statik sözleşme harness'i.
 *
 * Kapsam: belge çeviri history/job-status (header kimliği + sahiplik), AI uçları admin-only
 * (belge_ceviri_ai / ders_notu), pdf-to-word uzmanda, Hacamat GET guard + rate limit,
 * rapor sayfası kimlikli fetch→blob, demo-analiz verifyUserRequest, cosmic/audit admin-only,
 * dijital içerik hub + belge sayfası AI kart gizleme.
 *
 * DB/ağ YOK. Çalıştır: npx tsx scripts/final-hardening/auth-routes.harness.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Yorum satırlarını at (yorumdaki kelimeler sahte pozitif üretmesin). */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

/** GET handler gövdesini döndürür (bir sonraki `export async function`'a kadar). */
function handlerBody(src: string, method: string): string {
  const i = src.indexOf(`export async function ${method}(`);
  if (i < 0) return "";
  const j = src.indexOf("export async function", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

console.log("\n── belge-ceviri history / job-status (header kimliği + sahiplik) ──");
for (const f of ["app/api/belge-ceviri/history/route.ts", "app/api/belge-ceviri/job-status/[id]/route.ts"]) {
  const s = code(f);
  const n = f.includes("history") ? "history" : "job-status";
  ok(/verifyUserRequest\(request\)/.test(s), `${n}: verifyUserRequest ile header kimliği`);
  ok(!/searchParams/.test(s), `${n}: query param (userId/tenantId) OKUNMAZ`);
  ok(/\.eq\("tenant_id", guard\.tenantId\)/.test(s) && /\.eq\("user_id", guard\.userId\)/.test(s), `${n}: guard.tenantId + guard.userId sahiplik filtresi`);
  ok(!/error\.message|err\.message|String\(err\)/.test(s), `${n}: ham hata mesajı sızmaz`);
  ok(!/assertUserModuleAccess|requireModuleAccess/.test(s), `${n}: üyelik kapısı YOK (üyeliği biten uzman kendi çıktısını indirir)`);
  ok(/createSignedUrl/.test(s), `${n}: imzalı URL davranışı korunur`);
}
const js = code("app/api/belge-ceviri/job-status/[id]/route.ts");
ok(/status: 404/.test(js) && /maybeSingle\(\)/.test(js), "job-status: başka kullanıcı/tenant job → 404");

console.log("\n── AI uçları admin-only ──");
for (const f of [
  "app/api/belge-ceviri/ocr/route.ts",
  "app/api/belge-ceviri/ocr-to-word/route.ts",
  "app/api/belge-ceviri/pdf-to-turkce-word/route.ts",
]) {
  ok(/requireDigitalContentUser\(request, "belge_ceviri_ai"\)/.test(code(f)), `${f.split("/").slice(-2, -1)[0]}: belge_ceviri_ai kapısı`);
}
ok(/requireDigitalContentUser\(request, "belge_ceviri"\)/.test(code("app/api/belge-ceviri/pdf-to-word/route.ts")), "pdf-to-word: belge_ceviri (uzmanda KALIR)");
for (const f of ["app/api/ders-notu/temizle/route.ts", "app/api/ders-notu/to-word/route.ts"]) {
  ok(/requireDigitalContentUser\(request, "ders_notu"\)/.test(code(f)), `${f.split("/").slice(-2, -1)[0]}: ders_notu kapısı (core'da admin-only)`);
}
// inngest pdf çeviri kuyruğu yalnız guard'lı route'tan tetiklenir
const pdfTr = code("app/api/belge-ceviri/pdf-to-turkce-word/route.ts");
ok(pdfTr.indexOf("requireDigitalContentUser(") > 0 && pdfTr.indexOf("requireDigitalContentUser(") < pdfTr.indexOf("inngest.send("), "pdf-to-turkce-word: inngest.send guard'dan SONRA");
// Çekirdek kararı (parent'ın core değişikliği ile sözleşme)
const expertPerms = { belge_ceviri: true, video_ceviri: true, ders_notu: true, belge_ceviri_ai: true };
ok(resolveModuleAccess("expert", expertPerms, "belge_ceviri_ai") === false, "core: uzman belge_ceviri_ai → false (bayrak olsa da)");
ok(resolveModuleAccess("expert", expertPerms, "belge_ceviri") === true, "core: uzman belge_ceviri (pdf-to-word) → true");
ok(resolveModuleAccess("admin", {}, "belge_ceviri_ai") === true, "core: admin belge_ceviri_ai → true");
ok(resolveModuleAccess("expert", expertPerms, "ders_notu") === false, "core: uzman ders_notu → false");

console.log("\n── İstemci: AI kartları admin dışına gizli ──");
const bc = code("app/belge-ceviri/page.tsx");
ok(/AI_CARD_IDS/.test(bc) && /isAdmin \|\| !AI_CARD_IDS\.has\(card\.id\)/.test(bc), "belge-ceviri: OCR / PDF→Türkçe Word kartları yalnız admin");
ok(/"pdf-to-turkce-word", "pdf-to-turkce-pdf", "ocr"/.test(bc) && !/AI_CARD_IDS = new Set<CardId>\(\[[^\]]*"pdf-to-word"/.test(bc), "belge-ceviri: pdf-to-word AI setinde DEĞİL");
ok(!/\/api\/belge-ceviri\/history\s*`\s*\+/.test(bc) && !/\?tenantId=/.test(bc) && !/&userId=/.test(bc), "belge-ceviri: history/job-status query param göndermez");
ok(/fetch\(`\/api\/belge-ceviri\/history`, \{\s*headers: authHeaders\(\)/.test(bc), "belge-ceviri: history auth header ile");
ok(/job-status\/\$\{encodeURIComponent\(activeJob\.jobId\)\}`, \{\s*headers: authHeaders\(\)/.test(bc), "belge-ceviri: job-status auth header ile");
const hubPath = "app/digital-content/DigitalContentModuleGrid.tsx";
const hub = existsSync(join(ROOT, hubPath)) ? code(hubPath) : "";
// Owner kararı (üye yönetimi final): kartlar gerçek izinden türetilir (lib/auth/hubVisibility);
// video_ceviri/ders_notu admin-only anahtar → uzmanda bayraktan bağımsız görünmez.
const hubVis = code("lib/auth/hubVisibility.ts");
ok(/id: "video_ceviri", href: "\/video-ceviri"/.test(hubVis) && /id: "ders_notu", href: "\/ders-notu"/.test(hubVis) && /isAdminOnlyModuleKey/.test(hubVis), "hub: video + ders notu admin-only anahtarlarla (hubVisibility)");
ok(/canSeeHubChild\(user, child\)/.test(hub) && /syncYasamUserFromDb/.test(hub) && !/adminOnly/.test(hub), "hub: kartlar izinden türetilir, admin olmayana AI kartları gösterilmez");
ok(/<DigitalContentModuleGrid \/>/.test(code("app/digital-content/page.tsx")), "hub sayfası grid bileşenini kullanır");

console.log("\n── Hacamat rapor GET guard + rate limit ──");
for (const [f, key] of [
  ["app/api/hacamat/pdf-report/route.ts", "hacamat-pdf"],
  ["app/api/hacamat/word-report/route.ts", "hacamat-word"],
] as const) {
  const g = handlerBody(code(f), "GET");
  const guardAt = g.indexOf('requireModuleAccess(request as unknown as NextRequest, "cosmic_calendar")');
  const workAt = Math.min(
    ...[g.indexOf("searchParams"), g.indexOf("buildPdfBuffer"), g.indexOf("buildWordBuffer")].filter((x) => x >= 0),
  );
  ok(guardAt > 0 && guardAt < workAt, `${key} GET: requireModuleAccess iş başlamadan ÖNCE`);
  ok(/if \(!guard\.ok\) return guard\.response;/.test(g), `${key} GET: guard reddi döner`);
  ok(new RegExp(`checkRateLimit\\(\`${key}:\\$\\{guard\\.tenantId\\}\``).test(g) && /status: 429/.test(g), `${key} GET: POST ile aynı rate limit (429)`);
}
const rp = code("app/cosmic-calendar/hacamat/report/page.tsx");
ok(!/href=\{(pdfViewUrl|pdfDlUrl|wordDlUrl)\}/.test(rp) && !/data=\{pdfViewUrl\}/.test(rp) && !/<iframe[^>]*\/api\/hacamat/.test(rp) && !/<a[^>]*href=["'`{][^>]*\/api\/hacamat/.test(rp), "rapor sayfası: /api/hacamat'a iframe/object/<a href> YOK");
ok(/fetch\(pdfViewUrl, \{ headers: authHeaders\(\)/.test(rp) && /URL\.createObjectURL\(blob\)/.test(rp) && /URL\.revokeObjectURL\(createdUrl\)/.test(rp), "rapor sayfası: kimlikli fetch → blob → object URL (+revoke)");
ok(/downloadFileResponse\(res,/.test(rp), "rapor sayfası: indirme downloadFileResponse ile");
ok(/"x-session-token"/.test(rp) && /"x-user-id"/.test(rp), "rapor sayfası: x-user-id + x-session-token header");

console.log("\n── P3: demo-analiz + cosmic/audit ──");
const da = code("app/api/numeroloji/demo-analiz/route.ts");
ok(/verifyUserRequest\(request\)/.test(da), "demo-analiz: verifyUserRequest");
ok(!/body\??\.userId|request\.json\(\)/.test(da), "demo-analiz: body.userId OKUNMAZ");
ok(/guard\.is_demo_account/.test(da) && /demo_numerology_ip_usage/.test(da) && /hashIp\(ip, pepper\)/.test(da), "demo-analiz: demo bayrağı guard'dan + IP-hash kota korunur");
const na = code("app/numeroloji/analiz/page.tsx");
ok(/"\/api\/numeroloji\/demo-analiz"[\s\S]{0,300}"x-session-token": readSessionToken\(\)/.test(na), "numeroloji analiz istemcisi: demo-analiz'e auth header gönderir");
const auditPath = "app/api/cosmic/audit/route.ts";
if (existsSync(join(ROOT, auditPath))) {
  const au = code(auditPath);
  const gGet = handlerBody(au, "GET");
  ok(/requireAdminUserRequest\(request\)/.test(gGet), "cosmic/audit: admin-only (requireAdminUserRequest)");
  ok(/NODE_ENV === "production"/.test(gGet), "cosmic/audit: production'da 404 korunur");
} else {
  ok(true, "cosmic/audit: route kaldırıldı");
}

console.log(`\nauth-routes harness: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
