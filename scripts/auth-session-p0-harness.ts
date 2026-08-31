/**
 * P0-1 AUTH SESSION BYPASS — REGRESSION HARNESS
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratı:
 *
 *   1) "Knowing an active user's UUID is insufficient to mint a session."
 *   2) "Knowing an admin UUID is insufficient to mint an admin session."
 *
 * Çalıştır:  npx tsx scripts/auth-session-p0-harness.ts
 *
 * DB gerektirmez — credential doğrulama (login_user) ve oturum→admin çözümü
 * enjekte edilen sahte bir Supabase client üzerinde koşar (production mutation YOK).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  verifyLoginCredentials,
  resolveAdminUserIdFromSessionToken,
} from "@/lib/auth/credentialLogin";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
}

// ─── Sahte Supabase client (yalnız kullanılan zincirler) ─────────────────────
type Row = Record<string, unknown>;
const NOW = new Date().toISOString(); // taze → getActiveSessionUserId update dalını tetiklemez

function makeFakeDb(cfg: {
  loginRows: Map<string, Row>;      // "email\npassword" → login_user satırı
  usersById: Map<string, Row>;      // id → { id, role, active }
  sessions: Map<string, Row>;       // token → { user_id, is_active, last_seen_at }
}) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async rpc(name: string, args: any) {
      if (name === "login_user") {
        const row = cfg.loginRows.get(`${String(args.p_email)}\n${String(args.p_password)}`);
        return { data: row ? [row] : [], error: null };
      }
      return { data: null, error: null };
    },
    from(table: string) {
      const filters: Row = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters[col] = val; return builder; },
        update: () => builder, // getActiveSessionUserId'deki void update — no-op
        maybeSingle: async () => {
          if (table === "user_sessions") {
            const s = cfg.sessions.get(String(filters["session_token"]));
            if (!s) return { data: null, error: null };
            if (filters["is_active"] === true && s.is_active !== true) return { data: null, error: null };
            return { data: { user_id: s.user_id, last_seen_at: s.last_seen_at }, error: null };
          }
          if (table === "users") {
            const u = cfg.usersById.get(String(filters["id"]));
            return { data: u ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const db = makeFakeDb({
  loginRows: new Map<string, Row>([
    ["expert@test\ngoodpass", { id: "expert-1", role: "expert", active: true, approval_status: "approved", tenant_id: "t-1" }],
    ["admin@test\nadminpass", { id: "admin-1", role: "admin", active: true, approval_status: "approved", tenant_id: "t-2" }],
    ["inactive@test\ninactivepass", { id: "inactive-1", role: "expert", active: false, approval_status: "approved", tenant_id: "t-3" }],
  ]),
  usersById: new Map<string, Row>([
    ["admin-1", { id: "admin-1", role: "admin", active: true }],
    ["expert-1", { id: "expert-1", role: "expert", active: true }],
    ["inactive-admin", { id: "inactive-admin", role: "admin", active: false }],
  ]),
  sessions: new Map<string, Row>([
    ["tok-admin",          { user_id: "admin-1",        is_active: true,  last_seen_at: NOW }],
    ["tok-expert",         { user_id: "expert-1",       is_active: true,  last_seen_at: NOW }],
    ["tok-inactive-admin", { user_id: "inactive-admin", is_active: true,  last_seen_at: NOW }],
    ["tok-revoked",        { user_id: "admin-1",        is_active: false, last_seen_at: NOW }],
  ]),
});

async function run() {
  console.log("\n── verifyLoginCredentials (server-side credential gate) ──");
  const validExpert = await verifyLoginCredentials(db, "expert@test", "goodpass");
  ok("geçerli credential → doğrulanmış kullanıcı (userId türetildi)", validExpert?.userId === "expert-1" && validExpert?.active === true);

  const validAdmin = await verifyLoginCredentials(db, "admin@test", "adminpass");
  ok("geçerli admin credential → role=admin", validAdmin?.userId === "admin-1" && validAdmin?.role === "admin");

  // EXPLOIT KONTRATI 1: yalnız userId/UUID yeterli değil — hiçbir yerde userId girişi yok.
  const wrongPass = await verifyLoginCredentials(db, "expert@test", "WRONG");
  ok("yanlış şifre → REDDEDİLDİ (null)", wrongPass === null);

  const unknownEmail = await verifyLoginCredentials(db, "nobody@test", "x");
  ok("bilinmeyen e-posta → REDDEDİLDİ (null)", unknownEmail === null);

  const empty = await verifyLoginCredentials(db, "", "");
  ok("boş credential → REDDEDİLDİ (null)", empty === null);

  const inactive = await verifyLoginCredentials(db, "inactive@test", "inactivepass");
  ok("inaktif kullanıcı doğru credential → satır döner ama active=false (route 403 verir)", inactive?.userId === "inactive-1" && inactive?.active === false);

  const normalized = await verifyLoginCredentials(db, "  Expert@Test  ", "  goodpass  ");
  ok("e-posta lower/trim + şifre trim paritesi", normalized?.userId === "expert-1");

  console.log("\n── resolveAdminUserIdFromSessionToken (admin cookie kimliği) ──");
  const adminOk = await resolveAdminUserIdFromSessionToken(db, "tok-admin");
  ok("geçerli admin oturum token'ı → adminId", adminOk === "admin-1");

  // EXPLOIT KONTRATI 2: admin UUID veya normal token admin cookie üretemez.
  const expertTok = await resolveAdminUserIdFromSessionToken(db, "tok-expert");
  ok("admin OLMAYAN oturum token'ı → REDDEDİLDİ (null)", expertTok === null);

  const inactiveAdmin = await resolveAdminUserIdFromSessionToken(db, "tok-inactive-admin");
  ok("inaktif admin → REDDEDİLDİ (null)", inactiveAdmin === null);

  const revoked = await resolveAdminUserIdFromSessionToken(db, "tok-revoked");
  ok("revoke edilmiş (is_active=false) oturum → REDDEDİLDİ (null)", revoked === null);

  const unknownTok = await resolveAdminUserIdFromSessionToken(db, "bilinmeyen-token");
  ok("bilinmeyen token → REDDEDİLDİ (null)", unknownTok === null);

  const emptyTok = await resolveAdminUserIdFromSessionToken(db, "");
  ok("boş token → REDDEDİLDİ (null)", emptyTok === null);

  console.log("\n── Kaynak kontratı (regression lock) ──");
  const sessionSrc = readFileSync(join(ROOT, "app/api/auth/session/route.ts"), "utf8");
  const adminSrc = readFileSync(join(ROOT, "app/api/auth/admin-session/route.ts"), "utf8");

  ok("session route: verifyLoginCredentials çağırıyor", /verifyLoginCredentials\s*\(/.test(sessionSrc));
  ok("session route: email+password okuyor", /body\?\.email/.test(sessionSrc) && /body\?\.password/.test(sessionSrc));
  ok("session route: body.userId ile token ÜRETMİYOR (kaldırıldı)", !/body\.userId/.test(sessionSrc) && !/body\?\.userId/.test(sessionSrc));

  ok("admin-session route: x-session-token okuyor", /x-session-token/.test(adminSrc));
  ok("admin-session route: resolveAdminUserIdFromSessionToken çağırıyor", /resolveAdminUserIdFromSessionToken\s*\(/.test(adminSrc));
  ok("admin-session route: body.userId'ye güvenMİYOR (kaldırıldı)", !/body\.userId/.test(adminSrc) && !/body\?\.userId/.test(adminSrc));

  console.log(`\nSONUÇ: ${pass} passed, ${fail} failed`);
  if (fail > 0) { process.exitCode = 1; console.error("HARNESS FAIL — P0-1 kontratı ihlal edildi."); }
  else { console.log("HARNESS PASS — UUID-only mint BLOCKED, admin UUID-only mint BLOCKED."); }
}

run().catch((e) => { console.error("HARNESS ERROR", e); process.exitCode = 1; });
