/**
 * FINAL-A3 — auth/üyelik guard: SAF DAVRANIŞ testleri (DB/ağ YOK; sahte db + sahte fetch).
 *
 *  A) resolveAdminShellSession: geçici RPC/DB hatası "unavailable" (layout redirect ETMEZ),
 *     açık red "denied" (redirect korunur), geçerli admin "admin".
 *  B) probeBeslenmeAccess: 401/403/access=false → denied; 5xx / ağ / bozuk yanıt → unavailable.
 *  C) syncYasamUserFromDbOutcome: 5xx / ağ / profilsiz 200 → unavailable; 401/403/404 → rejected;
 *     200+profil → fresh (+ localStorage yazılır). Eski refresh/sync API'si null davranışını korur.
 *
 * Çalıştır: npx tsx scripts/final-a3/unit.harness.ts
 */
let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail = ""): void {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? "  → " + detail : ""}`);
}

// ── Tarayıcı ortamı (localStorage + window) — modüller import edilmeden önce kurulur ─────────
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const g = globalThis as Record<string, unknown>;
g.localStorage = localStorageStub;
g.window = globalThis;
g.document = { cookie: "", visibilityState: "visible" };
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 final-a3-harness" },
  configurable: true,
});

type FetchResp = { status: number; json?: unknown; throws?: boolean };
let nextFetch: (url: string) => FetchResp = () => ({ status: 200, json: {} });
const fetchLog: string[] = [];
g.fetch = async (input: unknown) => {
  const url = String(input);
  fetchLog.push(url);
  const r = nextFetch(url);
  if (r.throws) throw new TypeError("Failed to fetch");
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => {
      if (r.json === undefined) throw new SyntaxError("Unexpected end of JSON input");
      return r.json;
    },
  };
};

async function main() {
  const { resolveAdminShellSession } = await import("../../lib/auth/adminShellSession");
  const { probeBeslenmeAccess, checkBeslenmeAccess } = await import("../../lib/beslenme/beslenmeClient");
  const ym = await import("../../lib/auth/yasamUser");

  // ── A) Admin kabuk ─────────────────────────────────────────────────────────
  const ADMIN = "00000000-0000-4000-8000-0000000000ad";
  const TOKEN = "zz-admin-token-0000000001";
  type Rpc = { data?: unknown; error?: unknown; throws?: boolean };
  type Row = { data?: unknown; error?: unknown };
  function fakeDb(rpc: Rpc, row: Row) {
    return {
      rpc: async () => {
        if (rpc.throws) throw new Error("fetch failed");
        return { data: rpc.data ?? null, error: rpc.error ?? null };
      },
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: row.data ?? null, error: row.error ?? null }),
        };
        return q;
      },
    } as never;
  }
  const adminRow = { id: ADMIN, role: "admin", active: true };
  process.env.SESSION_EXPIRY_ENFORCE = "true";
  let r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { data: adminRow }), TOKEN);
  ok("A1 geçerli admin oturumu → admin", r.status === "admin" && "adminId" in r && r.adminId === ADMIN, JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ error: { message: "503 Service Unavailable" } }, { data: adminRow }), TOKEN);
  ok("A2 touch_active_session RPC hatası → unavailable (redirect YOK)", r.status === "unavailable", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ throws: true }, { data: adminRow }), TOKEN);
  ok("A3 RPC ağ istisnası → unavailable", r.status === "unavailable", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { error: { message: "timeout" } }), TOKEN);
  ok("A4 users sorgu hatası → unavailable", r.status === "unavailable", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: null }, { data: adminRow }), TOKEN);
  ok("A5 oturum aktif değil (iptal/süre dolumu) → denied", r.status === "denied", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { data: { id: ADMIN, role: "expert", active: true } }), TOKEN);
  ok("A6 uzman token'ı → denied (yetki gevşemedi)", r.status === "denied", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { data: { ...adminRow, active: false } }), TOKEN);
  ok("A7 pasif admin → denied", r.status === "denied", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { data: null }), TOKEN);
  ok("A8 kullanıcı satırı yok → denied", r.status === "denied", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { data: adminRow }), "kısa");
  ok("A9 biçimsiz/eksik token → denied (DB'ye gidilmez)", r.status === "denied", JSON.stringify(r));
  r = await resolveAdminShellSession(fakeDb({ data: ADMIN }, { data: adminRow }), undefined);
  ok("A10 cookie yok → denied", r.status === "denied", JSON.stringify(r));

  // ── B) Beslenme probe ──────────────────────────────────────────────────────
  const cases: Array<[string, FetchResp, string]> = [
    ["B1 200 access:true → ok", { status: 200, json: { ok: true, access: true } }, "ok"],
    ["B2 403 MODULE_DENIED → denied", { status: 403, json: { code: "MODULE_DENIED" } }, "denied"],
    ["B3 403 MEMBERSHIP_INACTIVE → denied", { status: 403, json: { code: "MEMBERSHIP_INACTIVE" } }, "denied"],
    ["B4 401 oturum geçersiz → denied", { status: 401, json: { error: "x" } }, "denied"],
    ["B5 200 ok:true access:false → denied", { status: 200, json: { ok: true, access: false } }, "denied"],
    ["B6 503 → unavailable", { status: 503, json: { error: "x" } }, "unavailable"],
    ["B7 500 → unavailable", { status: 500, json: {} }, "unavailable"],
    ["B8 502 gövdesiz → unavailable", { status: 502 }, "unavailable"],
    ["B9 ağ hatası → unavailable", { status: 0, throws: true }, "unavailable"],
    ["B10 200 bozuk/boş yanıt → unavailable", { status: 200 }, "unavailable"],
  ];
  for (const [name, resp, want] of cases) {
    nextFetch = () => resp;
    const got = await probeBeslenmeAccess();
    ok(name, got === want, `got=${got}`);
  }
  nextFetch = () => ({ status: 503, json: {} });
  ok("B11 checkBeslenmeAccess (geriye uyum) 503 → false", (await checkBeslenmeAccess()) === false);
  nextFetch = () => ({ status: 200, json: { ok: true, access: true } });
  ok("B12 checkBeslenmeAccess 200 → true", (await checkBeslenmeAccess()) === true);

  // ── C) Profil senkronu ─────────────────────────────────────────────────────
  const EXPERT = "00000000-0000-4000-8000-0000000000e1";
  const cachedInactive = {
    id: EXPERT, email: "zz@example.invalid", role: "expert", active: true, approval_status: "approved",
    package_type: "basic", tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", module_permissions: { numerology: true },
  };
  const freshProfile = { ...cachedInactive, package_type: "premium", membership_status: "active" };
  store.set("yasam_user", JSON.stringify(cachedInactive));
  store.set("yasam_session_token", "zz-local-fake-token-0001");

  const syncCases: Array<[string, FetchResp, string]> = [
    ["C1 profil 503 → unavailable", { status: 503, json: { error: "x" } }, "unavailable"],
    ["C2 profil 500 → unavailable", { status: 500, json: {} }, "unavailable"],
    ["C3 profil ağ hatası → unavailable", { status: 0, throws: true }, "unavailable"],
    ["C4 profil 200 ama profile yok (null cevap) → unavailable", { status: 200, json: { ok: true, profile: null } }, "unavailable"],
    ["C5 profil 401 → rejected", { status: 401, json: { error: "x" } }, "rejected"],
    ["C6 profil 403 → rejected", { status: 403, json: { error: "x" } }, "rejected"],
    ["C7 profil 404 → rejected", { status: 404, json: { error: "x" } }, "rejected"],
  ];
  for (const [name, resp, want] of syncCases) {
    ym.invalidateYasamUserSyncCache();
    nextFetch = (u) => (u.includes("/api/auth/profile") ? resp : { status: 200, json: { valid: true } });
    const out = await ym.syncYasamUserFromDbOutcome(ym.readYasamUser(), { force: true });
    ok(name, out.kind === want, `got=${out.kind}`);
    ok(`${name.slice(0, 3)} önbellek değişmedi (bayat kayıt üzerine yazılmadı)`, JSON.parse(store.get("yasam_user")!).package_type === "basic");
  }
  ym.invalidateYasamUserSyncCache();
  nextFetch = (u) => (u.includes("/api/auth/profile") ? { status: 503, json: {} } : { status: 200, json: { valid: true } });
  ok("C8 eski syncYasamUserFromDb API'si geçici hatada null (geriye uyum)", (await ym.syncYasamUserFromDb(ym.readYasamUser(), { force: true })) === null);
  ok("C9 eski refreshYasamUserFromDb API'si geçici hatada null", (await ym.refreshYasamUserFromDb(ym.readYasamUser()!)) === null);

  ym.invalidateYasamUserSyncCache();
  nextFetch = (u) => (u.includes("/api/auth/profile") ? { status: 200, json: { ok: true, profile: freshProfile } } : { status: 200, json: { valid: true } });
  const fresh = await ym.syncYasamUserFromDbOutcome(ym.readYasamUser(), { force: true });
  ok("C10 profil 200 → fresh", fresh.kind === "fresh" && fresh.user.package_type === "premium", JSON.stringify(fresh).slice(0, 200));
  ok("C11 fresh sonuç önbelleğe yazıldı (bayat red düzeldi)", JSON.parse(store.get("yasam_user")!).package_type === "premium");
  const before = fetchLog.filter((u) => u.includes("/api/auth/profile")).length;
  const again = await ym.syncYasamUserFromDbOutcome(ym.readYasamUser());
  const after = fetchLog.filter((u) => u.includes("/api/auth/profile")).length;
  ok("C12 TTL içinde ikinci çağrı fresh + ağ yok", again.kind === "fresh" && after === before, `before=${before} after=${after}`);

  console.log(`\nFINAL-A3 unit: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
