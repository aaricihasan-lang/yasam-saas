// USAGE360 NİHAİ KAPANIŞ — CANLI SALT-OKUNUR GÜVENLİK SMOKE'u (kimliksiz; hiçbir şey YAZMAZ).
// Yalnız: kimliksiz GET'ler + reddedilmesi beklenen POST'lar (beacon kimliksiz asla yazmaz)
// + Supabase REST'e yayındaki PUBLIC anon anahtarıyla doğrudan erişim denemesi (reddedilmeli).
// Gerçek kullanıcı verisi / içerik uçları ÇAĞRILMAZ.
//
// Kullanım:
//   node scripts/usage360/prod-readonly-smoke.mjs https://www.yasamsistemi.com --flag=on
//   (--flag=off: USAGE360_ENABLED kapalıyken beklenen davranış; --skip-supabase: yerel prova)
const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:\/\//.test(a)) ?? "https://www.yasamsistemi.com").replace(/\/$/, "");
const FLAG = (args.find((a) => a.startsWith("--flag=")) ?? "--flag=on").slice(7);
const SKIP_SB = args.includes("--skip-supabase");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const req = async (path, init = {}) => {
  const r = await fetch(BASE + path, { redirect: "manual", ...init, headers: { "cache-control": "no-cache", ...(init.headers ?? {}) } });
  const text = await r.text().catch(() => "");
  return { status: r.status, text };
};
const beacon = (body) => req("/api/usage/beacon", { method: "POST", headers: { "content-type": "application/json" }, body });

console.log(`\nHedef: ${BASE} · beklenen flag: ${FLAG}`);

console.log("\n[admin Usage360 API — kimliksiz]");
const today = new Date().toISOString().slice(0, 10);
for (const p of ["/api/admin/expert-stats/usage360/experts",
  `/api/admin/expert-stats/usage360/detail?userId=00000000-0000-0000-0000-000000000000&from=${today}&to=${today}`,
  `/api/admin/expert-stats/usage360/timeline?userId=00000000-0000-0000-0000-000000000000&from=${today}&to=${today}`]) {
  const r = await req(p);
  ok(r.status === 401 || r.status === 403, `${p.split("?")[0]} → ${r.status} (401/403 beklenir)`);
  ok(!/"rows"\s*:|"measurementStart"/.test(r.text), `${p.split("?")[0]} gövdesi veri içermez`);
}
for (const p of ["/api/admin/users/00000000-0000-0000-0000-000000000000/security-events", "/api/admin/users/00000000-0000-0000-0000-000000000000/active-sessions"]) {
  const r = await req(p);
  ok(r.status === 401 || r.status === 403, `${p} → ${r.status} (401/403)`);
}

console.log("\n[beacon — kimliksiz, yazmaz]");
if (FLAG === "on") {
  ok((await beacon("{bozuk")).status === 400, "bozuk JSON → 400 (bayrak AÇIK kanıtı)");
  ok((await beacon(JSON.stringify({ kind: "ping", user_id: "11111111-1111-1111-1111-111111111111" }))).status === 400, "istemci user_id spoof → 400 unknown_property");
  ok((await beacon(JSON.stringify({ kind: "record_created", module: "clients" }))).status === 400, "istemciden CREATE olayı → 400 invalid_kind");
  ok((await beacon(JSON.stringify({ kind: "module_opened", module: "clients", note: "x" }))).status === 400, "serbest alan → 400");
  const huge = (await beacon("x".repeat(9000))).status;
  ok(huge === 413 || huge === 400, `aşırı büyük gövde → ${huge} (413/400)`);
  const valid = await beacon(JSON.stringify({ kind: "ping" }));
  ok(valid.status === 401 || valid.status === 403, `geçerli ping ama kimliksiz → ${valid.status} (401/403; yazılmaz)`);
} else {
  ok((await beacon("{bozuk")).status === 204, "bayrak KAPALI: her beacon 204 no-op");
}

console.log("\n[istek doğrulama — kimliksiz reddi önce gelir]");
const big = await req(`/api/admin/expert-stats/usage360/detail?userId=x&from=2020-01-01&to=${today}`);
ok(big.status === 401 || big.status === 403 || big.status === 400, `aşırı aralık kimliksiz → ${big.status} (asla 200)`);

console.log("\n[gizlilik politikası]");
const gp = await req("/gizlilik-politikasi");
const flat = gp.text.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
ok(gp.status === 200, `/gizlilik-politikasi → ${gp.status}`);
ok(flat.includes("Teknik Kullanım İstatistikleri"), "Teknik Kullanım İstatistikleri bölümü yayında");
ok(flat.includes("yalnızca sistem üzerinde bir işlem gerçekleştiğini gösterir"), "owner metni (işlem içeriği değil) yayında");
ok(flat.includes("rutin olarak görüntülenmesine dayanmamasıdır"), "owner metni son paragraf yayında");
for (const banned of ["hiçbir koşulda", "hesabına giremez", "takip edilmektedir"]) ok(!flat.toLocaleLowerCase("tr").includes(banned), `yasaklı ifade yok: "${banned}"`);

if (!SKIP_SB) {
  console.log("\n[Supabase REST — PUBLIC anon anahtarıyla doğrudan erişim reddedilmeli]");
  const home = await req("/");
  const chunks = [...new Set([...home.text.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
  let sbUrl = null, anon = null;
  for (const c of chunks) {
    const js = (await req(c)).text;
    sbUrl ??= js.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null;
    anon ??= js.match(/sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/)?.[0] ?? null;
    if (sbUrl && anon) break;
  }
  ok(sbUrl === "https://ylasompuxavjvimbbfgd.supabase.co", `yayındaki Supabase hedefi: ${sbUrl}`);
  if (sbUrl && anon) {
    const H = { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" };
    for (const t of ["usage_visits", "usage_daily", "usage_daily_modules", "expert_usage_events"]) {
      const r = await fetch(`${sbUrl}/rest/v1/${t}?select=*&limit=1`, { headers: H });
      const body = await r.text();
      ok(r.status >= 400 || body.trim() === "[]", `anon SELECT ${t} → ${r.status} (reddedilir / 0 satır)`);
    }
    for (const [fn, payload] of [["usage360_expert_list", {}], ["usage360_expert_timeline", { p_user_id: "00000000-0000-0000-0000-000000000000" }],
      ["usage360_retention_purge", { p_dry_run: true }], ["security_ip_retention_purge", { p_dry_run: true }], ["usage360_track", {}]]) {
      const r = await fetch(`${sbUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(payload) });
      ok(r.status === 401 || r.status === 403 || r.status === 404, `anon RPC ${fn} → ${r.status} (reddedilir)`);
    }
  } else {
    ok(false, "yayındaki anon anahtar bulunamadı (Supabase kontrolü yapılamadı)");
  }
}

console.log(`\n──────────\nPROD READ-ONLY SMOKE: PASS ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
