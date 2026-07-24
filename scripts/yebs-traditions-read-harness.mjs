// ============================================================
// YEBS API-A0R — Traditions Salt-Okunur Admin API doğrulama harness'i
//
// SALT-OKUNUR. Hiçbir INSERT/UPDATE/DELETE/UPSERT/RPC çağrısı yapmaz.
//
// Bölümler:
//   A. Statik / kaynak sözleşmesi   (her zaman çalışır, bağımlılık yok)
//   B. Query / validation sözleşmesi (kaynak-metin denetimi)
//   C. Hata sözleşmesi               (kaynak-metin denetimi)
//   D. Canlı salt-okunur kontroller  (env/creds varsa; yoksa SKIP)
//
// PASS/FAIL/SKIP sayaçları tutulur. SKIP, PASS toplamına DAHİL DEĞİLDİR.
// Herhangi bir FAIL → process.exit(1).
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const P = {
  listRoute: resolve(ROOT, "app/api/admin/yebs/traditions/route.ts"),
  detailRoute: resolve(ROOT, "app/api/admin/yebs/traditions/[id]/route.ts"),
  service: resolve(ROOT, "lib/yebs/service/traditions.ts"),
};

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function ok(name) {
  pass++;
  console.log(`  PASS  ${name}`);
}
function bad(name, detail) {
  fail++;
  failures.push(name);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function skipped(name, why) {
  skip++;
  console.log(`  SKIP  ${name}${why ? ` — ${why}` : ""}`);
}
function check(name, cond, detail) {
  if (cond) ok(name);
  else bad(name, detail);
}

function read(path) {
  return readFileSync(path, "utf8");
}

// Kod-yapısı denetimleri açıklama/yorum metnini kapsamamalı (yorumda "tenantId"
// veya `select("*")` geçmesi ihlal değildir). Yorumları çıkarıp öyle bakarız.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // blok yorum
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // satır yorum (http:// yanlış eşleşmesini azaltır)
}

// ------------------------------------------------------------
// A. Statik / kaynak sözleşmesi
// ------------------------------------------------------------
console.log("\n[A] Statik / kaynak sözleşmesi");

let list = "";
let detail = "";
let svc = "";
try {
  list = read(P.listRoute);
  detail = read(P.detailRoute);
  svc = read(P.service);
  ok("üç kaynak dosyası okunabildi");
  // Yorumsuz kopyalar — yalnız kod-yapısı denetimleri için.
  var listCode = stripComments(list);
  var detailCode = stripComments(detail);
  var svcCode = stripComments(svc);
} catch (e) {
  bad("kaynak dosyaları okunamadı", String(e && e.message));
}

if (list && detail && svc) {
  // Collection route: GET + POST meşru (API-A0W audit'li create). Detail route:
  // yalnız GET. Diğer fiiller (PUT/PATCH/DELETE) her iki route'ta yasak; detail'de
  // POST de yasak.
  check("list route: GET export ediyor", /export\s+async\s+function\s+GET\s*\(/.test(list));
  check("list route: POST export ediyor (A0W create)", /export\s+async\s+function\s+POST\s*\(/.test(list));
  check("detail route: GET export ediyor", /export\s+async\s+function\s+GET\s*\(/.test(detail));
  for (const verb of ["PUT", "PATCH", "DELETE"]) {
    check(
      `list route: ${verb} export ETMİYOR`,
      !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(list),
    );
  }
  for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
    check(
      `detail route: ${verb} export ETMİYOR`,
      !new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(detail),
    );
  }

  // verifyAdminRequest kullanımı
  check("list route: verifyAdminRequest kullanıyor", /verifyAdminRequest\s*\(/.test(list));
  check("detail route: verifyAdminRequest kullanıyor", /verifyAdminRequest\s*\(/.test(detail));
  check("list route: guard başarısızlığında guard.response dönüyor", /return\s+guard\.response/.test(list));
  check("detail route: guard başarısızlığında guard.response dönüyor", /return\s+guard\.response/.test(detail));

  // runtime = nodejs
  check('list route: runtime = "nodejs"', /export\s+const\s+runtime\s*=\s*"nodejs"/.test(list));
  check('detail route: runtime = "nodejs"', /export\s+const\s+runtime\s*=\s*"nodejs"/.test(detail));

  // service: import "server-only"
  check('service: import "server-only" içeriyor', /^import\s+["']server-only["'];/m.test(svc));

  // İstemci Supabase importu YOK (@/lib/supabase — server hariç)
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    check(
      `${label}: istemci Supabase (@/lib/supabase) importu YOK`,
      !/from\s+["']@\/lib\/supabase["']/.test(src),
    );
  }
  // Route/service kendisi createClient çağırmıyor (yalnız guard.db kullanılır)
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    check(`${label}: createClient çağırmıyor`, !/createClient\s*\(/.test(src));
  }
  // Anon/publishable anahtar referansı YOK
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    check(
      `${label}: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY okumuyor`,
      !/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(src),
    );
  }

  // service_role env anahtarını DOĞRUDAN okumuyor
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    check(
      `${label}: SUPABASE_SERVICE_ROLE_KEY doğrudan okumuyor`,
      !/SUPABASE_SERVICE_ROLE_KEY/.test(src),
    );
  }

  // select("*") çağrısı yok (service açık kolon listesi). Yorumdaki `select("*")`
  // açıklaması ihlal değildir → yorumsuz koda ve `.select(` çağrı biçimine bakarız.
  check('service: .select("*") çağrısı YOK', !/\.select\(\s*["']\*["']/.test(svcCode));
  check("service: açık .select( kullanımı var", /\.select\(/.test(svcCode));
  check("service: açık kolon sabiti (YEBS_TRADITION_COLUMNS) var", /YEBS_TRADITION_COLUMNS/.test(svcCode));

  // tenantId KULLANILMIYOR (merkezî referans tablosu). Yorumdaki açıklama sayılmaz.
  for (const [label, src] of [["list route", listCode], ["detail route", detailCode], ["service", svcCode]]) {
    check(`${label}: kodda tenantId / tenant_id kullanmıyor`, !/tenant_?[Ii]d/.test(src));
  }

  // Yazma/RPC çağrısı YOK (salt-okunur güvence)
  for (const [label, src] of [["list route", list], ["detail route", detail], ["service", svc]]) {
    for (const op of ["insert", "update", "delete", "upsert", "rpc"]) {
      check(`${label}: .${op}( çağrısı YOK`, !new RegExp(`\\.${op}\\s*\\(`).test(src));
    }
  }

  // Doğru tabloya erişiyor
  check('service: yalnız yebs_traditions tablosuna erişiyor', /\.from\(\s*["']yebs_traditions["']\s*\)/.test(svc));
}

// ------------------------------------------------------------
// B. Query / validation sözleşmesi (kaynak-metin denetimi)
// ------------------------------------------------------------
console.log("\n[B] Query / validation sözleşmesi (kaynak-metin)");

if (list) {
  check("limit varsayılanı 50", /DEFAULT_LIMIT\s*=\s*50/.test(list));
  check("limit alt sınırı 1", /MIN_LIMIT\s*=\s*1/.test(list));
  check("limit üst sınırı 200", /MAX_LIMIT\s*=\s*200/.test(list));
  check(
    "limit sınır kontrolü mevcut (MIN/MAX + tam sayı)",
    /n\s*<\s*MIN_LIMIT\s*\|\|\s*n\s*>\s*MAX_LIMIT/.test(list) && /Number\.isInteger\(n\)/.test(list),
  );
  check("negatif offset reddi (n < 0)", /n\s*<\s*0/.test(list));
  check("status whitelist doğrulaması (YEBS_TRADITION_STATUSES.includes)", /YEBS_TRADITION_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes/.test(list));
  check("q trim ediliyor", /rawQ\.trim\(\)/.test(list));
  check("q 100 karakter sınırı (MAX_Q_LEN=100 + slice)", /MAX_Q_LEN\s*=\s*100/.test(list) && /\.slice\(0,\s*MAX_Q_LEN\)/.test(list));
  check("q filtre-özel karakter arındırması", /\.replace\(\/\[,\(\)\*%\]\/g,\s*""\)/.test(list));
}
if (detail) {
  check("detail: UUID doğrulaması (UUID_RE.test)", /UUID_RE\.test\(id\)/.test(detail));
  check("detail: UUID regex tanımı mevcut", /UUID_RE\s*=/.test(detail));
}

// ------------------------------------------------------------
// C. Hata sözleşmesi (kaynak-metin denetimi)
// ------------------------------------------------------------
console.log("\n[C] Hata sözleşmesi (kaynak-metin)");

// Stabil YEBS makine kodları. Route-üretimli validasyon kodları route'ta literal;
// DB-hata kodları (LIST_FAILED / READ_FAILED) servis union'ında üretilir ve route
// tarafından `code: result.code` ile forward edilir (literal route'ta olmayabilir).
if (list) for (const c of ["YEBS_INVALID_LIMIT", "YEBS_INVALID_OFFSET", "YEBS_INVALID_STATUS"]) {
  check(`list: kod ${c} route'ta literal mevcut`, list.includes(c));
}
if (list) check("list: servis kodunu forward ediyor (code: result.code)", /code:\s*result\.code/.test(list));

if (detail) for (const c of ["YEBS_INVALID_TRADITION_ID", "YEBS_TRADITION_NOT_FOUND"]) {
  check(`detail: kod ${c} route'ta literal mevcut`, detail.includes(c));
}
if (detail) check("detail: servis kodunu forward ediyor (code: result.code)", /code:\s*result\.code/.test(detail));

if (svc) {
  check("service: YEBS_TRADITIONS_LIST_FAILED kod sabiti mevcut", svc.includes("YEBS_TRADITIONS_LIST_FAILED"));
  check(
    "service: YEBS_TRADITION_NOT_FOUND + READ_FAILED kod sabitleri mevcut",
    svc.includes("YEBS_TRADITION_NOT_FOUND") && svc.includes("YEBS_TRADITION_READ_FAILED"),
  );
}

// Ham error.message ISTEMCIYE gönderilmiyor:
//  - route dosyalarında error.message HİÇ geçmemeli
//  - service'te error.message YALNIZCA console.error satırında olmalı (server log)
if (list) check("list route: ham error.message YOK", !/error\.message/.test(list));
if (detail) check("detail route: ham error.message YOK", !/error\.message/.test(detail));
if (svc) {
  const svcLines = svc.split(/\r?\n/);
  const leakLines = svcLines.filter((l) => l.includes("error.message") && !l.includes("console.error"));
  check("service: error.message yalnız console.error (server log) satırında", leakLines.length === 0, leakLines.join(" | "));
  // İstemciye dönen sonuç union'ında ham metin alanı yok — yalnız `code`.
  check("service: dönüş union'ı ham `error:` metni taşımıyor (yalnız code)", !/return\s*\{\s*ok:\s*false,\s*error:/.test(svc));
}

// ------------------------------------------------------------
// D. Canlı salt-okunur kontroller (env/creds varsa; yoksa SKIP)
// ------------------------------------------------------------
console.log("\n[D] Canlı salt-okunur kontroller");

const BASE_URL = process.env.YEBS_HARNESS_BASE_URL; // ör. http://localhost:3000
const ADMIN_ID = process.env.YEBS_HARNESS_ADMIN_ID;
const SESSION_TOKEN = process.env.YEBS_HARNESS_SESSION_TOKEN;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// D1-D4: HTTP uçları — base URL + admin session gerekli
if (!BASE_URL) {
  skipped("canlı HTTP list/detail kontrolleri", "YEBS_HARNESS_BASE_URL yok");
} else {
  const listUrl = `${BASE_URL.replace(/\/$/, "")}/api/admin/yebs/traditions`;
  const detailUrl = `${listUrl}/00000000-0000-4000-8000-000000000000`;

  // header eksik → 401 (auth verisi olmadan da test edilebilir)
  try {
    const r = await fetch(listUrl);
    check("list GET header eksik → 401", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("list GET header eksik → 401", `fetch hatası: ${String(e && e.message)}`);
  }
  try {
    const r = await fetch(detailUrl);
    check("detail GET header eksik → 401", r.status === 401, `status=${r.status}`);
  } catch (e) {
    skipped("detail GET header eksik → 401", `fetch hatası: ${String(e && e.message)}`);
  }

  if (!ADMIN_ID || !SESSION_TOKEN) {
    skipped("geçerli admin header ile list GET → 200", "admin session credentials unavailable");
    skipped("rastgele geçerli UUID detail GET → 404", "admin session credentials unavailable");
  } else {
    const h = { "x-admin-id": ADMIN_ID, "x-session-token": SESSION_TOKEN };
    try {
      const r = await fetch(listUrl, { headers: h });
      const body = await r.json().catch(() => ({}));
      check("geçerli admin header ile list GET → 200", r.status === 200 && body.ok === true, `status=${r.status}`);
    } catch (e) {
      skipped("geçerli admin header ile list GET → 200", `fetch hatası: ${String(e && e.message)}`);
    }
    try {
      const r = await fetch(detailUrl, { headers: h });
      check("rastgele geçerli UUID detail GET → 404", r.status === 404, `status=${r.status}`);
    } catch (e) {
      skipped("rastgele geçerli UUID detail GET → 404", `fetch hatası: ${String(e && e.message)}`);
    }
  }
}

// D5: anon Supabase client ile doğrudan yebs_traditions SELECT → erişim yok (RLS)
if (!SUPA_URL || !ANON_KEY) {
  skipped("anon Supabase SELECT yebs_traditions → erişim yok", "NEXT_PUBLIC_SUPABASE_URL / anon key yok");
} else {
  let createClient = null;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    createClient = null;
  }
  if (!createClient) {
    skipped("anon Supabase SELECT yebs_traditions → erişim yok", "@supabase/supabase-js import edilemedi (node_modules yok)");
  } else {
    try {
      const anon = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } });
      // SALT-OKUNUR select — mutasyon yok.
      const { data, error } = await anon.from("yebs_traditions").select("id").limit(1);
      const denied = !!error || !data || data.length === 0;
      check(
        "anon Supabase SELECT yebs_traditions → erişim yok (RLS/REVOKE)",
        denied,
        error ? `error=${error.message}` : `rows=${data ? data.length : "null"}`,
      );
    } catch (e) {
      skipped("anon Supabase SELECT yebs_traditions → erişim yok", `client hatası: ${String(e && e.message)}`);
    }
  }
}

// ------------------------------------------------------------
// Sonuç
// ------------------------------------------------------------
console.log(`\n== SONUC: ${pass} PASS / ${fail} FAIL / ${skip} SKIP ==`);
if (fail > 0) {
  console.log("Başarısız kontroller: " + failures.join(", "));
  process.exit(1);
}
process.exit(0);
