// KAMPANYA MERKEZİ KM-2 — Owner API işleyicileri testi (DB/ağ yok; sahte admin doğrulayıcı + sahte service-role istemcisi).
// Kapsam: Owner olmayan her istek aynı 404 (admin / demo / pasif / doğrulayıcı hatası), aynı köken, 415/413/400, alan izin listesi
// (toplu atama yok), actorId yalnız doğrulanmış kimlikten, CTA / görsel / katalog / PHS onayı / yorum kaynağı / 0 kredi zorlaması,
// sürüm çakışması ve tek yayındaki kampanya → 409, DB hatası → 500 (iç ayrıntı sızmaz), silme koruması (ad onayı), istatistik penceresi.
// Çalıştırma: npx tsx scripts/campaign/owner-api.test.ts
import { NextRequest } from "next/server";
import { handleCampaignGet, handleCampaignPost } from "@/lib/campaign/ownerHandlers";
import { CAMPAIGN_CATALOG } from "@/lib/campaign/catalog";
import type { AdminGuardResult } from "@/lib/auth/adminGuard";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

process.env.SESSION_COOKIE_ALLOWED_ORIGINS = "https://yasamsistemi.com";
const ORIGIN = "https://yasamsistemi.com";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const ADMIN = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const DEMO = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const INACTIVE = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d";
const C1 = "11111111-1111-4111-8111-111111111111";
const RID = "22222222-2222-4222-8222-222222222222";
const USERS: Record<string, Record<string, unknown>> = {
  [OWNER]: { role: "admin", active: true, is_super_admin: true, is_demo_account: false },
  [ADMIN]: { role: "admin", active: true, is_super_admin: false, is_demo_account: false },
  [DEMO]: { role: "admin", active: true, is_super_admin: true, is_demo_account: true },
  [INACTIVE]: { role: "admin", active: false, is_super_admin: true, is_demo_account: false },
};

type Rpc = { fn: string; args: Record<string, unknown> };
type Opts = { rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown } | Error; tableError?: boolean };
function fakeDb(opts: Opts = {}) {
  const calls: Rpc[] = [];
  const tables: Record<string, unknown[]> = {
    campaign_settings: [{ kill_switch: false, global_daily_credit_budget: 100, version: 1 }],
    campaigns: [{ id: C1, name: "Kasım kampanyası", status: "kapali", version: 3 }],
    campaign_techniques: [{ campaign_id: C1, technique_key: "hd:bodygraph", enabled: true }],
    campaign_usage_daily: [{ day_tr: "2026-11-01", scope: "global", used_analyses: 0, reserved_analyses: 0, spent_credits: 0, reserved_credits: 0 }],
    campaign_text_templates: [],
    campaign_provider_state: [],
    campaign_audit_log: [],
  };
  function chain(table: string) {
    const st: { id?: string } = {};
    const res = () => (opts.tableError ? { data: null, error: { message: "boom" } } : { data: tables[table] ?? [], error: null });
    const q: Record<string, unknown> = {
      select: () => q, is: () => q, order: () => q, gte: () => q, lte: () => q, in: () => q,
      eq: (col: string, v: string) => { if (col === "id") st.id = v; return q; },
      maybeSingle: async () => {
        if (table === "users") return { data: st.id ? USERS[st.id] ?? null : null, error: null };
        const rows = (tables[table] ?? []) as { id?: string }[];
        return opts.tableError ? { data: null, error: { message: "boom" } } : { data: st.id ? rows.find((r) => r.id === st.id) ?? null : rows[0] ?? null, error: null };
      },
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko),
    };
    return q;
  }
  const db = {
    from: (t: string) => chain(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const out = opts.rpc ? opts.rpc(fn, args) : { data: { ok: true, id: C1, version: 4, replay: false, closed: [] }, error: null };
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return { db, calls };
}
const guardFor = (adminId: string | null, db: unknown, throws = false) => async (): Promise<AdminGuardResult> => {
  if (throws) throw new Error("guard boom");
  if (!adminId) return { ok: false, response: new Response(null, { status: 401 }) } as unknown as AdminGuardResult;
  return { ok: true, adminId, db } as unknown as AdminGuardResult;
};
const URL_ = "https://yasamsistemi.com/api/admin/kampanya-merkezi";
const get = (q = "") => new NextRequest(`${URL_}${q}`, { headers: { "x-admin-id": OWNER } });
function post(body: unknown, h: Record<string, string> = {}, raw?: string) {
  return new NextRequest(URL_, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-admin-id": OWNER, ...h }, body: raw ?? JSON.stringify(body) });
}
async function run(kind: "GET" | "POST", req: NextRequest, adminId: string | null, opts: Opts = {}, throws = false) {
  const f = fakeDb(opts);
  const deps = { verifyAdmin: guardFor(adminId, f.db, throws) };
  const res = kind === "GET" ? await handleCampaignGet(req, deps) : await handleCampaignPost(req, deps);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { /* */ }
  return { status: res.status, body, text, calls: f.calls, cache: res.headers.get("cache-control") };
}

(async () => {
  // ── Owner kapısı ──
  const notFoundBody = JSON.stringify({ ok: false, error: "Bulunamadı." });
  for (const [n, who, thr] of [["oturumsuz", null, false], ["normal admin", ADMIN, false], ["demo owner", DEMO, false], ["pasif owner", INACTIVE, false], ["doğrulayıcı hatası", OWNER, true]] as const) {
    const g = await run("GET", get(), who, {}, thr);
    const p = await run("POST", post({ action: "create", requestId: RID, fields: { name: "x" } }), who, {}, thr);
    check(`A01 ${n} → GET ve POST aynı 404, RPC çağrısı yok`, g.status === 404 && p.status === 404 && g.text === notFoundBody && p.text === notFoundBody && p.calls.length === 0, `${g.status}/${p.status}`);
  }
  const g = await run("GET", get(), OWNER);
  check("A02 Owner GET → 200 + no-store", g.status === 200 && g.body.ok === true && /no-store/.test(g.cache ?? ""));
  check("A03 GET tam sunucu kataloğunu döndürür (eşlik)", Array.isArray(g.body.catalog) && (g.body.catalog as unknown[]).length === CAMPAIGN_CATALOG.length);
  check("A04 GET yanıtında kimlik özeti / IP alanı yok", !/ip_hash|browser_hash|subject_hash|reservation/.test(g.text));
  const gErr = await run("GET", get(), OWNER, { tableError: true });
  check("A05 DB okuma hatası → 500, iç hata metni sızmaz", gErr.status === 500 && !gErr.text.includes("boom"));
  check("A06 istatistik penceresi yalnız 7/30/90", (await run("GET", get("?istatistik=15"), OWNER)).status === 400 && (await run("GET", get("?istatistik=30"), OWNER)).status === 200 && (await run("GET", get("?istatistik=abc"), OWNER)).status === 400);

  // ── İstek biçimi ──
  const noOrigin = await run("POST", new NextRequest(URL_, { method: "POST", headers: { "content-type": "application/json", "x-admin-id": OWNER }, body: "{}" }), OWNER);
  const badOrigin = await run("POST", post({ action: "create", requestId: RID }, { origin: "https://kotu.example" }), OWNER);
  check("B01 köken yok / yabancı köken → 404, RPC yok", noOrigin.status === 404 && badOrigin.status === 404 && badOrigin.calls.length === 0);
  const sfs = await run("POST", new NextRequest(URL_, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-admin-id": OWNER }, body: JSON.stringify({ action: "nope" }) }), OWNER);
  check("B02 Origin'siz ama sec-fetch-site=same-origin kabul edilir (sonra eylem doğrulaması)", sfs.status === 400);
  check("B03 JSON olmayan içerik türü → 415", (await run("POST", post({}, { "content-type": "text/plain" }), OWNER)).status === 415);
  check("B04 64 KB üstü gövde → 413", (await run("POST", post(null, {}, JSON.stringify({ action: "create", pad: "x".repeat(70_000) })), OWNER)).status === 413);
  check("B05 bozuk JSON / dizi gövde → 400", (await run("POST", post(null, {}, "{bozuk"), OWNER)).status === 400 && (await run("POST", post([1, 2]), OWNER)).status === 400);
  check("B06 bilinmeyen eylem → 400", (await run("POST", post({ action: "dropAll" }), OWNER)).status === 400);

  // ── Oluşturma / kaydetme ──
  const cr = await run("POST", post({ action: "create", requestId: RID, actor: ADMIN, fields: { name: "Yeni", undated: true } }), OWNER);
  check("C01 oluşturma → campaign_admin_create; actor yalnız doğrulanmış Owner", cr.status === 200 && cr.calls[0]?.fn === "campaign_admin_create" && cr.calls[0].args.p_actor === OWNER && cr.calls[0].args.p_request_id === RID);
  const cr2 = await run("POST", post({ action: "create", requestId: RID, fields: { name: "Yeni", undated: true } }), OWNER, { rpc: () => ({ data: { ok: true, id: C1, version: 1, replay: true }, error: null }) });
  check("C02 çift gönderim aynı istek kimliğini taşır; replay yanıtı iletilir", cr2.status === 200 && cr2.body.replay === true && cr2.calls[0].args.p_request_id === RID);
  check("C03 istek kimliği uuid değilse 400, RPC yok", (await run("POST", post({ action: "create", requestId: "abc", fields: {} }), OWNER)).calls.length === 0);
  for (const [n, f] of [["durum (status)", { status: "aktif" }], ["created_by", { created_by: ADMIN }], ["archived_at", { archived_at: null }], ["create_request_id", { create_request_id: RID }]] as const) {
    const r = await run("POST", post({ action: "save", id: C1, expectedVersion: 3, fields: f }), OWNER);
    check(`C04 izin listesi dışı alan (${n}) → 400, RPC yok`, r.status === 400 && r.calls.length === 0);
  }
  for (const [n, f] of [["javascript: CTA", { cta_target: "javascript:alert(1)" }], ["dış adres CTA", { cta_target: "https://kotu.example" }], ["katalogda olmayan CTA", { cta_target: "hd:yok" }], ["../ görsel", { image_ref: "../gizli.png" }], ["dış görsel", { image_ref: "https://kotu.example/a.png" }], ["uzun slogan", { slogan: "ş".repeat(91) }], ["boş ad", { name: "   " }], ["ters tarih", { starts_at: "2026-12-02T00:00:00Z", ends_at: "2026-12-01T00:00:00Z" }], ["bilinmeyen modül yorumu", { module_comments: { evil: true } }]] as const) {
    const r = await run("POST", post({ action: "save", id: C1, expectedVersion: 3, fields: f }), OWNER);
    check(`C05 sunucu doğrulaması: ${n} → 400, RPC yok`, r.status === 400 && r.calls.filter((c) => c.fn.startsWith("campaign_admin")).length === 0, `${r.status}`);
  }
  const okSave = await run("POST", post({ action: "save", id: C1, expectedVersion: 3, fields: { slogan: "Ücretsiz keşif — İğneada'dan Şırnak'a", cta_target: "hd:bodygraph", image_ref: "assets/hero-manzara.webp" } }), OWNER);
  check("C06 geçerli kayıt (Türkçe karakter, katalog CTA, izinli görsel) → RPC'ye aynen gider", okSave.status === 200 && JSON.stringify(okSave.calls.find((c) => c.fn === "campaign_admin_save")?.args.p_fields).includes("İğneada'dan Şırnak'a"));
  check("C07 sürüm sayı değilse 400", (await run("POST", post({ action: "save", id: C1, expectedVersion: "3", fields: {} }), OWNER)).status === 400);
  const conflict = await run("POST", post({ action: "save", id: C1, expectedVersion: 2, fields: { name: "a" } }), OWNER, { rpc: () => ({ data: null, error: { message: "CAMPAIGN_VERSION_CONFLICT", code: "P0001" } }) });
  check("C08 sürüm çakışması → 409", conflict.status === 409 && conflict.body.code === "version_conflict");
  const live = await run("POST", post({ action: "setStatus", id: C1, expectedVersion: 3, status: "aktif" }), OWNER, { rpc: () => ({ data: null, error: { message: 'duplicate key value violates unique constraint "campaigns_single_live_uq"', code: "23505" } }) });
  check("C09 tek yayındaki kampanya çakışması → 409", live.status === 409 && live.body.code === "live_conflict");
  const dbErr = await run("POST", post({ action: "save", id: C1, expectedVersion: 3, fields: { name: "a" } }), OWNER, { rpc: () => new Error("connection reset by peer 10.0.0.5") });
  check("C10 DB istisnası → 500, iç ayrıntı sızmaz", dbErr.status === 500 && !dbErr.text.includes("10.0.0.5"));
  const dbErr2 = await run("POST", post({ action: "save", id: C1, expectedVersion: 3, fields: { name: "a" } }), OWNER, { rpc: () => ({ data: null, error: { message: "relation secret_table does not exist", code: "42P01" } }) });
  check("C11 DB hata mesajı Owner yanıtına da sızmaz", dbErr2.status === 500 && !dbErr2.text.includes("secret_table"));
  check("C12 durum yalnız kapali/yakinda/aktif", (await run("POST", post({ action: "setStatus", id: C1, expectedVersion: 3, status: "yayinda" }), OWNER)).status === 400);

  // ── Teknik seçimi ──
  const tech = (items: unknown[]) => run("POST", post({ action: "setTechniques", id: C1, expectedVersion: 3, items }), OWNER);
  const it = (key: string, extra: Record<string, unknown> = {}) => ({ key, enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 30, dailyCreditBudget: 30, ...extra });
  check("T01 katalogda olmayan teknik → 400 unknown_technique", (await tech([it("hd:sahte")])).body.code === "unknown_technique");
  check("T02 uygun olmayan teknik açılamaz", (await tech([it("hd:local_engine")])).body.code === "technique_not_selectable");
  check("T03 Dört Ok / PHS ayrı onaysız → confirmation_required", (await tech([it("hd:variables")])).body.code === "confirmation_required");
  const phs = await tech([it("hd:variables", { confirmFullAnalysis: true })]);
  check("T04 PHS onaylı → kaydedilir", phs.status === 200 && phs.calls.some((c) => c.fn === "campaign_admin_set_techniques"));
  check("T05 yorum kaynağı olmayan teknikte yorum açılamaz", (await tech([it("hd:transit", { commentsEnabled: true })])).body.code === "comments_unavailable");
  const koz = await tech([it("kozmik:paket", { dailyCreditBudget: 999 })]);
  const kozRow = ((koz.calls.find((c) => c.fn === "campaign_admin_set_techniques")?.args.p_items ?? []) as Record<string, unknown>[])[0];
  check("T06 0 kredili Kozmik paket: istemci bütçesi yok sayılır (0) ve maks. kredi katalogdan", kozRow?.daily_credit_budget === 0 && kozRow?.max_credit_per_analysis === 0);
  const crd = await tech([it("hd:bodygraph", { maxCredit: 0 })]);
  check("T07 analiz başına kredi istemciden alınmaz (katalog değeri)", ((crd.calls.find((c) => c.fn === "campaign_admin_set_techniques")?.args.p_items ?? []) as Record<string, unknown>[])[0]?.max_credit_per_analysis === 1);
  check("T08 negatif / aşırı limit → 400", (await tech([it("hd:bodygraph", { ipDailyLimit: -1 })])).status === 400 && (await tech([it("hd:bodygraph", { dailyAnalysisLimit: 2_000_000 })])).status === 400);
  check("T09 aynı teknik iki kez → 400", (await tech([it("hd:bodygraph"), it("hd:bodygraph")])).status === 400);
  check("T10 200'den fazla öğe / öğe biçimi bozuk → 400", (await tech(Array.from({ length: 201 }, () => it("hd:bodygraph")))).status === 400 && (await tech([{ key: 5 }])).status === 400);

  // ── Kopya / silme / ayarlar / şablon ──
  const dp = await run("POST", post({ action: "duplicate", requestId: RID, sourceId: C1 }), OWNER);
  check("D01 kopya → campaign_admin_duplicate (Owner kimliği, istek kimliği)", dp.status === 200 && dp.calls[0]?.fn === "campaign_admin_duplicate" && dp.calls[0].args.p_actor === OWNER);
  check("D02 kopya adı > 80 → 400", (await run("POST", post({ action: "duplicate", requestId: RID, sourceId: C1, name: "a".repeat(81) }), OWNER)).status === 400);
  const arWrong = await run("POST", post({ action: "archive", id: C1, expectedVersion: 3, confirmName: "kasım kampanyası" }), OWNER);
  check("D03 silme: ad birebir yazılmazsa 400, RPC yok", arWrong.status === 400 && arWrong.calls.length === 0);
  const arOk = await run("POST", post({ action: "archive", id: C1, expectedVersion: 3, confirmName: "Kasım kampanyası" }), OWNER);
  check("D04 silme: ad birebir → campaign_admin_archive", arOk.status === 200 && arOk.calls.some((c) => c.fn === "campaign_admin_archive"));
  const arLive = await run("POST", post({ action: "archive", id: C1, expectedVersion: 3, confirmName: "Kasım kampanyası" }), OWNER, { rpc: () => ({ data: null, error: { message: "CAMPAIGN_ARCHIVE_REQUIRES_CLOSED", code: "P0001" } }) });
  check("D05 yayındaki kampanya silinemez → 409", arLive.status === 409 && arLive.body.code === "archive_requires_closed");
  check("D06 olmayan kampanya silme → 404", (await run("POST", post({ action: "archive", id: RID, expectedVersion: 1, confirmName: "x" }), OWNER)).status === 404);
  const st = (fields: unknown) => run("POST", post({ action: "updateSettings", expectedVersion: 1, fields }), OWNER);
  check("S01 ayar: bilinmeyen alan → 400", (await st({ version: 9 })).status === 400 && (await st({ id: false })).status === 400);
  check("S02 ayar: negatif / ondalık / metin sayı → 400", (await st({ global_daily_credit_budget: -1 })).status === 400 && (await st({ expert_reserve_pct: 1.5 })).status === 400 && (await st({ provider_minute_limit: "30" })).status === 400);
  check("S03 ayar: acil durdurma yalnız boolean", (await st({ kill_switch: "true" })).status === 400 && (await st({ kill_switch: true })).status === 200);
  const nul = await st({ provider_monthly_quota: null, global_daily_analysis_limit: null });
  check("S04 ayar: aylık kota / analiz sınırı boşaltılabilir (null → fail-closed)", nul.status === 200 && JSON.stringify(nul.calls.find((c) => c.fn === "campaign_admin_update_settings")?.args.p_fields) === JSON.stringify({ provider_monthly_quota: null, global_daily_analysis_limit: null }));
  const chk = await st({ expert_reserve_pct: 99 });
  check("S05 ayar: DB CHECK ihlali (rpc 23514) → 400", (await run("POST", post({ action: "updateSettings", expectedVersion: 1, fields: { expert_reserve_pct: 99 } }), OWNER, { rpc: () => ({ data: null, error: { message: "violates check constraint", code: "23514" } }) })).status === 400 && chk.status === 200);
  check("S06 şablon: izin listesi dışı alan → 400", (await run("POST", post({ action: "saveTemplate", fields: { slogan: "a", name: "x" } }), OWNER)).status === 400);
  check("S07 şablon silme: geçersiz kimlik → 400", (await run("POST", post({ action: "archiveTemplate", templateId: "1" }), OWNER)).status === 400);

  console.log(`\nowner-api: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL beklenmeyen hata — ${e?.stack ?? e}`);
  process.exit(1);
});
