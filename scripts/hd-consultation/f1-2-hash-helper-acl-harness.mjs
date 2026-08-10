/**
 * HD Danışmanlık F1.2 · Hash Helper EXECUTE ACL Kilidi — statik & regresyon harness
 * ================================================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Yeni additif corrective migration SQL metni +
 * F1/F1.1 merged migration'ların DEĞİŞMEZLİĞİ (LF-normalize sha256) denetlenir.
 *
 * ROOT CAUSE (production doğrulandı): 20260925000000 foundation, internal-only
 *   yardımcı fonksiyon hd_consultation_canonical_hash(uuid) için EXECUTE'u yalnız
 *   PUBLIC/anon/authenticated'tan REVOKE etti; service_role'dan REVOKE ETMEDİ.
 *   Supabase default-grant'ı service_role EXECUTE'unu açık bıraktı → POST-APPLY D8
 *   violation=1. Bu harness, helper != mutation RPC ACL sözleşmesini açık contract
 *   ve regresyon olarak sabitler. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/f1-2-hash-helper-acl-harness.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const FIX  = "supabase/migrations/20260928000000_hd_consultation_hash_helper_acl_fix.sql";
const FDN  = "supabase/migrations/20260925000000_hd_consultation_layer_foundation.sql";
const COR  = "supabase/migrations/20260926000000_hd_consultation_create_bundle_fix.sql";

const FDN_SHA = "604f12ce61c054f071f47ecf1a19a1dbcc8e9fb1b3e60a71eee2ab521fcd7d9e";
const COR_SHA = "af072e5a26ddda624b2354fb316a83cfb912b0ac4ae8f740e6ed75f8c815f481";
const RPCS = [
  "rpc_hd_consultation_create", "rpc_hd_consultation_update", "rpc_hd_consultation_publish",
  "rpc_hd_consultation_archive", "rpc_hd_consultation_entitlement_grant",
  "rpc_hd_consultation_entitlement_revoke",
];

// LF-normalize sha256 (working tree CRLF olabilir; kanonik blob LF'tir)
const shaLF = (p) => createHash("sha256").update(readFileSync(`${ROOT}/${p}`, "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");

const fixRaw = readFileSync(`${ROOT}/${FIX}`, "utf8");
const fix = fixRaw.replace(/^\s*--.*$/gm, "");                     // yorum-strip → sahte PASS engeli
const fdn = readFileSync(`${ROOT}/${FDN}`, "utf8").replace(/^\s*--.*$/gm, "");
const cor = readFileSync(`${ROOT}/${COR}`, "utf8").replace(/^\s*--.*$/gm, "");

// yeni migration'daki helper REVOKE FROM-listesi
const fixHelperRevoke = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.hd_consultation_canonical_hash\\(uuid\\)\\s+FROM\\s+([^;]+);`, "i").exec(fix);
const fixFromList = (fixHelperRevoke?.[1] || "").toLowerCase();

// tek statement kapsamında ("GRANT ... ; " sınırı) helper'a EXECUTE GRANT var mı?
const grantsHelper = (s) => /GRANT[^;]*hd_consultation_canonical_hash/i.test(s);

let pass = 0, fail = 0; const fails = [];
const check = (d, c) => { if (c) pass++; else { fail++; fails.push(d); console.log(`  FAIL  ${d}`); } };

console.log("── A: migration kapsamı & merged immutability ──");
check("A1. yeni corrective migration mevcut", fixRaw.length > 0);
check("A2. F1 foundation DEĞİŞMEDİ (sha256 LF)", shaLF(FDN) === FDN_SHA);
check("A3. F1.1 corrective DEĞİŞMEDİ (sha256 LF)", shaLF(COR) === COR_SHA);
check("A4. anlamlı & benzersiz ad (20260928 hash_helper_acl_fix)", FIX.includes("20260928000000_hd_consultation_hash_helper_acl_fix"));
check("A5. açık BEGIN/COMMIT", /^BEGIN;/m.test(fix) && /^COMMIT;/m.test(fix));
check("A6. CREATE yok (TABLE/FUNCTION/POLICY/INDEX/TRIGGER)", !/\bCREATE\s+(OR\s+REPLACE\s+)?(TABLE|FUNCTION|POLICY|INDEX|TRIGGER|EXTENSION)/i.test(fix));
check("A7. DROP yok (destructive yok)", !/\bDROP\b/i.test(fix));
check("A8. ALTER yok (şema/tablo değişmez)", !/\bALTER\b/i.test(fix));
check("A9. data DML yok (INSERT/UPDATE/DELETE/MERGE/TRUNCATE/COPY)", !/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|COPY)\b/i.test(fix));
check("A10. dinamik SQL yok (EXECUTE/format()", !/\bEXECUTE\b|format\s*\(/i.test(fix));
check("A11. tablo privilege dokunulmuyor (ON TABLE yok)", !/ON\s+TABLE/i.test(fix));
check("A12. RLS/policy dokunulmuyor", !/ROW\s+LEVEL\s+SECURITY/i.test(fix) && !/CREATE\s+POLICY/i.test(fix));
check("A13. function body yok (SECURITY DEFINER / search_path / $..$ yok)", !/SECURITY\s+DEFINER/i.test(fix) && !/search_path/i.test(fix) && !/\$[a-z]*\$/i.test(fix));

console.log("── B: helper EXECUTE ACL kilidi (asıl fix) ──");
check("B1. helper hedef imzası exact (uuid)", new RegExp(`hd_consultation_canonical_hash\\(uuid\\)`).test(fix));
check("B2. helper REVOKE service_role'u İÇERİR (asıl düzeltme)", /service_role/.test(fixFromList));
check("B3. helper REVOKE public+anon+authenticated'ı da içerir (tam kilit)",
  /public/.test(fixFromList) && /anon/.test(fixFromList) && /authenticated/.test(fixFromList));
check("B4. helper'a GRANT EXECUTE YOK (yeniden verme yok)", !grantsHelper(fix));
check("B5. yeni migration YALNIZ helper'a dokunur (mutation RPC ACL'ine değil)",
  RPCS.every((r) => !new RegExp(`(REVOKE|GRANT)[\\s\\S]*public\\.${r}\\b`, "i").test(fix)));

console.log("── C: 6 mutation RPC service_role EXECUTE korunuyor (foundation/corrective değişmez) ──");
check("C1. foundation: RPC ACL loop service_role GRANT (değişmedi)", /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.%s\s+TO\s+service_role/.test(fdn));
check("C2. foundation: 6 RPC imzası ACL listesinde", RPCS.every((r) => new RegExp(`${r}\\(`).test(fdn)));
check("C3. corrective: yeni 7-param create service_role GRANT (değişmedi)",
  /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.rpc_hd_consultation_create\(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb\)\s+TO\s+service_role/.test(cor));

console.log("── D: REGRESYON — helper != mutation RPC contract ──");
// foundation'ın helper'ı service_role'dan REVOKE ETMEDİĞİ (orijinal boşluk) sabitlenir
const fdnHelperRevokeService = new RegExp(`REVOKE[^;]*hd_consultation_canonical_hash\\(uuid\\)[^;]*service_role`, "i").test(fdn);
check("D1. REGRESYON: foundation helper'ı service_role'dan REVOKE ETMİYORDU (kök boşluk)", fdnHelperRevokeService === false);
check("D2. foundation helper'ı public/anon/authenticated'tan REVOKE ediyordu (eksik kilit)",
  /REVOKE ALL ON FUNCTION public\.hd_consultation_canonical_hash\(uuid\) FROM PUBLIC/.test(fdn) &&
  /REVOKE ALL ON FUNCTION public\.hd_consultation_canonical_hash\(uuid\) FROM anon/.test(fdn) &&
  /REVOKE ALL ON FUNCTION public\.hd_consultation_canonical_hash\(uuid\) FROM authenticated/.test(fdn));
check("D3. helper hiçbir migration'da service_role'a GRANT EDİLMEMİŞ (internal-only)",
  !grantsHelper(fdn) && !grantsHelper(cor) && !grantsHelper(fix));
// helper NET ACL: pub/anon/auth (foundation) + service_role (fix) hepsi revoked, grant yok
const helperFullyLocked =
  /REVOKE ALL ON FUNCTION public\.hd_consultation_canonical_hash\(uuid\) FROM PUBLIC/.test(fdn) &&
  /service_role/.test(fixFromList) && /public/.test(fixFromList) && /anon/.test(fixFromList) && /authenticated/.test(fixFromList) &&
  !grantsHelper(fdn) && !grantsHelper(cor) && !grantsHelper(fix);
check("D4. NET helper ACL kilitli: hiçbir client rolü (public/anon/auth/service) EXECUTE yok", helperFullyLocked);
// D8-eşdeğeri beklenen violation = 0: helper svc revoked + 6 RPC svc grant korunuyor
const rpcSvcPreserved = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.%s\s+TO\s+service_role/.test(fdn) &&
  /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.rpc_hd_consultation_create\(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb\)\s+TO\s+service_role/.test(cor);
check("D5. POST-APPLY D8 beklenen violation = 0 (helper svc kaldırıldı, 6 RPC svc korundu)", helperFullyLocked && rpcSvcPreserved);

console.log("── E: güvenlik/hijyen ──");
check("E1. secret/token/key yok", !/secret|token|password|api[_-]?key|bearer|eyJ[A-Za-z0-9]/i.test(fixRaw));

console.log(`\nf1-2-hash-helper-acl-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
