#!/usr/bin/env node
/**
 * scripts/final-hardening/drift/compare.mjs — güvenlik drift karşılaştırıcı (ağ/DB YOK).
 *
 * Girdi: manifest.sql çıktısı (JSON dosyası) + supabase/expected-manifest.json (hedef durum).
 * Kullanım:
 *   node scripts/final-hardening/drift/compare.mjs <manifest.json> [--expected <yol>] [--json]
 * Çıkış kodu: 0 = FAIL yok (UYARI olabilir) · 1 = en az bir FAIL · 2 = kullanım/girdi hatası.
 *
 * Kabul edilen manifest biçimleri: çıplak nesne `{format:"yasam-drift-manifest",…}`,
 * `{manifest:{…}}` ya da SQL Editor dışa aktarımı `[{manifest:{…}}]` / `[{manifest:"<json>"}]`.
 *
 * Kurallar (expected-manifest.json):
 *   functions_no_client_execute  → adı eşleşen TÜM overload'larda anon/authenticated EXECUTE=false
 *   tables_no_client_grant       → anon/authenticated SELECT/INSERT/UPDATE/DELETE=false
 *   tables_rls_enabled           → rls=true
 *   storage_policies_absent      → ad deseni eşleşen policy YOK
 *   buckets                      → belirtilen alanlar birebir (public, file_size_limit …)
 *   --- manifest v2 (AŞAMA 1; v1 manifest'te bu kurallar UYARI verir) ---
 *   default_acl_no_client        → (SEC-NEW-03) creator_roles'ün şema varsayılanında istemci rolüne
 *                                  yetki YOK; global fonksiyon varsayılanında PUBLIC EXECUTE YOK.
 *                                  warn_creator_roles için aynı bulgu yalnız UYARI.
 *   tables_no_client_dangerous_privileges → (SEC-NEW-03a) HİÇBİR public tabloda istemci rolünde
 *                                  TRUNCATE/REFERENCES/TRIGGER yok; pending_owner_decision → UYARI.
 *   broad_client_policies_absent → (MI-P08) listedeki tablolarda istemci rolüne USING/CHECK true politika YOK.
 *   (yalnız UYARI) listede olmayan tabloda anon grant; anon EXECUTE'lu SECURITY DEFINER fonksiyon
 *   optional listesindeki nesne manifest'te yoksa → UYARI (henüz uygulanmamış migration), değilse FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const DEFAULT_EXPECTED = path.join(root, "supabase", "expected-manifest.json");

/** Farklı dışa aktarım biçimlerini çıplak manifest nesnesine indirger. */
export function normalizeManifest(input) {
  let m = input;
  if (typeof m === "string") m = JSON.parse(m);
  if (Array.isArray(m)) m = m[0];
  if (m && typeof m === "object" && "manifest" in m && !("tables" in m)) m = m.manifest;
  if (typeof m === "string") m = JSON.parse(m);
  if (!m || typeof m !== "object" || m.format !== "yasam-drift-manifest") {
    throw new Error("Geçersiz manifest: format 'yasam-drift-manifest' değil.");
  }
  for (const k of ["tables", "policies", "functions", "buckets"]) {
    if (!Array.isArray(m[k])) throw new Error(`Geçersiz manifest: '${k}' dizi değil.`);
  }
  return m;
}

const PRIVS = ["select", "insert", "update", "delete"];

/**
 * Saf karşılaştırma. Dönüş: { fails: string[], warnings: string[], checked: number }.
 */
export function compareManifest(actualRaw, expected) {
  const actual = normalizeManifest(actualRaw);
  const fails = [];
  const warnings = [];
  let checked = 0;

  const tables = new Map(actual.tables.filter((t) => t.schema === "public").map((t) => [t.name, t]));
  const fnByName = new Map();
  for (const f of actual.functions) {
    if (!fnByName.has(f.name)) fnByName.set(f.name, []);
    fnByName.get(f.name).push(f);
  }
  const missing = (list, name, what) => {
    if ((list?.optional ?? []).includes(name)) warnings.push(`${what} '${name}' manifest'te yok (optional — migration henüz uygulanmamış olabilir).`);
    else fails.push(`${what} '${name}' manifest'te yok.`);
  };

  // 1) RPC'ler: anon/authenticated EXECUTE yok.
  const fnRule = expected.functions_no_client_execute;
  for (const name of fnRule?.names ?? []) {
    checked += 1;
    const overloads = fnByName.get(name);
    if (!overloads?.length) { missing(fnRule, name, "Fonksiyon"); continue; }
    for (const f of overloads) {
      if (f.anon_execute) fails.push(`Fonksiyon ${name}(${f.args}) anon EXECUTE açık.`);
      if (f.authenticated_execute) fails.push(`Fonksiyon ${name}(${f.args}) authenticated EXECUTE açık.`);
    }
  }

  // 2) Tablolar: istemci grant'i yok.
  const grantRule = expected.tables_no_client_grant;
  for (const name of grantRule?.names ?? []) {
    checked += 1;
    const t = tables.get(name);
    if (!t) { missing(grantRule, name, "Tablo"); continue; }
    for (const role of ["anon", "authenticated"]) {
      const open = PRIVS.filter((p) => t[role]?.[p]);
      if (open.length) fails.push(`Tablo ${name}: ${role} yetkisi açık (${open.join(",")}).`);
    }
  }

  // 3) RLS açık.
  const rlsRule = expected.tables_rls_enabled;
  for (const name of rlsRule?.names ?? []) {
    checked += 1;
    const t = tables.get(name);
    if (!t) { missing(rlsRule, name, "Tablo (RLS)"); continue; }
    if (!t.rls) fails.push(`Tablo ${name}: RLS kapalı.`);
  }

  // 4) Olmaması gereken storage/public policy'leri.
  for (const rule of expected.storage_policies_absent ?? []) {
    checked += 1;
    const re = new RegExp(rule.policy_name_pattern);
    for (const p of actual.policies) {
      if (p.schema === rule.schema && p.table === rule.table && re.test(p.name)) {
        fails.push(`Policy ${p.schema}.${p.table} "${p.name}" hâlâ var (${rule.reason ?? "kaldırılmalı"}).`);
      }
    }
  }

  // 5) Bucket özellikleri.
  const buckets = new Map(actual.buckets.map((b) => [b.id, b]));
  for (const [id, want] of Object.entries(expected.buckets ?? {})) {
    checked += 1;
    const b = buckets.get(id);
    if (!b) { warnings.push(`Bucket '${id}' manifest'te yok.`); continue; }
    for (const [k, v] of Object.entries(want)) {
      const got = b[k];
      const same = k === "file_size_limit" ? Number(got) === Number(v) : JSON.stringify(got) === JSON.stringify(v);
      if (!same) fails.push(`Bucket ${id}.${k}: beklenen ${JSON.stringify(v)}, bulunan ${JSON.stringify(got)}.`);
    }
  }

  // 5b) manifest v2 kuralları (SEC-NEW-03 / SEC-NEW-03a / MI-P08).
  const v2 = Array.isArray(actual.default_acls);
  const daclRule = expected.default_acl_no_client;
  if (daclRule) {
    checked += 1;
    if (!v2) {
      warnings.push("Manifest v1: varsayılan ACL (SEC-NEW-03) kontrol edilemedi — manifest.sql v2 ile yeniden alın.");
    } else {
      const clients = new Set(daclRule.client_roles ?? ["anon", "authenticated"]);
      const schema = daclRule.schema ?? "public";
      const report = (creator, msg) =>
        ((daclRule.warn_creator_roles ?? []).includes(creator) ? warnings : fails).push(msg);
      for (const creator of [...(daclRule.creator_roles ?? []), ...(daclRule.warn_creator_roles ?? [])]) {
        const rows = actual.default_acls.filter((d) => d.creator === creator);
        for (const d of rows) {
          if (d.schema === schema && clients.has(d.grantee)) {
            report(creator, `Varsayılan ACL: ${creator} → ${schema} ${d.objtype} ${d.privilege} TO ${d.grantee} (yeni nesneler istemciye açık doğar).`);
          }
        }
        if ((daclRule.global_function_public_revoked_for ?? []).includes(creator)) {
          const global = rows.filter((d) => d.schema == null && d.objtype === "f");
          if (!global.length || global.some((d) => d.grantee === "PUBLIC")) {
            report(creator, `Varsayılan ACL: ${creator} global fonksiyon varsayılanında PUBLIC EXECUTE duruyor.`);
          }
        }
      }
    }
  }

  const dangerRule = expected.tables_no_client_dangerous_privileges;
  if (dangerRule) {
    checked += 1;
    const privs = dangerRule.privileges ?? ["truncate", "references", "trigger"];
    const pending = dangerRule.pending_owner_decision ?? {};
    const sample = [...tables.values()][0];
    if (sample && !(privs[0] in (sample.anon ?? {}))) {
      warnings.push("Manifest v1: tablo TRUNCATE/REFERENCES/TRIGGER (SEC-NEW-03a) kontrol edilemedi.");
    } else {
      for (const t of tables.values()) {
        for (const role of ["anon", "authenticated"]) {
          const open = privs.filter((p) => t[role]?.[p]);
          if (!open.length) continue;
          const msg = `Tablo ${t.name}: ${role} tehlikeli yetki açık (${open.join(",")}).`;
          if (pending[t.name]) warnings.push(`${msg} ${pending[t.name]}`);
          else fails.push(msg);
        }
      }
    }
  }

  const broadRule = expected.broad_client_policies_absent;
  if (broadRule) {
    checked += 1;
    const clients = ["public", "anon", "authenticated"];
    const hasFlags = actual.policies.some((p) => "using_true" in p);
    if (actual.policies.length && !hasFlags) {
      warnings.push("Manifest v1: geniş politika (MI-P08) kontrol edilemedi.");
    } else {
      for (const p of actual.policies) {
        if (p.schema !== "public" || !(broadRule.tables ?? []).includes(p.table)) continue;
        const roles = Array.isArray(p.roles) ? p.roles : [];
        if (!roles.some((r) => clients.includes(r))) continue;
        if (p.using_true || (p.check_true && p.cmd === "INSERT")) {
          fails.push(`Policy public.${p.table} "${p.name}" (${p.cmd} TO ${roles.join(",")}) koşulsuz true — kaldırılmalı.`);
        }
      }
    }
  }

  // 6) Uyarılar: liste dışı anon grant'li tablolar + anon EXECUTE'lu SECURITY DEFINER.
  const listed = new Set([...(grantRule?.names ?? []), ...(expected.anon_table_grant_allowlist ?? [])]);
  for (const t of tables.values()) {
    if (listed.has(t.name)) continue;
    const open = PRIVS.filter((p) => t.anon?.[p]);
    if (open.length) warnings.push(`Tablo ${t.name}: anon yetkisi açık (${open.join(",")}) — beklenen listede değil, gözden geçirin.`);
  }
  const fnAllow = new Set(expected.anon_security_definer_allowlist ?? []);
  for (const f of actual.functions) {
    if (f.extension || !f.security_definer || !f.anon_execute || fnAllow.has(f.name)) continue;
    if ((fnRule?.names ?? []).includes(f.name)) continue; // zaten FAIL olarak raporlandı
    warnings.push(`SECURITY DEFINER ${f.name}(${f.args}) anon EXECUTE açık — gözden geçirin.`);
  }

  return { fails, warnings, checked };
}

function main(argv) {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--expected");
  const expIdx = args.indexOf("--expected");
  const expectedPath = expIdx >= 0 ? path.resolve(args[expIdx + 1]) : DEFAULT_EXPECTED;
  if (!file) {
    console.error("Kullanım: node scripts/final-hardening/drift/compare.mjs <manifest.json> [--expected <yol>] [--json]");
    return 2;
  }
  let result;
  try {
    const actual = fs.readFileSync(path.resolve(file), "utf8").trim();
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    result = compareManifest(actual, expected);
  } catch (e) {
    console.error(`HATA: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const f of result.fails) console.log(`FAIL  ${f}`);
    for (const w of result.warnings) console.log(`WARN  ${w}`);
    console.log(`\nKontrol: ${result.checked} · FAIL: ${result.fails.length} · UYARI: ${result.warnings.length}`);
    console.log(result.fails.length ? "RESULT: DRIFT (FAIL)" : "RESULT: OK");
  }
  return result.fails.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main(process.argv));
}
