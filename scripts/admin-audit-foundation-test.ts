/**
 * Faz G harness — admin_audit_log altyapısı sözleşme + davranış testleri.
 *
 * Çalıştırma:  npx tsx scripts/admin-audit-foundation-test.ts
 *
 * BAĞLAYICI davranışlar (kanıtlanır):
 *   - Yasaklı alan (parola/token/cookie/authorization/service_role/PII/özel içerik)
 *     bulunursa payload REDDEDİLİR (redaksiyon YOK) → AdminAuditError + insert 0.
 *     Üst düzey + iç içe + dizi içi + old/new/result/context.
 *   - Hassas DEĞER hata mesajına sızmaz; ham payload console/log'a yazılmaz.
 *   - writeAdminAudit FAIL-CLOSED: doğrulama/DB/doğrulanamayan-sonuç → THROW.
 *   - Güvenli payload → insert başarı; aşırı büyük/geçersiz action/UUID → THROW + insert 0.
 *
 * Gerçek DB'ye YAZMAZ — mock SupabaseClient kullanır.
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_AUDIT_ACTIONS,
  isAdminAuditAction,
  isForbiddenAuditKey,
  assertAuditFieldSafe,
  writeAdminAudit,
  AdminAuditError,
  type AdminAuditAction,
  type AdminAuditErrorCode,
} from "../lib/admin/adminAudit";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function ok(cond: boolean, name: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}

function absent(value: unknown, needle: string): boolean {
  return !JSON.stringify(value ?? null).includes(needle);
}

// ─── Mock SupabaseClient (from().insert().select().maybeSingle()) ────────────
type CapturedInsert = { table?: string; payload?: Record<string, unknown>; insertCalls: number };
function makeMockDb(result: { data?: unknown; error?: { message: string } | null }) {
  const captured: CapturedInsert = { insertCalls: 0 };
  const db = {
    from(table: string) {
      captured.table = table;
      return {
        insert(payload: Record<string, unknown>) {
          captured.insertCalls++;
          captured.payload = payload;
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: result.data ?? null, error: result.error ?? null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, captured };
}

// writeAdminAudit'in THROW etmesini bekleyen yardımcı; hata + insert 0 doğrular.
async function expectThrow(
  fn: () => Promise<unknown>,
  code: AdminAuditErrorCode,
  name: string,
): Promise<AdminAuditError | undefined> {
  try {
    await fn();
    ok(false, `${name} (AdminAuditError beklendi, fırlatılmadı)`);
    return undefined;
  } catch (e) {
    const isErr = e instanceof AdminAuditError && e.code === code;
    ok(isErr, `${name} (code=${code})`);
    return e instanceof AdminAuditError ? e : undefined;
  }
}

// console.* çıktısını yakalayan yardımcı (ham payload/log sızıntısı testi için).
async function captureConsole(fn: () => Promise<unknown>): Promise<{ out: string[]; thrown: unknown }> {
  const orig = {
    log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug,
  };
  const out: string[] = [];
  const cap = (...a: unknown[]): void => { out.push(a.map((x) => String(x)).join(" ")); };
  console.log = cap; console.error = cap; console.warn = cap; console.info = cap; console.debug = cap;
  let thrown: unknown;
  try {
    await fn();
  } catch (e) {
    thrown = e;
  } finally {
    Object.assign(console, orig);
  }
  return { out, thrown };
}

const SECRET = "SUPER_SECRET_VALUE_123";
const GOODUUID = "11111111-1111-1111-1111-111111111111";
const TARGETUUID = "22222222-2222-2222-2222-222222222222";

// =============================================================================
async function run(): Promise<void> {
// 1) MIGRATION SÖZLEŞMESİ
// =============================================================================
const MIG_PATH = "supabase/migrations/20260903000000_admin_audit_log.sql";
const sql = readFileSync(MIG_PATH, "utf8");

ok(/create table if not exists public\.admin_audit_log/i.test(sql), "migration: tablo oluşturuluyor");
ok(/enable row level security/i.test(sql), "migration: RLS ENABLE");
ok(/revoke all on table public\.admin_audit_log from anon, authenticated/i.test(sql), "migration: anon/authenticated REVOKE");
ok(/create policy "service_role_admin_audit_log"[\s\S]*for all to service_role/i.test(sql), "migration: service_role policy");
ok(/before update on public\.admin_audit_log/i.test(sql), "migration: append-only UPDATE trigger");
ok(/before delete on public\.admin_audit_log/i.test(sql), "migration: append-only DELETE trigger");
ok(/admin_audit_action_chk/i.test(sql), "migration: action CHECK constraint adı");
ok(/actor_admin_id\s+uuid\s+not null/i.test(sql), "migration: actor_admin_id NOT NULL");
ok(/idx_admin_audit_target_created/i.test(sql), "migration: target index");
ok(/idx_admin_audit_actor_created/i.test(sql), "migration: actor index");
ok(/idx_admin_audit_action_created/i.test(sql), "migration: action index");

const checkBlock = sql.match(/action in \(([\s\S]*?)\)\s*\)/i)?.[1] ?? "";
for (const a of ADMIN_AUDIT_ACTIONS) {
  ok(checkBlock.includes(`'${a}'`), `migration CHECK içeriyor: ${a}`);
}
const sqlActions = Array.from(checkBlock.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
ok(sqlActions.length === ADMIN_AUDIT_ACTIONS.length, `action sayısı eşit (TS=${ADMIN_AUDIT_ACTIONS.length}, SQL=${sqlActions.length})`);
for (const a of sqlActions) {
  ok((ADMIN_AUDIT_ACTIONS as readonly string[]).includes(a), `SQL action TS'te tanımlı: ${a}`);
}

// =============================================================================
// 2) ACTION DOĞRULAMA
// =============================================================================
ok(isAdminAuditAction("user_deactivated"), "action: geçerli kabul");
ok(!isAdminAuditAction("drop_table"), "action: geçersiz red");
ok(!isAdminAuditAction(""), "action: boş red");
ok(!isAdminAuditAction(123), "action: sayı red");

// =============================================================================
// 3) YASAKLI ANAHTAR TESPİTİ (isForbiddenAuditKey)
// =============================================================================
for (const k of ["password", "passwordHash", "password_hash", "access_token", "session_token",
  "authorization", "cookie", "service_role", "serviceRoleKey", "refresh_token", "api_key",
  "client_email", "email", "telefon", "adres", "saglik_notu", "analiz_note", "full_name"]) {
  ok(isForbiddenAuditKey(k), `forbidden-key tespit: ${k}`);
}
for (const k of ["active", "role", "module", "enabled", "closed_count", "status", "platform"]) {
  ok(!isForbiddenAuditKey(k), `güvenli-key kabul: ${k}`);
}

// =============================================================================
// 4) assertAuditFieldSafe — REDDEDER (redakte etmez)
// =============================================================================
// üst düzey
try { assertAuditFieldSafe({ password: SECRET }, "old_value"); ok(false, "assert: üst düzey forbidden throw"); }
catch (e) { ok(e instanceof AdminAuditError && e.code === "forbidden_field", "assert: üst düzey forbidden throw"); ok(absent((e as Error).message, SECRET), "assert: üst düzey hata mesajı değer sızdırmaz"); }
// iç içe
try { assertAuditFieldSafe({ a: { b: { access_token: SECRET } } }, "new_value"); ok(false, "assert: iç içe forbidden throw"); }
catch (e) { ok(e instanceof AdminAuditError && e.code === "forbidden_field", "assert: iç içe forbidden throw"); }
// dizi içi
try { assertAuditFieldSafe([{ ok: 1 }, { client_email: SECRET }], "result"); ok(false, "assert: dizi içi forbidden throw"); }
catch (e) { ok(e instanceof AdminAuditError && e.code === "forbidden_field", "assert: dizi içi forbidden throw"); }
// güvenli payload → değişmeden döner
const safe = { active: false, role: "expert", module: "stones", enabled: true, closed_count: 3 };
ok(JSON.stringify(assertAuditFieldSafe(safe, "old_value")) === JSON.stringify(safe), "assert: güvenli payload aynen döner");
// null/undefined → null
ok(assertAuditFieldSafe(undefined, "context") === null && assertAuditFieldSafe(null, "context") === null, "assert: null/undefined → null");
// aşırı büyük → payload_too_large
try { assertAuditFieldSafe({ arr: Array.from({ length: 400 }, (_, i) => ({ i, v: "y".repeat(120) })) }, "new_value"); ok(false, "assert: aşırı büyük throw"); }
catch (e) { ok(e instanceof AdminAuditError && e.code === "payload_too_large", "assert: aşırı büyük throw"); }
// aşırı derin → payload_too_deep
{ let deep: unknown = { v: 1 }; for (let i = 0; i < 30; i++) deep = { nest: deep };
  try { assertAuditFieldSafe(deep, "old_value"); ok(false, "assert: aşırı derin throw"); }
  catch (e) { ok(e instanceof AdminAuditError && e.code === "payload_too_deep", "assert: aşırı derin throw"); } }

// =============================================================================
// 5) writeAdminAudit — FAIL-CLOSED + insert 0 + sızıntı yok
// =============================================================================
// üst düzey password → forbidden + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "password_changed_by_admin", newValue: { password: SECRET } }), "forbidden_field", "write: üst düzey password reddi");
  ok(captured.insertCalls === 0, "write: üst düzey password → insert 0");
}
// camelCase passwordHash → forbidden + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "password_changed_by_admin", oldValue: { passwordHash: SECRET } }), "forbidden_field", "write: camelCase passwordHash reddi");
  ok(captured.insertCalls === 0, "write: passwordHash → insert 0");
}
// iç içe access_token → forbidden + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "all_sessions_terminated", context: { a: { b: { access_token: SECRET } } } }), "forbidden_field", "write: iç içe access_token reddi");
  ok(captured.insertCalls === 0, "write: iç içe access_token → insert 0");
}
// dizi içi client_email → forbidden + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "user_created", result: [{ ok: 1 }, { client_email: SECRET }] }), "forbidden_field", "write: dizi içi client_email reddi");
  ok(captured.insertCalls === 0, "write: dizi içi client_email → insert 0");
}
// danışan sağlık/not alanı → forbidden + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "workspace_viewed", newValue: { saglik_notu: SECRET } }), "forbidden_field", "write: danışan sağlık/not alanı reddi");
  ok(captured.insertCalls === 0, "write: sağlık/not alanı → insert 0");
}
// hassas değer hata mesajına sızmıyor
{
  const { db } = makeMockDb({ data: { id: GOODUUID } });
  const err = await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "role_changed", oldValue: { authorization: SECRET } }), "forbidden_field", "write: forbidden (mesaj sızıntı testi)");
  ok(err != null && absent(err.message, SECRET), "write: hassas değer HATA MESAJINA sızmaz");
  ok(err != null && err.keyLabel != null && !err.keyLabel.includes(SECRET), "write: keyLabel yalnız anahtar adı (değer değil)");
}
// ham payload console/log'a yazılmıyor
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  const { out, thrown } = await captureConsole(() =>
    writeAdminAudit(db, { actorAdminId: GOODUUID, action: "user_deactivated", newValue: { token: SECRET, deep: { cookie: SECRET } } }),
  );
  ok(thrown instanceof AdminAuditError && thrown.code === "forbidden_field", "write: log-testi forbidden throw");
  ok(out.length === 0, "write: helper hiçbir şey console'a yazmaz");
  ok(!out.some((l) => l.includes(SECRET)), "write: ham payload/secret console'a yazılmaz");
  ok(captured.insertCalls === 0, "write: log-testi insert 0");
}
// DB insert hatası → THROW (db_error)
{
  const { db } = makeMockDb({ error: { message: "insert failed X" } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "user_activated" }), "db_error", "write: DB hatası → throw");
}
// insert sonucu doğrulanamıyor (id yok) → THROW (insert_unverified)
{
  const { db } = makeMockDb({ data: null, error: null });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "user_activated" }), "insert_unverified", "write: doğrulanamayan insert → throw");
}
// geçersiz action → throw + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "bad_action" as AdminAuditAction }), "invalid_action", "write: geçersiz action → throw");
  ok(captured.insertCalls === 0, "write: geçersiz action → insert 0");
}
// geçersiz actor uuid → throw + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: "not-a-uuid", action: "user_deactivated" }), "invalid_actor", "write: geçersiz actor → throw");
  ok(captured.insertCalls === 0, "write: geçersiz actor → insert 0");
}
// geçersiz target uuid → throw + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, targetUserId: "bad", action: "user_deactivated" }), "invalid_target", "write: geçersiz target → throw");
  ok(captured.insertCalls === 0, "write: geçersiz target → insert 0");
}
// aşırı büyük payload → throw + insert 0
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  const bulky = { arr: Array.from({ length: 400 }, (_, i) => ({ i, v: "y".repeat(120) })) };
  await expectThrow(() => writeAdminAudit(db, { actorAdminId: GOODUUID, action: "role_changed", newValue: bulky }), "payload_too_large", "write: aşırı büyük → throw");
  ok(captured.insertCalls === 0, "write: aşırı büyük → insert 0");
}
// GÜVENLİ payload → insert BAŞARI (id döner, forbidden yok)
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  const r = await writeAdminAudit(db, {
    actorAdminId: GOODUUID,
    targetUserId: TARGETUUID,
    action: "total_session_limit_changed",
    oldValue: { total: 2 },
    newValue: { total: 3 },
    result: { closed_count: 0 },
    reason: "  limit güncellendi  ",
    actorIsMainAdmin: true,
  });
  ok(r.id === GOODUUID, "write: güvenli payload → insert başarı (id döner)");
  ok(captured.insertCalls === 1, "write: güvenli payload → insert 1");
  ok(captured.table === "admin_audit_log", "write: doğru tabloya insert");
  ok(captured.payload?.reason === "limit güncellendi", "write: reason trim edilir");
  ok(JSON.stringify(captured.payload?.result) === JSON.stringify({ closed_count: 0 }), "write: güvenli result korunur");
  ok(captured.payload?.actor_is_main_admin === true, "write: actor_is_main_admin yazılır");
}
// uzun reason → 1000'e kırpılır (başarı yolunda)
{
  const { db, captured } = makeMockDb({ data: { id: GOODUUID } });
  await writeAdminAudit(db, { actorAdminId: GOODUUID, action: "role_changed", reason: "a".repeat(5000) });
  ok(((captured.payload?.reason as string | undefined)?.length ?? 0) === 1000, "write: uzun reason 1000'e kırpılır");
}

// =============================================================================
// SONUÇ
// =============================================================================
console.log("");
console.log(`admin_audit_log foundation harness: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) {
  console.log("Başarısızlar:", fails.join(" | "));
  process.exit(1);
}
console.log("✅ Tüm sözleşme + fail-closed davranış testleri geçti.");
}

void run();
