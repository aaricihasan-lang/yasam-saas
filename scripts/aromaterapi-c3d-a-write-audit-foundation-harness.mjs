// ============================================================
// Aromaterapi C3D-A — Ortak write/audit/tombstone TEMELİ sözleşme harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB/Supabase'e bağlanmaz, mutation yapmaz, SQL çalıştırmaz.
// Migration yapısı, privilege modeli, veri minimizasyonu, server write foundation ve
// UI form primitiflerini + C3D-A kapsam sınırlarını doğrular. FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let pass = 0;
let fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function has(rel) { return existsSync(resolve(ROOT, rel)); }
function read(rel) { const p = resolve(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }

// Migration dosyasını bul (C3D-A tek migration).
const MIG_DIR = "supabase/migrations";
const migFiles = existsSync(resolve(ROOT, MIG_DIR))
  ? readdirSync(resolve(ROOT, MIG_DIR)).filter((f) => /content_audit_foundation\.sql$/.test(f))
  : [];
const MIG_REL = migFiles.length ? `${MIG_DIR}/${migFiles[0]}` : "";
const MIG = MIG_REL ? read(MIG_REL) : "";

const WVAL = read("lib/aromaterapi/service/writeValidation.ts");
const WERR = read("lib/aromaterapi/service/writeErrors.ts");
const WTYPES = read("lib/aromaterapi/writeTypes.ts");
const SHELL = read("app/aromaterapi/_components/write/AromaterapiFormShell.tsx");
const DIALOG = read("app/aromaterapi/_components/write/AromaterapiConfirmDialog.tsx");
const DIRTY = read("app/aromaterapi/_components/write/useAromaterapiDirtyGuard.ts");

// ============================================================
console.log("\n[C3D-A-1] Migration yapısı");
// ============================================================
check("M00 tek content_audit_foundation migration", migFiles.length === 1, `bulunan: ${migFiles.length}`);
check("M01 audit tablosu", /CREATE TABLE public\.aromatherapy_content_audit_events\b/.test(MIG));
check("M02 tombstone tablosu", /CREATE TABLE public\.aromatherapy_content_delete_tombstones\b/.test(MIG));
check("M03 audit ve tombstone AYRI (iki CREATE TABLE)",
  (MIG.match(/CREATE TABLE public\.aromatherapy_content_/g) || []).length === 2);
// Zorunlu audit kolonları
for (const col of ["entity_type", "entity_id", "actor_user_id", "actor_label_snapshot", "operation", "reason", "previous_summary", "new_summary", "previous_content_hash", "new_content_hash", "warnings", "correlation_id"]) {
  check(`M04 audit kolon: ${col}`, new RegExp(`\\b${col}\\b`).test(MIG));
}
for (const col of ["deletion_mode", "identity_summary", "content_hash"]) {
  check(`M05 tombstone kolon: ${col}`, new RegExp(`\\b${col}\\b`).test(MIG));
}
check("M06 entity_type allowlist (8 değer, claim YOK)",
  /entity_type IN \(/.test(MIG) &&
  ["plant_taxon", "preparation", "preparation_method", "source", "source_passage", "passage_translation", "editorial_note", "glossary_term"].every((v) => MIG.includes(`'${v}'`)) &&
  !/'claim'/.test(MIG));
check("M07 operation allowlist create|update|delete",
  /operation IN \(\s*'create',\s*'update',\s*'delete'\s*\)/.test(MIG));
check("M08 deletion_mode allowlist single|bulk|purge",
  /deletion_mode IN \(\s*'single',\s*'bulk',\s*'purge'\s*\)/.test(MIG));
check("M09 update/delete state coupling (reason zorunlu)",
  /operation = 'update' AND previous_summary IS NOT NULL AND reason IS NOT NULL/.test(MIG) &&
  /operation = 'delete' AND previous_summary IS NOT NULL AND reason IS NOT NULL/.test(MIG));
check("M10 tombstone reason NOT NULL + non-empty",
  /reason\s+text\s+NOT NULL/.test(MIG) && /btrim\(reason\) <> ''/.test(MIG));
check("M11 lowercase SHA-256 hash biçimi", (MIG.match(/\^\[0-9a-f\]\{64\}\$/g) || []).length >= 3);
check("M12 JSON object/array kontrolleri",
  /jsonb_typeof\((previous_summary|new_summary|identity_summary)\) = 'object'/.test(MIG) &&
  /jsonb_typeof\(warnings\) = 'array'/.test(MIG));
check("M13 append-only trigger (BEFORE UPDATE OR DELETE, iki tablo)",
  (MIG.match(/BEFORE UPDATE OR DELETE ON public\.aromatherapy_content_/g) || []).length === 2);
check("M14 immutable fonksiyon tüm rollerden REVOKE",
  /REVOKE ALL ON FUNCTION public\.aromatherapy_content_audit_forbid_mutation\(\) FROM service_role/.test(MIG));
check("M15 RLS ENABLE (iki tablo)",
  (MIG.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 2);
check("M16 entity'ye FK YOK (REFERENCES yok)", !/REFERENCES/.test(MIG));

// ============================================================
console.log("\n[C3D-A-2] Privilege modeli");
// ============================================================
check("P01 anon/authenticated/PUBLIC REVOKE (iki tablo)",
  (MIG.match(/REVOKE ALL PRIVILEGES ON TABLE public\.aromatherapy_content_[a-z_]+ +FROM anon, authenticated, PUBLIC/g) || []).length === 2);
check("P02 service_role REVOKE ALL + yalnız SELECT (iki tablo)",
  (MIG.match(/REVOKE ALL PRIVILEGES ON TABLE public\.aromatherapy_content_[a-z_]+ +FROM service_role/g) || []).length === 2 &&
  (MIG.match(/GRANT SELECT ON TABLE public\.aromatherapy_content_[a-z_]+ +TO service_role/g) || []).length === 2);
check("P03 service_role'a INSERT/UPDATE/DELETE GRANT YOK",
  !/GRANT (INSERT|UPDATE|DELETE|ALL)[^\n]*content_(audit_events|delete_tombstones)[^\n]*TO service_role/.test(MIG));
check("P04 generic public audit/tombstone INSERT RPC YOK",
  !/CREATE (OR REPLACE )?FUNCTION[^\n]*(audit_insert|tombstone_insert|content_write)/i.test(MIG));
// SQL yorumlarını (-- satırları) çıkar: açıklayıcı sınır notları (ör. "claim audit'e
// dokunulmaz") yakalanmasın; yalnız gerçek DDL ifadeleri denetlenir.
const MIG_SQL = MIG.replace(/^\s*--[^\n]*$/gm, "");
check("P05 mevcut claim audit'e DOKUNULMADI (DDL)", !/aromatherapy_claim_audit_events/.test(MIG_SQL));
check("P06 mevcut entity privilege'ları DEĞİŞMEDİ (DDL'de entity tablo adı yok)",
  !/aromatherapy_(claims|plant_taxa|preparations|sources|source_passages|passage_translations|passage_editorial|glossary_terms)\b/.test(MIG_SQL));

// ============================================================
console.log("\n[C3D-A-3] Veri minimizasyonu");
// ============================================================
check("D01 full-text içerik kolonu YOK",
  !/\b(original_text|translated_text|note_text|method_text|full_text)\b/.test(MIG));
check("D02 summary + hash modeli", /previous_summary/.test(MIG) && /content_hash/.test(MIG));
check("D03 özet boyut sınırı (data-min guard)",
  /char_length\((previous_summary|new_summary|identity_summary)::text\) <=/.test(MIG));
check("D04 audit ve tombstone ayrı tablo (tek birleşik değil)",
  /content_audit_events/.test(MIG) && /content_delete_tombstones/.test(MIG));

// ============================================================
console.log("\n[C3D-A-4] Server write foundation");
// ============================================================
check("S01 writeValidation server-only DEĞİL (pure)", WVAL !== "" && !/^import\s+["']server-only["']/m.test(WVAL));
check("S02 yasak tenant/actor alias listesi",
  /FORBIDDEN_IDENTITY_KEYS/.test(WVAL) &&
  ["tenant_id", "tenantId", "p_tenant_id", "actor_user_id", "actorUserId", "p_actor_user_id"].every((k) => WVAL.includes(`"${k}"`)));
check("S03 hasForbiddenIdentityKey", /export function hasForbiddenIdentityKey/.test(WVAL));
check("S04 create reason opsiyonel + update/delete zorunlu",
  /validateCreateReason/.test(WVAL) && /validateMandatoryReason/.test(WVAL));
check("S05 actor label fallback full_name→name→email",
  /resolveActorLabel/.test(WVAL) && /full_name/.test(WVAL) && /\.name/.test(WVAL));
check("S06 optimistic concurrency zaman damgası (strict)",
  /isValidExpectedUpdatedAt/.test(WVAL));
check("S07 writeErrors server-only", /^import\s+["']server-only["'];/m.test(WERR));
check("S08 stabil hata kodları + demo 403 + 404",
  /AROMA_WRITE_DEMO_FORBIDDEN/.test(WERR) && /AROMA_WRITE_NOT_FOUND/.test(WERR) && /writeForbiddenDemo/.test(WERR));
check("S09 ham DB hatası sızmaz (writeServerError console.error + stabil)",
  /AROMA_WRITE_FAILED/.test(WERR) && /console\.error/.test(WERR));
check("S10 out-of-tenant 404 (başarılı no-op YOK — Karar 12)",
  /404/.test(WERR) && /writeNotFound/.test(WERR));
check("S11 generic upsert/delete helper YOK",
  !/genericUpsert|genericDelete|function upsert|function del(ete)?\b/i.test(WVAL + WERR));
check("S12 writeTypes entity_type/operation/deletion_mode",
  /AROMATERAPI_CONTENT_ENTITY_TYPES/.test(WTYPES) && /AROMATERAPI_AUDIT_OPERATIONS/.test(WTYPES) && /AROMATERAPI_DELETION_MODES/.test(WTYPES));

// ============================================================
console.log("\n[C3D-A-5] UI form foundation");
// ============================================================
check("U01 FormShell reusable (create+edit mod)",
  /AromaterapiFormShell/.test(SHELL) && /mode:\s*AromaterapiFormMode/.test(SHELL));
check("U02 reason alanı (create ops / edit zorunlu)", /AromaterapiReasonField/.test(SHELL) && /required/.test(SHELL));
check("U03 demo read-only (kaydet gizli/pasif)", /isDemo/.test(SHELL));
check("U04 optimistic conflict durumu", /conflict/.test(SHELL));
check("U05 hata özeti erişilebilir (role=alert)", /role="alert"/.test(SHELL));
check("U06 44px hedefleri", /min-h-\[44px\]/.test(SHELL) && /min-h-\[44px\]/.test(DIALOG));
check("U07 focus-visible", /focus-visible:ring/.test(SHELL) && /focus-visible:ring/.test(DIALOG));
check("U08 label↔input (htmlFor)", /htmlFor=\{id\}/.test(SHELL));
check("U09 confirm dialog erişilebilir (role=dialog + aria-modal + Escape + focus trap)",
  /role="dialog"/.test(DIALOG) && /aria-modal="true"/.test(DIALOG) && /Escape/.test(DIALOG) && /Tab/.test(DIALOG));
check("U10 yıkıcı eylem varsayılan odaklı DEĞİL (Vazgeç odaklanır)",
  /cancelRef\.current\?\.focus\(\)/.test(DIALOG));
check("U11 dirty-state guard hook", /useAromaterapiDirtyGuard/.test(DIRTY) && /beforeunload/.test(DIRTY));
check("U12 gerçek mutation/fetch YOK (write bileşenleri)",
  !/\bfetch\s*\(|supabase|\.rpc\(/.test(SHELL + DIALOG + DIRTY));
check("U13 sahte/mock entity verisi YOK",
  !/mock|fixture|sampleEntity|dummy/i.test(SHELL + DIALOG + DIRTY));

// ============================================================
console.log("\n[C3D-A-6] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  changed = out.split("\n").map((l) => l.slice(3).trim()).filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l))
    .map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) { bad("SC00 git status alınamadı", String(e)); }

const migChanges = changed.filter((f) => f.startsWith("supabase/migrations/"));
const pkgChanges = changed.filter((f) => /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(f));
const c2sc2t = changed.filter((f) =>
  f === "lib/aromaterapi/service/claimMutations.ts" ||
  f.startsWith("app/api/aromaterapi/claims/"));
const c3cRead = changed.filter((f) => /lib\/aromaterapi\/service\/(catalog|source|claim|glossary)Reads\.ts$/.test(f));
const allowed = (f) =>
  f.startsWith("app/aromaterapi/") ||
  f.startsWith("lib/aromaterapi/") ||
  f.startsWith("supabase/migrations/") ||
  f.startsWith("scripts/aromaterapi-c3d-a-");
const outside = changed.filter((f) => !allowed(f));

check("SC01 tek migration değişikliği", migChanges.length === 1, migChanges.join(","));
check("SC02 package/lockfile değişikliği = 0", pkgChanges.length === 0, pkgChanges.join(","));
check("SC03 C2S/C2T claim dosyası değişmedi = 0", c2sc2t.length === 0, c2sc2t.join(","));
check("SC04 C3C read servisi değişmedi = 0", c3cRead.length === 0, c3cRead.join(","));
check("SC05 değişen dosyalar Aromaterapi kapsamında (Aromaterapi dışı 0)",
  outside.length === 0, outside.join(","));
check("SC06 entity writer RPC eklenmedi (create/update/delete claim-dışı RPC yok)",
  !/CREATE (OR REPLACE )?FUNCTION[^\n]*aromatherapy_(create|update|delete)_(plant|preparation|source|passage|translation|editorial|glossary)/i.test(MIG));

// ============================================================
console.log(`\n──────────── C3D-A HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("Başarısızlar:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("Tüm C3D-A temel sözleşme kontrolleri geçti.\n");
