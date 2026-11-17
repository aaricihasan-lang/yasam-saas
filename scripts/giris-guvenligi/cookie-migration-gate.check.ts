/**
 * HTTPONLY B-1 — eski token → çerez GEÇİŞ KAPISI birim denetimi (tarayıcısız; window / document / localStorage / fetch taklidi).
 * Gerçek modüller (lib/auth/cookieMigrationGate.ts + yasamUser.ts) yüklenir; ağ yok.
 * Çalıştır: npx tsx scripts/giris-guvenligi/cookie-migration-gate.check.ts
 */
export {}; // modül kapsamı (diğer harness'lardaki global adlarla çakışmasın)

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => {
  if (c) pass++; else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 300)}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Call = { path: string; at: number; hdr: string | null };

/** Her senaryo için TAZE modül örneği (kapı sayfa başına bir kez kurulur → ayrı süreç benzetimi). */
async function scenario(opts: {
  transport: "cookie" | "header"; androidToken?: boolean; token: string | null; bootstrap: "ok" | "fail" | "hang" | "net" | "conflict"; revoked?: boolean;
}) {
  const store = new Map<string, string>();
  if (opts.token) store.set("yasam_session_token", opts.token);
  store.set("yasam_user", JSON.stringify({ id: "00000000-0000-0000-0000-00000000e001", role: "expert", email: "free@test.local" }));
  const attrs: Record<string, string> = { "data-session-transport": opts.transport };
  if (opts.androidToken) attrs["data-android-token"] = "";
  const calls: Call[] = [];
  const t0 = Date.now();
  let cookieWritten = false;
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  g.document = { documentElement: { getAttribute: (k: string) => (k in attrs ? attrs[k] : null), hasAttribute: (k: string) => k in attrs } };
  const baseFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://www.yasamsistemi.com");
    const hdr = new Headers(init?.headers).get("x-session-token");
    calls.push({ path: u.pathname, at: Date.now() - t0, hdr });
    if (u.pathname === "/api/auth/session/cookie") {
      if (opts.bootstrap === "hang") return new Promise<Response>(() => {});
      if (opts.bootstrap === "net") throw new TypeError("ağ yok");
      if (opts.bootstrap === "fail") return new Response("{}", { status: 503 });
      if (opts.bootstrap === "conflict") return new Response("{}", { status: 409 });
      await sleep(300);
      cookieWritten = true;
      return new Response("{}", { status: 200 });
    }
    if (u.pathname === "/api/auth/session") {
      // Sunucu taklidi: çerez varsa onunla; yoksa başlıktaki token ile karar (iptal edilmişse geçersiz)
      const valid = cookieWritten || (!!hdr && hdr === opts.token && !opts.revoked);
      return new Response(JSON.stringify({ valid, ...(valid ? {} : { reason: "revoked" }) }), { status: 200 });
    }
    return new Response("{}", { status: cookieWritten || hdr ? 200 : 401 });
  };
  g.window = { fetch: baseFetch, location: { origin: "https://www.yasamsistemi.com" } };
  g.fetch = (i: RequestInfo | URL, n?: RequestInit) => (g.window as { fetch: typeof fetch }).fetch(i, n);
  // tsx: her senaryoda modül önbelleğini temizle (taze kapı durumu)
  for (const k of Object.keys(require.cache)) if (/lib[\\/]auth[\\/](cookieMigrationGate|yasamUser|sessionExpiry)/.test(k)) delete require.cache[k];
  const gateMod = await import(`@/lib/auth/cookieMigrationGate?s=${Math.random()}`).catch(() => import("@/lib/auth/cookieMigrationGate"));
  gateMod.installCookieMigrationFetchGate();
  const f = (g.window as { fetch: typeof fetch }).fetch;
  return { f, calls, store, gateMod, t0, isCookie: () => cookieWritten };
}

async function main() {
  console.log("\n── 1) Geçiş bekliyor (çerez kipi + eski token, çerez henüz yok): eşzamanlı 9 panel isteği ──");
  {
    const s = await scenario({ transport: "cookie", token: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", bootstrap: "ok" });
    const paths = ["/api/trial/status", "/api/clients", "/api/dashboard/summary", "/api/numeroloji/analyses", "/api/yasam-hafizasi/health",
      "/api/numeroloji/analyses", "/api/appointments/notifications", "/api/clients", "/api/dashboard/summary"];
    const res = await Promise.all(paths.map((p) => s.f(p)));
    const boots = s.calls.filter((c) => c.path === "/api/auth/session/cookie");
    const panel = s.calls.filter((c) => !c.path.startsWith("/api/auth/session"));
    ok(res.every((r) => r.status === 200), "eşzamanlı 9 panel isteğinin HEPSİ 200 (geçiş kaynaklı 401 = 0)", res.map((r) => r.status));
    ok(boots.length === 1, `tek uçuş: bootstrap isteği 1 kez (${boots.length})`);
    ok(panel.every((c) => c.at >= boots[0].at), "panel istekleri bootstrap'tan SONRA gönderildi");
    ok(panel.every((c) => c.hdr === null), "token başlığa EKLENMEDİ (kimlik bilgisi değişmedi)");
    ok(s.store.get("yasam_session_token") === undefined, "geçiş sonrası eski token localStorage'dan silindi");
    const later = await s.f("/api/clients");
    ok(later.status === 200, "geçiş sonrası istekler beklemeden çerezle");
  }

  console.log("\n── 2) Bootstrap ASILI KALIRSA: kapı en geç ~4 sn'de açılır (sonsuz kilit yok) ──");
  {
    const s = await scenario({ transport: "cookie", token: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb", bootstrap: "hang" });
    const t = Date.now();
    const r = await s.f("/api/clients");
    const waited = Date.now() - t;
    ok(waited >= s.gateMod.COOKIE_MIGRATION_GATE_MAX_MS - 50 && waited < s.gateMod.COOKIE_MIGRATION_GATE_MAX_MS + 1500, `kapı süre tavanında açıldı (${waited} ms)`);
    ok(r.status === 401, "istek gerçek sonucunu aldı (401 GİZLENMEDİ)", r.status);
    const t2 = Date.now();
    await s.f("/api/dashboard/summary");
    ok(Date.now() - t2 < 200, "sayfa başına TEK bekleme: sonraki istek beklemedi (tekrar fırtınası yok)");
    ok(typeof s.store.get("yasam_session_token") === "string", "eski token KORUNDU (sonraki açılışta yeniden denenir)");
  }

  for (const mode of ["fail", "net"] as const) {
    console.log(`\n── 3${mode === "fail" ? "a" : "b"}) Bootstrap ${mode === "fail" ? "503 (geçici sunucu hatası)" : "ağ hatası"} ──`);
    const s = await scenario({ transport: "cookie", token: "cccccccc-1111-4111-8111-cccccccccccc", bootstrap: mode });
    const t = Date.now();
    const r = await s.f("/api/clients");
    ok(Date.now() - t < 1500 && r.status === 401, `kapı hemen açıldı, gerçek sonuç döndü (${Date.now() - t} ms, ${r.status})`);
    ok(typeof s.store.get("yasam_session_token") === "string", "eski token KORUNDU (sessiz çıkış yok)");
  }

  console.log("\n── 3c) Bootstrap 409 (tarayıcıda BAŞKA kullanıcının çerez oturumu var) ──");
  {
    const s = await scenario({ transport: "cookie", token: "12121212-1111-4111-8111-121212121212", bootstrap: "conflict" });
    const r = await s.f("/api/clients");
    ok(s.store.get("yasam_session_token") === undefined, "yabancı eski token JS depolamasından SİLİNDİ");
    ok(r.status === 401, "istek mevcut kimlik bilgisiyle devam etti (bu taklitte çerez yok → gerçek sonuç 401, gizlenmedi)", r.status);
  }

  console.log("\n── 3d) Geçiş başarısız (503) iken oturum denetimi geçerli kullanıcıyı ÇIKIŞA DÜŞÜRMEZ; iptal edilmişse düşürür ──");
  {
    const s = await scenario({ transport: "cookie", token: "34343434-1111-4111-8111-343434343434", bootstrap: "fail" });
    const se = await import("@/lib/auth/sessionExpiry");
    const st = await se.checkSessionStatus();
    const statusCall = s.calls.filter((c) => c.path === "/api/auth/session").pop();
    ok(st?.valid === true, "geçerli eski oturum: durum denetimi 'geçerli' (yanlış çıkış YOK)", st);
    ok(statusCall?.hdr === "34343434-1111-4111-8111-343434343434", "karar JS deposundaki eski token'a soruldu (yeni açılım yok)");
    const r = await scenario({ transport: "cookie", token: "56565656-1111-4111-8111-565656565656", bootstrap: "fail", revoked: true });
    const se2 = await import("@/lib/auth/sessionExpiry");
    const st2 = await se2.checkSessionStatus();
    ok(st2?.valid === false, "iptal edilmiş eski oturum: 'geçersiz' (gerçek iptal gizlenmez)", st2);
    void r;
  }

  console.log("\n── 4) Kapı DIŞI: geçişin kendi uçları + yabancı köken ──");
  {
    const s = await scenario({ transport: "cookie", token: "dddddddd-1111-4111-8111-dddddddddddd", bootstrap: "hang" });
    const t = Date.now();
    await s.f("/api/auth/session", { method: "POST" });
    await s.f("https://cdn.example.com/x.js");
    ok(Date.now() - t < 200, "/api/auth/session ve yabancı köken istekleri beklemedi (kilitlenme yok)");
    ok(s.gateMod.isGatedRequestPath("/api/clients") && !s.gateMod.isGatedRequestPath("/api/auth/session") && !s.gateMod.isGatedRequestPath("/api/auth/session/cookie") && !s.gateMod.isGatedRequestPath("/m/onay")
      && !s.gateMod.isGatedRequestPath("/api/auth/mfa/complete") && !s.gateMod.isGatedRequestPath("/api/auth/mfa/email/verify")
      && s.gateMod.isGatedRequestPath("/api/auth/profile") && s.gateMod.isGatedRequestPath("/api/auth/admin-session"),
      "yol sınıflaması: /api/* evet (profil, admin-session, indirmeler dahil); /api/auth/session* ve /api/auth/mfa/* hayır; sayfa yolları hayır");
  }

  console.log("\n── 5) Değişmeyen durumlar (kapı devreye GİRMEZ) ──");
  for (const [label, o] of [
    ["Android header kipi (data-android-token)", { transport: "header" as const, androidToken: true, token: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee", bootstrap: "hang" as const }],
    ["web header kipi (kill-switch)", { transport: "header" as const, token: "ffffffff-1111-4111-8111-ffffffffffff", bootstrap: "hang" as const }],
    ["web çerez kullanıcısı (token yok)", { transport: "cookie" as const, token: null, bootstrap: "hang" as const }],
  ] as const) {
    const s = await scenario(o);
    const t = Date.now();
    await s.f("/api/clients");
    ok(Date.now() - t < 200 && !s.calls.some((c) => c.path === "/api/auth/session/cookie"), `${label}: bekleme yok, bootstrap yok`);
  }
  {
    // Çerez zaten yazılmış (parmak izi hazır) → bekleme yok
    const s = await scenario({ transport: "cookie", token: "99999999-1111-4111-8111-999999999999", bootstrap: "hang" });
    const yu = await import("@/lib/auth/yasamUser");
    // parmak izini gerçek işlevle yazdır: bootstrap başarılıymış gibi (ensure içindeki işaret)
    let h = 0x811c9dc5; const tok = "99999999-1111-4111-8111-999999999999";
    for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    s.store.set("yasam_cookie_session_fp", (h >>> 0).toString(16));
    ok(yu.isWebCookieMigrationPending() === false, "çerez zaten yazılmış (parmak izi eşleşiyor) → geçiş beklemiyor");
  }

  console.log(`\ncookie-migration-gate: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
