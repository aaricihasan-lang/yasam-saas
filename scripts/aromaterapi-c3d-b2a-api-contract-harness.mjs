// ============================================================
// Aromaterapi C3D-B2A — API/servis kontrat harness'i (STATİK, salt-okunur)
//
// Route + server-only servis dosyalarının güvenlik sözleşmesine uyduğunu doğrular:
// guard/demo/allowlist/forbidden-key (note_hash dahil)/body-limit/hata-eşleme/
// server-üretimli hash/ham DB metni sızmama. FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function read(rel) { const p = resolve(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }

const WRITE_ROUTES = [
  ["plant-taxa POST", "app/api/aromaterapi/plant-taxa/route.ts", "POST", "taxon"],
  ["plant-taxa PATCH", "app/api/aromaterapi/plant-taxa/[id]/route.ts", "PATCH", "taxon"],
  ["preparations POST", "app/api/aromaterapi/preparations/route.ts", "POST", "preparation"],
  ["preparations PATCH", "app/api/aromaterapi/preparations/[id]/route.ts", "PATCH", "preparation"],
  ["methods POST", "app/api/aromaterapi/preparations/[id]/methods/route.ts", "POST", "method"],
  ["revisions POST", "app/api/aromaterapi/methods/[seriesId]/revisions/route.ts", "POST", "method"],
  ["revision status PATCH", "app/api/aromaterapi/methods/[seriesId]/revisions/[revisionId]/route.ts", "PATCH", "status"],
];

const FORBIDDEN_IN_ALLOWLIST = ["note_hash", "canonical_name", "tenant_id", "actor", "user_id"];

// ============================================================
console.log("\n[B2A-API-A] Write route güvenlik sözleşmesi");
// ============================================================
for (const [label, rel, method, limit] of WRITE_ROUTES) {
  const src = read(rel);
  check(`${label}: dosya mevcut`, src.length > 0, rel);
  check(`${label}: runtime nodejs`, /runtime = "nodejs"/.test(src));
  check(`${label}: ${method} handler`, new RegExp(`export async function ${method}\\(`).test(src));
  check(`${label}: verifyUserRequest includeProfile`, /verifyUserRequest\(req, \{ includeProfile: true \}\)/.test(src));
  check(`${label}: demo → catalogDemoForbidden`, /is_demo_account\)\s*return catalogDemoForbidden\(\)/.test(src));
  check(`${label}: readJsonBounded + doğru limit`,
    new RegExp(`readJsonBounded\\(req, CATALOG_BODY_LIMITS\\.${limit}\\)`).test(src));
  check(`${label}: too_large → 413`, /too_large" \? catalogPayloadTooLarge\(\)/.test(src));
  check(`${label}: EXACT allowlist (keysAllowed)`, /keysAllowed\(obj, [A-Z_]+\)\) return catalogBad\("AROMA_WRITE_FORBIDDEN_FIELD"\)/.test(src));
  check(`${label}: emitCatalogWrite`, /emitCatalogWrite\(result,/.test(src));
  check(`${label}: actor server-resolved (resolveActorLabel)`, /resolveActorLabel\(guard\.profile, guard\.email\)/.test(src));
  // Yasak anahtar kontrolü YALNIZ allowlist Set literal(ler)i içinde (GET read-config sızıntısı hariç).
  const allowlistBlocks = (src.match(/new Set<string>\(\[[\s\S]*?\]\)/g) || []).join("\n");
  for (const f of FORBIDDEN_IN_ALLOWLIST) {
    check(`${label}: "${f}" allowlist'te YOK`, !new RegExp(`"${f}"`).test(allowlistBlocks), `"${f}" allowlist'te bulundu`);
  }
}

// Update/status route'ları expected_updated_at zorunlu + strict; append expected_latest_revision.
check("A-upd plant-taxa PATCH expected_updated_at strict",
  /isValidExpectedUpdatedAt/.test(read("app/api/aromaterapi/plant-taxa/[id]/route.ts")));
check("A-upd preparation PATCH expected_updated_at strict",
  /isValidExpectedUpdatedAt/.test(read("app/api/aromaterapi/preparations/[id]/route.ts")));
check("A-upd status PATCH expected_updated_at strict",
  /isValidExpectedUpdatedAt/.test(read("app/api/aromaterapi/methods/[seriesId]/revisions/[revisionId]/route.ts")));
check("A-app append expected_latest_revision integer guard",
  /Number\.isInteger\(expected\)/.test(read("app/api/aromaterapi/methods/[seriesId]/revisions/route.ts")));

// GET handler'lar KORUNDU (read sözleşmesine dokunulmadı).
check("A-get plant-taxa GET korundu", /export async function GET\(/.test(read("app/api/aromaterapi/plant-taxa/route.ts")));
check("A-get preparations GET korundu", /export async function GET\(/.test(read("app/api/aromaterapi/preparations/route.ts")));

// ============================================================
console.log("\n[B2A-API-B] Server-only mutation servisi");
// ============================================================
const MUT = read("lib/aromaterapi/service/catalogMethodMutations.ts");
check("B01 import server-only", /^import "server-only";/m.test(MUT));
check("B02 7 RPC adapter (db.rpc)",
  (MUT.match(/db\.rpc\("aromatherapy_/g) || []).length === 7,
  String((MUT.match(/db\.rpc\("aromatherapy_/g) || []).length));
check("B03 HTTP map: STALE→409, IDENTITY_LOCKED→409, FAITHFUL→422, FORBIDDEN_TRANSITION→422",
  /AROMA_STALE: 409/.test(MUT) && /AROMA_PREPARATION_IDENTITY_LOCKED: 409/.test(MUT) &&
  /AROMA_FAITHFUL_SOURCE_REQUIRED: 422/.test(MUT) && /AROMA_FORBIDDEN_STATUS_TRANSITION: 422/.test(MUT));
check("B04 HTTP map: NOT_FOUND→404 (parent/taxon/preparation/series/revision)",
  /AROMA_PARENT_NOT_FOUND: 404/.test(MUT) && /AROMA_TAXON_NOT_FOUND: 404/.test(MUT) &&
  /AROMA_SERIES_NOT_FOUND: 404/.test(MUT) && /AROMA_REVISION_NOT_FOUND: 404/.test(MUT));
check("B05 native SQLSTATE eşleme 23514/23505/23503",
  /"23514"\) return "AROMA_CHECK_VIOLATION"/.test(MUT) &&
  /"23505"\) return "AROMA_UNIQUE_VIOLATION"/.test(MUT) &&
  /"23503"\) return "AROMA_FK_VIOLATION"/.test(MUT));
check("B06 P0001 token EXACT Set.has (includes/regex YOK)", /RPC_P0001_CODES\.has\(message as CatalogMethodErrorCode\)/.test(MUT));
check("B07 note_hash yalnız server üretimli (computeMethodNoteHash)",
  /computeMethodNoteHash\(content\)/.test(MUT) && /p_note_hash: computeMethodNoteHash/.test(MUT));
check("B08 note_hash input'tan ALINMAZ (MethodRevisionInput'ta note_hash yok)",
  !/note_hash\??\s*:/.test(MUT.replace(/p_note_hash/g, "")));
check("B09 ham DB metni sızmaz (yalnız stabil code döner)",
  /return \{ ok: false, code: classifyCatalogMethodRpcError\(error\) \}/.test(MUT) &&
  !/error\.message \}/.test(MUT));

// ============================================================
console.log("\n[B2A-API-C] Canonical hash + bounded body");
// ============================================================
const CANON = read("lib/aromaterapi/service/methodCanonical.ts");
check("C01 SHA-256 hex (node:crypto)", /createHash\("sha256"\)[\s\S]{0,160}digest\("hex"\)/.test(CANON));
check("C02 pgcrypto/digest extension YOK", !/pgcrypto/.test(CANON));
check("C03 yalnız 14 içerik alanı (kimlik/denetim hariç)",
  !/tenant_id|series_id|created_at|updated_at|actor|reason|status/.test(CANON.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")));
const RB = read("lib/aromaterapi/service/requestBody.ts");
check("C04 requestBody server-only + byte limit + too_large",
  /^import "server-only";/m.test(RB) && /Buffer\.byteLength\(raw, "utf8"\) > maxBytes/.test(RB) && /"too_large"/.test(RB));
check("C05 body limitleri 16/16/64/8 KiB",
  /taxon: 16 \* 1024/.test(read("lib/aromaterapi/service/catalogWriteHttp.ts")) &&
  /preparation: 16 \* 1024/.test(read("lib/aromaterapi/service/catalogWriteHttp.ts")) &&
  /method: 64 \* 1024/.test(read("lib/aromaterapi/service/catalogWriteHttp.ts")) &&
  /status: 8 \* 1024/.test(read("lib/aromaterapi/service/catalogWriteHttp.ts")));

console.log(`\n──────────── C3D-B2A API HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) { console.log("Başarısızlar:\n  - " + failures.join("\n  - ")); process.exit(1); }
console.log("Tüm C3D-B2A API/servis kontrol kontrolleri geçti.\n");
