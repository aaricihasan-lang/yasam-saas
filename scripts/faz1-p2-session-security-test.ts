/**
 * Faz 1/P2 harness — oturum güvenliği & hesap müdahaleleri.
 *
 * Çalıştırma:  npx tsx scripts/faz1-p2-session-security-test.ts
 *
 * Kapsam (gerçek DB'ye YAZMAZ — mock SupabaseClient + statik sözleşme kontrolleri):
 *   1) validateNewPassword / isLogoutAllConfirmValid / readLimitedJsonBody
 *   2) requireP2AccountActionTarget: self / admin-hedef / ana-yönetici-hedef / expert
 *   3) ensureTargetExists 404/ok
 *   4) revokeAllActiveSessions: sayım / no-op(0) / hata→throw
 *   5) resolveActorIsMainAdmin
 *   6) Route sözleşmeleri: guard/revoke/audit/no-store wiring + secret sızıntısı yok
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateNewPassword,
  isLogoutAllConfirmValid,
  readLimitedJsonBody,
  requireP2AccountActionTarget,
  ensureTargetExists,
  revokeAllActiveSessions,
  resolveActorIsMainAdmin,
  SessionRevokeError,
  LOGOUT_ALL_CONFIRM_PHRASE,
  SESSION_END_REASON,
} from "../lib/admin/accountSessionControls";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}

// ── Mock kullanıcı evreni ────────────────────────────────────────────────────
const SUPER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUPER2_ID = "a2a2a2a2-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NORMAL_ADMIN_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NORMAL_ADMIN2_ID = "b2b2b2b2-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const EXPERT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const MISSING_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type UserRow = { id: string; role: string; email: string; is_super_admin: boolean };
const USERS: Record<string, UserRow> = {
  [SUPER_ID]: { id: SUPER_ID, role: "admin", email: "admin@yasamsistemi.com", is_super_admin: true },
  [SUPER2_ID]: { id: SUPER2_ID, role: "admin", email: "super2@x.com", is_super_admin: true },
  [NORMAL_ADMIN_ID]: { id: NORMAL_ADMIN_ID, role: "admin", email: "a1@x.com", is_super_admin: false },
  [NORMAL_ADMIN2_ID]: { id: NORMAL_ADMIN2_ID, role: "admin", email: "a2@x.com", is_super_admin: false },
  [EXPERT_ID]: { id: EXPERT_ID, role: "expert", email: "e@x.com", is_super_admin: false },
};

type Resp = { data?: unknown; error?: { message: string } | null };

/**
 * Esnek mock. users select → resolver. user_sessions update().eq().eq().select()
 * → yapılandırılmış revoke sonucu döner.
 */
function mockDb(opts?: { revokeResult?: Resp }): SupabaseClient {
  const usersBuilder = (table: string) => {
    let select = "";
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select(cols: string) {
        select = cols;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters[col] = val;
        return builder;
      },
      async maybeSingle(): Promise<Resp> {
        const uid = String(filters.id ?? "");
        const row = USERS[uid];
        if (table !== "users") return { data: null, error: null };
        if (!row) return { data: null, error: null };
        // Sadece istenen kolonları döndür (resolveIsSuperAdmin: is_super_admin;
        // requireMainAdminForAdminTarget: role; ensureTargetExists: id).
        if (select.includes("is_super_admin")) return { data: { is_super_admin: row.is_super_admin }, error: null };
        if (select.includes("email")) return { data: { email: row.email, role: row.role }, error: null };
        if (select.trim() === "role") return { data: { role: row.role }, error: null };
        if (select.trim() === "id") return { data: { id: row.id }, error: null };
        return { data: row, error: null };
      },
    };
    return builder;
  };

  const sessionsUpdateBuilder = () => {
    const b: Record<string, unknown> = {
      eq() {
        return b;
      },
      async select(): Promise<Resp> {
        return opts?.revokeResult ?? { data: [], error: null };
      },
    };
    return b;
  };

  return {
    from(table: string) {
      if (table === "user_sessions") {
        return { update: () => sessionsUpdateBuilder() };
      }
      return usersBuilder(table);
    },
  } as unknown as SupabaseClient;
}

function fakeJsonReq(bodyText: string, contentType = "application/json"): Request {
  return new Request("http://x/api", {
    method: "POST",
    headers: { "content-type": contentType },
    body: bodyText,
  });
}

async function run(): Promise<void> {
  // ── 1) validateNewPassword ────────────────────────────────────────────────
  ok(validateNewPassword("").ok === false, "password: boş reddedilir");
  {
    const r = validateNewPassword("");
    ok(r.ok === false && r.status === 400, "password: boş → 400");
  }
  {
    const r = validateNewPassword("12345");
    ok(r.ok === false && r.status === 422, "password: <6 → 422 semantik");
  }
  {
    const r = validateNewPassword("  secret123  ");
    ok(r.ok === true && r.value === "secret123", "password: geçerli trim + kabul");
  }

  // ── 2) isLogoutAllConfirmValid ────────────────────────────────────────────
  ok(isLogoutAllConfirmValid("ÇIKIŞ YAPTIR") === true, "confirm: tam metin geçer");
  ok(isLogoutAllConfirmValid("  ÇIKIŞ YAPTIR  ") === true, "confirm: baş/son boşluk kırpılır");
  ok(isLogoutAllConfirmValid("çıkış yaptır") === false, "confirm: küçük harf toleransı YOK");
  ok(isLogoutAllConfirmValid("CIKIS YAPTIR") === false, "confirm: Türkçe karakter zorunlu");
  ok(isLogoutAllConfirmValid("ÇIKIŞ  YAPTIR") === false, "confirm: iç boşluk farkı reddedilir");
  ok(isLogoutAllConfirmValid("") === false, "confirm: boş reddedilir");
  ok(isLogoutAllConfirmValid(null) === false, "confirm: null reddedilir");
  ok(LOGOUT_ALL_CONFIRM_PHRASE === "ÇIKIŞ YAPTIR", "confirm: sabit metin doğru");

  // ── 3) readLimitedJsonBody ────────────────────────────────────────────────
  {
    const r = await readLimitedJsonBody(fakeJsonReq(`{"a":1}`, "text/plain"));
    ok(r.ok === false && r.status === 400, "body: yanlış content-type → 400");
  }
  {
    const big = JSON.stringify({ x: "a".repeat(9 * 1024) });
    const r = await readLimitedJsonBody(fakeJsonReq(big));
    ok(r.ok === false && r.status === 413, "body: çok büyük → 413");
  }
  {
    const r = await readLimitedJsonBody(fakeJsonReq("{bozuk"));
    ok(r.ok === false && r.status === 400, "body: malformed JSON → 400");
  }
  {
    const r = await readLimitedJsonBody(fakeJsonReq("[]"));
    ok(r.ok === false && r.status === 400, "body: array reddedilir → 400");
  }
  {
    const r = await readLimitedJsonBody(fakeJsonReq(""));
    ok(r.ok === true && Object.keys(r.value).length === 0, "body: boş → {} kabul");
  }
  {
    const r = await readLimitedJsonBody(fakeJsonReq(`{"newPassword":"x"}`));
    ok(r.ok === true && r.value.newPassword === "x", "body: geçerli JSON kabul");
  }

  // ── 4) requireP2AccountActionTarget ───────────────────────────────────────
  const db = mockDb();
  {
    const r = await requireP2AccountActionTarget(db, NORMAL_ADMIN_ID, NORMAL_ADMIN_ID);
    ok(r.ok === false && r.status === 403, "target: self-block → 403");
  }
  {
    const r = await requireP2AccountActionTarget(db, NORMAL_ADMIN_ID, EXPERT_ID);
    ok(r.ok === true, "target: normal admin → expert hedef serbest");
  }
  {
    const r = await requireP2AccountActionTarget(db, NORMAL_ADMIN_ID, NORMAL_ADMIN2_ID);
    ok(r.ok === false && r.status === 403, "target: normal admin → başka admin hedef 403");
  }
  {
    const r = await requireP2AccountActionTarget(db, SUPER_ID, NORMAL_ADMIN2_ID);
    ok(r.ok === true, "target: ana yönetici → normal admin hedef serbest");
  }
  {
    const r = await requireP2AccountActionTarget(db, SUPER_ID, SUPER2_ID);
    ok(r.ok === false && r.status === 403, "target: ana yönetici hedef MUTLAK korunur → 403");
  }
  {
    const r = await requireP2AccountActionTarget(db, NORMAL_ADMIN_ID, SUPER_ID);
    ok(r.ok === false && r.status === 403, "target: normal admin → ana yönetici hedef 403");
  }

  // ── 5) ensureTargetExists ─────────────────────────────────────────────────
  {
    const r = await ensureTargetExists(db, MISSING_ID);
    ok(r.ok === false && r.status === 404, "exists: olmayan kullanıcı → 404");
  }
  {
    const r = await ensureTargetExists(db, EXPERT_ID);
    ok(r.ok === true, "exists: var olan kullanıcı → ok");
  }

  // ── 6) revokeAllActiveSessions ────────────────────────────────────────────
  {
    const dbR = mockDb({ revokeResult: { data: [{ id: "s1" }, { id: "s2" }, { id: "s3" }], error: null } });
    const n = await revokeAllActiveSessions(dbR, EXPERT_ID, SESSION_END_REASON.deactivated);
    ok(n === 3, "revoke: aktif oturum sayısı doğru (3)");
  }
  {
    const dbR = mockDb({ revokeResult: { data: [], error: null } });
    const n = await revokeAllActiveSessions(dbR, EXPERT_ID, SESSION_END_REASON.logoutAll);
    ok(n === 0, "revoke: aktif oturum yok → deterministik no-op 0");
  }
  {
    const dbR = mockDb({ revokeResult: { data: null, error: { message: "boom" } } });
    let threw = false;
    try {
      await revokeAllActiveSessions(dbR, EXPERT_ID, SESSION_END_REASON.passwordReset);
    } catch (e) {
      threw = e instanceof SessionRevokeError;
    }
    ok(threw, "revoke: DB hatası → SessionRevokeError (fail-closed)");
  }

  // ── 7) resolveActorIsMainAdmin ────────────────────────────────────────────
  ok((await resolveActorIsMainAdmin(db, SUPER_ID)) === true, "actor: ana yönetici bayrağı true");
  ok((await resolveActorIsMainAdmin(db, NORMAL_ADMIN_ID)) === false, "actor: normal admin bayrağı false");

  // ── 8) SESSION_END_REASON sabitleri ───────────────────────────────────────
  ok(SESSION_END_REASON.deactivated === "admin_deactivated", "reason: deactivated doğru");
  ok(SESSION_END_REASON.passwordReset === "admin_password_reset", "reason: passwordReset doğru");
  ok(SESSION_END_REASON.logoutAll === "admin_logout_all", "reason: logoutAll doğru");

  // ── 9) ROUTE SÖZLEŞMELERİ (statik wiring) ─────────────────────────────────
  const pwRoute = readFileSync("app/api/admin/users/[id]/password/route.ts", "utf8");
  const logoutRoute = readFileSync("app/api/admin/users/[id]/logout-all/route.ts", "utf8");
  const statusRoute = readFileSync("app/api/admin/users/[id]/status/route.ts", "utf8");

  // password route
  ok(/requireP2AccountActionTarget/.test(pwRoute), "pw-route: hedef güvenlik kapısı bağlı");
  ok(/validateNewPassword/.test(pwRoute), "pw-route: parola validasyonu bağlı");
  ok(/revokeAllActiveSessions/.test(pwRoute), "pw-route: tüm oturumlar revoke edilir");
  ok(/password_changed_by_admin/.test(pwRoute), "pw-route: doğru audit action");
  ok(/jsonNoStore/.test(pwRoute), "pw-route: no-store yanıt (jsonNoStore)");
  ok(/hash_password/.test(pwRoute), "pw-route: server-side hash");
  // Secret sızıntısı: yanıt/audit context'e ham parola yazılmamalı.
  ok(!/console\.(log|error|warn)/.test(pwRoute), "pw-route: console log yok");
  ok(!/newPassword\s*:/.test(pwRoute), "pw-route: yanıta newPassword konmaz");
  {
    // Audit çağrısı bloğunu (action etiketinden sonraki ~300 karakter) izole et:
    // içinde parola/hash referansı OLMAMALI (yalnız revoked_session_count).
    const idx = pwRoute.indexOf("password_changed_by_admin");
    const auditBlock = idx >= 0 ? pwRoute.slice(idx, idx + 300) : "";
    ok(
      !/pw\.value|newPassword|password_hash|hashResult|p_plain/.test(auditBlock),
      "pw-route: audit context'inde parola/hash yok",
    );
  }

  // logout-all route
  ok(/requireP2AccountActionTarget/.test(logoutRoute), "logout-route: hedef güvenlik kapısı bağlı");
  ok(/isLogoutAllConfirmValid/.test(logoutRoute), "logout-route: tam-metin onay doğrulaması");
  ok(/revokeAllActiveSessions/.test(logoutRoute), "logout-route: oturumlar revoke edilir");
  ok(/all_sessions_terminated/.test(logoutRoute), "logout-route: doğru audit action");
  ok(/revokedSessionCount/.test(logoutRoute), "logout-route: revoke sayısı döndürülür");
  ok(/no-store/.test(logoutRoute) || /jsonNoStore/.test(logoutRoute), "logout-route: no-store yanıt");
  ok(!/password_hash|password/.test(logoutRoute), "logout-route: parola/hash'e dokunmaz");

  // status route (toggle_active)
  ok(/user_deactivated/.test(statusRoute), "status-route: pasife alma audit'i");
  ok(/user_activated/.test(statusRoute), "status-route: aktifleştirme audit'i");
  ok(/revokeAllActiveSessions/.test(statusRoute), "status-route: pasife alınca revoke");
  ok(/guardAdminLockoutById/.test(statusRoute), "status-route: kilitlenme koruması korunur");
  ok(/requireMainAdminForAdminTarget/.test(statusRoute), "status-route: admin-hedef koruması korunur");
  // Aktifleştirme oturum OLUŞTURMAMALI (revoke sadece pasife alma dalında).
  ok(!/createUserSession|insert\(/.test(statusRoute), "status-route: aktifleştirme oturum oluşturmaz");

  // helper: secret sızıntısı yok
  const helper = readFileSync("lib/admin/accountSessionControls.ts", "utf8");
  ok(!/console\.(log|error|warn)/.test(helper), "helper: console log yok");

  console.log(`\nfaz1-p2-session-security harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Tüm P2 oturum güvenliği + hesap müdahalesi testleri geçti.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
