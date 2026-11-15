/**
 * F4 — Üyeliğim sekmesinin okuduğu MEVCUT uçların kimlik ayrımı harness'ı (tsx; gerçek DB / ağ YOK).
 *
 * Gerçek route handler'ları (GET /api/auth/profile, GET /api/trial/status) global `fetch` üzerine kurulan
 * küçük bir SAHTE PostgREST ile koşar (URL: http://fake-supabase.local). Doğrulanan:
 *   - Oturum sahibi kendi profilini alır; password/password_hash ve lisans/cihaz kolonları DÖNMEZ.
 *   - Başka kullanıcının id'si + kendi token'ı → 403 (token↔user binding), gövdede yabancı veri yok.
 *   - Token yok → 401; geçersiz token → 401; onay bekleyen → 403 "henüz onaylanmadı".
 *   - /api/trial/status aynı guard: yabancı id → 403; Premium → { trial: null }; deneme uzmanı kendi kredisini görür.
 *
 * Çalıştır: npx tsx scripts/settings-membership/profile-guard.harness.ts
 */
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake-supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
delete process.env.SESSION_EXPIRY_ENFORCE;
delete process.env.SESSION_COOKIE_MODE;

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)); }
}

type Row = Record<string, unknown>;
const NOW = Date.now();
const U = {
  ayse: "00000000-0000-0000-0000-00000000f4a1",
  mehmet: "00000000-0000-0000-0000-00000000f4b1",
  pending: "00000000-0000-0000-0000-00000000f4c1",
  trial: "00000000-0000-0000-0000-00000000f4d1",
};
const T = { a: "10000000-0000-0000-0000-00000000f4a1", b: "10000000-0000-0000-0000-00000000f4b1" };

function user(id: string, tenant: string, email: string, extra: Row = {}): Row {
  return {
    id, tenant_id: tenant, email, full_name: email.split("@")[0], name: null, role: "expert", active: true,
    approval_status: "approved", module_permissions: { clients: true }, package_type: "premium", plan: "premium",
    membership_status: "active", subscription_status: "active", trial_started_at: null, trial_ends_at: null,
    membership_started_at: "2026-10-01T07:30:00Z", membership_ends_at: null, admin_level: null, status: "active",
    is_demo_account: false, trial_kind: null, trial_status: null,
    password: "GIZLI-PAROLA", password_hash: "$2b$gizli", allowed_active_sessions: 3, license_note: "iç not",
    ...extra,
  };
}
const users: Row[] = [
  user(U.ayse, T.a, "ayse.yilmaz@example.invalid"),
  user(U.mehmet, T.b, "mehmet.kaya@example.invalid", { membership_ends_at: "2027-01-01T00:00:00Z" }),
  user(U.pending, T.a, "bekleyen@example.invalid", { approval_status: "pending" }),
  user(U.trial, T.b, "deneme@example.invalid", {
    package_type: null, plan: null, trial_kind: "self_7d", trial_status: "active",
    trial_started_at: new Date(NOW - 24 * 3600_000).toISOString(), trial_ends_at: new Date(NOW + 144 * 3600_000).toISOString(),
  }),
];
const sessions: Record<string, string> = {
  "tok-ayse": U.ayse,
  "tok-mehmet": U.mehmet,
  "tok-pending": U.pending,
  "tok-trial": U.trial,
};
const rpcCalls: string[] = [];

/** PostgREST select listesini uygular (route'un whitelist'i dışındaki kolonlar sızmasın diye). */
function project(r: Row, select: string | null): Row {
  if (!select || select === "*") return r;
  const out: Row = {};
  for (const c of select.split(",").map((s) => s.trim()).filter(Boolean)) out[c] = r[c];
  return out;
}
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host !== "fake-supabase.local") throw new Error(`Beklenmeyen ağ isteği: ${url.href}`);
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const body = init?.body ? (JSON.parse(String(init.body)) as Row) : {};
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    rpcCalls.push(name);
    if (name === "touch_active_session") return jsonRes(sessions[String(body.p_token ?? "")] ?? null);
    if (name === "trial_activate_on_login") return jsonRes({ ok: true, phase: "active", activated: false });
    if (name === "trial_credit_usage") {
      return jsonRes({ day: "2026-11-10", daily_limit: 50, module_limits: {}, used_total: body.p_user_id === U.trial ? 7 : 0, used_by_module: {} });
    }
    return jsonRes({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
  }
  if (path === "users") {
    const filters = [...url.searchParams.entries()].filter(([k]) => !["select", "limit"].includes(k));
    const rows = users.filter((r) => filters.every(([k, v]) => v.startsWith("eq.") && String(r[k]) === v.slice(3)));
    return jsonRes(rows.map((r) => project(r, url.searchParams.get("select"))));
  }
  if (path === "pro_upgrade_requests") return jsonRes([]);
  if (path === "store_settings") return jsonRes([]);
  return jsonRes([]);
}) as typeof fetch;

function req(url: string, userId: string | null, token: string | null): NextRequest {
  const h: Record<string, string> = {};
  if (userId) h["x-user-id"] = userId;
  if (token) h["x-session-token"] = token;
  return new NextRequest(url, { headers: h });
}

async function main() {
  const { GET: profileGET } = await import("@/app/api/auth/profile/route");
  const { GET: trialGET } = await import("@/app/api/trial/status/route");
  const P = "http://localhost/api/auth/profile";

  console.log("\n── /api/auth/profile — oturum sahibi ──");
  const own = await profileGET(req(P, U.ayse, "tok-ayse"));
  const ownJson = (await own.json()) as { ok?: boolean; profile?: Row };
  ok(own.status === 200 && ownJson.ok === true && ownJson.profile?.id === U.ayse, "kendi profili 200", ownJson);
  ok(ownJson.profile?.package_type === "premium" && ownJson.profile?.membership_started_at === "2026-10-01T07:30:00Z", "paket + üyelik tarihleri sözleşmede");
  const keys = Object.keys(ownJson.profile ?? {});
  ok(!keys.includes("password") && !keys.includes("password_hash"), "parola alanları dönmez", keys);
  ok(!keys.includes("allowed_active_sessions") && !keys.includes("license_note"), "cihaz kotası / lisans notu bu uçta yok (Üyeliğim'de gösterilmez)", keys);

  console.log("\n── /api/auth/profile — başka kullanıcı / tenant ──");
  const foreign = await profileGET(req(P, U.mehmet, "tok-ayse"));
  const foreignText = await foreign.text();
  ok(foreign.status === 403, "başka kullanıcının id'si + kendi token'ı → 403", foreign.status);
  ok(!foreignText.includes("mehmet") && !foreignText.includes(T.b) && !foreignText.includes("2027-01-01"), "403 gövdesinde yabancı veri yok", foreignText);
  const noTok = await profileGET(req(P, U.ayse, null));
  ok(noTok.status === 401, "token yok → 401");
  const badTok = await profileGET(req(P, U.ayse, "tok-yok"));
  ok(badTok.status === 401, "geçersiz token → 401");
  const noId = await profileGET(req(P, null, "tok-ayse"));
  ok(noId.status === 401, "x-user-id yok → 401");
  const pend = await profileGET(req(P, U.pending, "tok-pending"));
  const pendJson = (await pend.json()) as { error?: string };
  ok(pend.status === 403 && String(pendJson.error).includes("onaylanmadı"), "onay bekleyen → 403 'henüz onaylanmadı' (istemci 'Onay bekliyor' gösterir)", pendJson);

  console.log("\n── /api/trial/status — aynı guard ──");
  const S = "http://localhost/api/trial/status";
  const tForeign = await trialGET(req(S, U.trial, "tok-ayse"));
  ok(tForeign.status === 403, "deneme uzmanının id'si + başkasının token'ı → 403");
  const tPrem = await trialGET(req(S, U.ayse, "tok-ayse"));
  ok(tPrem.status === 200 && ((await tPrem.json()) as Row).trial === null, "Premium → { trial: null }");
  const before = rpcCalls.length;
  const tOwn = await trialGET(req(S, U.trial, "tok-trial"));
  const tJson = (await tOwn.json()) as { trial?: { phase?: string; credits?: { dailyLimit: number; usedTotal: number } } };
  ok(tOwn.status === 200 && tJson.trial?.phase === "active" && tJson.trial?.credits?.usedTotal === 7 && tJson.trial?.credits?.dailyLimit === 50, "deneme uzmanı kendi kredisini okur (7 / 50)", tJson);
  const called = rpcCalls.slice(before);
  ok(called.includes("trial_credit_usage") && !called.includes("trial_credit_reserve") && !called.includes("trial_activate_on_login"), "aktif denemede yalnız sayaç OKUMA (rezervasyon / aktivasyon yok)", called);

  console.log(`\nToplam: ${pass} geçti, ${fail} kaldı`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
