/**
 * S6 (I18N-F1-R5, TARAYICI kök neden) — hesap değişiminde önceki hesabın GEÇ dönen /api/auth/profile yanıtı
 * localStorage'a yazılmamalı. Ağ / DB / sır YOK: sahte window + localStorage + gecikmeli fetch.
 * Çalıştırma: npx tsx scripts/auth-s6/stale-profile-sync.test.ts
 *
 * Senaryolar:
 *  1) A senkronu başlar → B'ye geçiş (kullanıcı + token) → A yanıtı döner → localStorage B kalır; sonuç "unavailable".
 *  2) A senkronu başlar → çıkış (kayıt + token silinir) → A yanıtı döner → hiçbir şey geri yazılmaz.
 *  3) Bağlam değişmezse (regresyon yok) → A'nın güncel profili yazılır; sonuç "fresh".
 *  4) Yalnız token değişirse (aynı kullanıcı, yeni oturum) → bayat yanıt yazılmaz.
 *  5) Sunucu farklı kimlikli profil döndürürse → yazılmaz.
 */
// Modül kapsamı (tam tsc'de diğer harness'larla genel kapsam çakışması olmasın — TS2451).
export {};

type Store = Map<string, string>;
const store: Store = new Map();
const localStorageShim = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = localStorageShim;
g.window = { localStorage: localStorageShim, location: { pathname: "/" } };

let pending: Array<(r: Response) => void> = [];
let calls: Array<{ url: string; userId: string | null }> = [];
g.fetch = (url: string, init?: { headers?: Record<string, string> }) => {
  calls.push({ url: String(url), userId: init?.headers?.["x-user-id"] ?? null });
  return new Promise<Response>((resolve) => pending.push(resolve));
};
const profileResponse = (row: Record<string, unknown>) =>
  new Response(JSON.stringify({ profile: row }), { status: 200, headers: { "content-type": "application/json" } });

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string, d?: unknown) => {
  if (c) { pass++; console.log(`  PASS ${m}`); }
  else { fail++; console.error(`  FAIL ${m}${d !== undefined ? " — " + JSON.stringify(d) : ""}`); }
};
const tick = () => new Promise((r) => setTimeout(r, 0));

async function main(): Promise<void> {
  const ya = await import("../../lib/auth/yasamUser");
  const A = { id: "aaaaaaaa-0000-4000-8000-00000000000a", role: "expert", email: "a@example.test", full_name: "Uzman A" };
  const B = { id: "bbbbbbbb-0000-4000-8000-00000000000b", role: "expert", email: "b@example.test", full_name: "Uzman B" };
  const userKey = "yasam_user";
  const tokenKeyOf = () => [...store.keys()].find((k) => k !== userKey && /token/i.test(k));
  const setSession = (u: typeof A | null, token: string | null) => {
    store.clear();
    if (u) ya.saveYasamUser(ya.parseLoginUserRecord(u)!);
    if (token) ya.saveSessionToken(token);
  };
  const storedId = () => ya.readYasamUser()?.id ?? null;

  console.log("\n[S6 — bayat profil yanıtı yazılmaz]");

  // 1) A → B geçişi
  setSession(A, "tok-A");
  ok(!!tokenKeyOf() && ya.readSessionToken() === "tok-A", "ön koşul: header taşıması, token okunur");
  pending = []; calls = [];
  const p1 = ya.syncYasamUserFromDbOutcome(undefined, { force: true });
  await tick();
  ok(calls.length === 1 && calls[0].userId === A.id, "A senkronu başladı (x-user-id = A)");
  setSession(B, "tok-B");
  pending.shift()!(profileResponse({ ...A, full_name: "Uzman A (güncel)" }));
  const r1 = await p1;
  ok(storedId() === B.id && ya.readSessionToken() === "tok-B", "A'nın geç yanıtı sonrası localStorage B kalır", { storedId: storedId() });
  ok(r1.kind === "unavailable", "bayat yanıt 'unavailable' (açık red değil → çıkış/erişim reddi üretmez)", r1);

  // 2) A → çıkış
  setSession(A, "tok-A2");
  pending = []; calls = [];
  const p2 = ya.syncYasamUserFromDbOutcome(undefined, { force: true });
  await tick();
  store.clear();
  pending.shift()!(profileResponse(A));
  const r2 = await p2;
  ok(storedId() === null && !tokenKeyOf(), "çıkış yapılmış hesabın profili geri yazılmaz", [...store.keys()]);
  ok(r2.kind === "unavailable", "çıkış sonrası sonuç 'unavailable'");

  // 3) değişiklik yok → yazılır
  setSession(A, "tok-A3");
  pending = []; calls = [];
  const p3 = ya.syncYasamUserFromDbOutcome(undefined, { force: true });
  await tick();
  pending.shift()!(profileResponse({ ...A, full_name: "Uzman A (güncel)" }));
  const r3 = await p3;
  ok(r3.kind === "fresh" && ya.readYasamUser()?.full_name === "Uzman A (güncel)", "bağlam aynı → güncel profil yazılır (regresyon yok)", ya.readYasamUser());

  // 4) aynı kullanıcı, yeni oturum token'ı
  setSession(A, "tok-A4");
  pending = []; calls = [];
  const p4 = ya.syncYasamUserFromDbOutcome(undefined, { force: true });
  await tick();
  const before = store.get(userKey);
  ya.saveSessionToken("tok-A5");
  pending.shift()!(profileResponse({ ...A, full_name: "Eski oturum yanıtı" }));
  const r4 = await p4;
  ok(r4.kind === "unavailable" && store.get(userKey) === before, "yalnız token değişti → eski oturum yanıtı yazılmaz");

  // 5) sunucu farklı kimlik döndürür
  setSession(A, "tok-A6");
  pending = []; calls = [];
  const p5 = ya.syncYasamUserFromDbOutcome(undefined, { force: true });
  await tick();
  pending.shift()!(profileResponse(B));
  const r5 = await p5;
  ok(r5.kind === "unavailable" && storedId() === A.id, "yanıt kimliği istekle uyuşmuyor → yazılmaz");

  console.log(`\n=== S6 bayat profil senkronu: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
