// KAMPANYA MERKEZİ KM-1 — sunucu servisleri birim testi (DB/ağ yok; sahte rpc istemcisi).
// Kapsam: Türkiye günü, IP normalizasyonu (IPv6 /64), HMAC kimlik özeti (ham IP asla gönderilmez, gün dönümü), gizli anahtar
// yoksa fail-closed, DB hatası / beklenmeyen yanıt → fail-closed, katalog zorlaması (bilinmeyen, uygun değil, PHS onayı,
// yorum kaynağı, 0 kredi bütçesi, istemci kredi değeri yok sayılır), katı owner denetimi.
// Çalıştırma: npx tsx scripts/campaign/services.test.ts
import { normalizeIp, subjectHash, subjectSecret, turkeyDay } from "@/lib/campaign/subject";
import { expireStale, newIdempotencyKey, reserve, settle } from "@/lib/campaign/quotaService";
import { buildTechniqueRows, isCampaignOwner, setCampaignStatus, validateCampaignFields } from "@/lib/campaign/adminService";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const SECRET = "k".repeat(40);
const ENV = { CAMPAIGN_SUBJECT_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;

type Call = { fn: string; args: Record<string, unknown> };
function fakeDb(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  const calls: Call[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const out = handler(fn, args);
      if (out instanceof Error) throw out;
      return out as { data: unknown; error: unknown };
    },
    from: (_t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => handler("users", {}) }) }) }),
  };
  return { db: db as never, calls };
}

(async () => {
  // ── Türkiye günü ──
  check("T01 20:59:59Z → TR aynı gün, 21:00:00Z → TR ertesi gün", turkeyDay(new Date("2027-03-14T20:59:59Z")) === "2027-03-14" && turkeyDay(new Date("2027-03-14T21:00:00Z")) === "2027-03-15");
  check("T02 UTC gece yarısı TR gününü değiştirmez", turkeyDay(new Date("2027-03-15T23:59:00Z")) === turkeyDay(new Date("2027-03-16T00:01:00Z")));

  // ── IP normalizasyonu ──
  check("I01 IPv4 aynen", normalizeIp(" 85.105.1.2 ") === "85.105.1.2");
  check("I02 IPv6 /64 önekine indirgenir (aynı abone farklı adres → aynı kimlik)", normalizeIp("2a02:4780:1:2:aaaa::1") === normalizeIp("2a02:4780:1:2:bbbb:cccc:dddd:eeee") && normalizeIp("2a02:4780:1:2::5").endsWith("::/64"));
  check("I03 IPv4-eşlemeli IPv6 → IPv4", normalizeIp("::ffff:10.1.2.3") === "10.1.2.3");
  check("I04 boş / geçersiz → 'unknown'", normalizeIp("") === "unknown" && normalizeIp("abc") === "unknown" && normalizeIp(null) === "unknown");

  // ── Kimlik özeti ──
  const h1 = subjectHash("ip", "1.2.3.4", "2027-03-14", SECRET);
  check("H01 özet 64 hex ve IP'yi içermez", /^[0-9a-f]{64}$/.test(h1) && !h1.includes("1.2.3.4"));
  check("H02 aynı gün aynı özet, ertesi gün farklı (günlük döner)", h1 === subjectHash("ip", "1.2.3.4", "2027-03-14", SECRET) && h1 !== subjectHash("ip", "1.2.3.4", "2027-03-15", SECRET));
  check("H03 ip / tarayıcı türleri ayrı uzay", h1 !== subjectHash("browser", "1.2.3.4", "2027-03-14", SECRET));
  check("H04 gizli anahtar < 32 karakter veya yok → null", subjectSecret({ CAMPAIGN_SUBJECT_SECRET: "kisa" } as never) === null && subjectSecret({} as never) === null && subjectSecret({ RATE_LIMIT_SECRET: "r".repeat(32) } as never) === "r".repeat(32));
  check("H05 idempotency anahtarı DB biçimine uygun ve tekil", /^[A-Za-z0-9_-]{16,80}$/.test(newIdempotencyKey()) && newIdempotencyKey() !== newIdempotencyKey());

  // ── Kota servisi: fail-closed ──
  const ok = fakeDb(() => ({ data: { ok: true, reservation_id: "r1", max_credits: 2, replay: false, day_tr: "2027-03-14", comments_enabled: false }, error: null }));
  const r1 = await reserve(ok.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "85.105.1.2", browserId: "tarayici-1" }, ENV);
  const sent = ok.calls[0]?.args ?? {};
  check("Q01 başarılı rezervasyon eşlenir", r1.ok === true && r1.ok && r1.maxCredits === 2);
  check("Q02 DB'ye ham IP / tarayıcı kimliği GİTMEZ (yalnız 64 hex özet)", JSON.stringify(sent).indexOf("85.105.1.2") === -1 && JSON.stringify(sent).indexOf("tarayici-1") === -1 && /^[0-9a-f]{64}$/.test(String(sent.p_ip_hash)) && /^[0-9a-f]{64}$/.test(String(sent.p_browser_hash)));
  const thrower = fakeDb(() => new Error("bağlantı koptu"));
  check("Q03 DB istisnası → altyapi_hatasi (fail-closed)", (await reserve(thrower.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV)).ok === false);
  const errDb = fakeDb(() => ({ data: null, error: { message: "permission denied", code: "42501" } }));
  const r3 = await reserve(errDb.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV);
  check("Q04 DB hata yanıtı → altyapi_hatasi", !r3.ok && r3.reason === "altyapi_hatasi");
  const arr = fakeDb(() => ({ data: [{ ok: true }], error: null }));
  const r4 = await reserve(arr.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV);
  check("Q05 beklenmeyen biçim (dizi) → altyapi_hatasi", !r4.ok && r4.reason === "altyapi_hatasi");
  const deny = fakeDb(() => ({ data: { ok: false, reason: "genel_kredi_doldu" }, error: null }));
  const r5 = await reserve(deny.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV);
  check("Q06 DB reddi neden koduyla döner", !r5.ok && r5.reason === "genel_kredi_doldu");
  const none = fakeDb(() => ({ data: { ok: true, reservation_id: "x" }, error: null }));
  const r6 = await reserve(none.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, {} as never);
  check("Q07 gizli anahtar yok → gizli_anahtar_yok ve DB çağrılmaz", !r6.ok && r6.reason === "gizli_anahtar_yok" && none.calls.length === 0);
  const r7 = await reserve(none.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "atlas:uydurma", ip: "1.1.1.1" }, ENV);
  const r8 = await reserve(none.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "atlas:western.synastry", ip: "1.1.1.1" }, ENV);
  check("Q08 katalogda olmayan / uygun olmayan teknik → katalogda_yok ve DB çağrılmaz", !r7.ok && !r8.ok && r7.reason === "katalogda_yok" && r8.reason === "katalogda_yok" && none.calls.length === 0);
  check("Q09 settle DB hatasında ok:false", (await settle(thrower.db, { reservationId: "r1", outcome: "completed" })).ok === false);
  check("Q10 expireStale DB hatasında null (zamanlayıcı yeniden dener)", (await expireStale(thrower.db)) === null);

  // ── Katalog zorlaması ──
  const b1 = buildTechniqueRows([{ key: "atlas:uydurma", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10 }]);
  check("M01 bilinmeyen teknik reddedilir", !b1.ok && b1.error === "unknown_technique");
  const b2 = buildTechniqueRows([{ key: "atlas:western.synastry", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10 }]);
  const b2b = buildTechniqueRows([{ key: "atlas:western.synastry", enabled: false, ipDailyLimit: 1, dailyAnalysisLimit: 10 }]);
  check("M02 uygun olmayan teknik açılamaz (kapalı satır olarak kalabilir)", !b2.ok && b2.error === "technique_not_selectable" && b2b.ok);
  const b3 = buildTechniqueRows([{ key: "hd:variables", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10, dailyCreditBudget: 20 }]);
  const b3b = buildTechniqueRows([{ key: "hd:variables", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10, dailyCreditBudget: 20, confirmFullAnalysis: true }]);
  check("M03 Dört Ok / PHS ayrı Owner onayı olmadan açılamaz", !b3.ok && b3.error === "confirmation_required" && b3b.ok);
  const b4 = buildTechniqueRows([{ key: "atlas:horary.lilly", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10, commentsEnabled: true }]);
  check("M04 yorum kaynağı olmayan teknikte yorum açılamaz", !b4.ok && b4.error === "comments_unavailable");
  const b5 = buildTechniqueRows([{ key: "kozmik:paket", enabled: true, ipDailyLimit: 3, dailyAnalysisLimit: 300, dailyCreditBudget: 999 }]);
  check("M05 0 kredili Kozmik paketinde kredi bütçesi 0'a sabitlenir", b5.ok && b5.rows[0].daily_credit_budget === 0 && b5.rows[0].max_credit_per_analysis === 0);
  const b6 = buildTechniqueRows([{ key: "numk:person_all", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10, dailyCreditBudget: 50, max_credit_per_analysis: 1 } as never]);
  check("M06 analiz başına azami kredi istemciden değil katalogdan (Tümü = 5)", b6.ok && b6.rows[0].max_credit_per_analysis === 5);
  const b7 = buildTechniqueRows([{ key: "numk:dual", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10 }, { key: "numk:dual", enabled: true, ipDailyLimit: 1, dailyAnalysisLimit: 10 }]);
  const b8 = buildTechniqueRows([{ key: "numk:dual", enabled: true, ipDailyLimit: -1, dailyAnalysisLimit: 10 }]);
  check("M07 yinelenen satır ve negatif limit reddedilir", !b7.ok && !b8.ok);
  check("M08 alan doğrulama: boş ad, uzun slogan, ters tarih, geçersiz hedef reddedilir", validateCampaignFields({ name: " " }) === "name" && validateCampaignFields({ slogan: "x".repeat(91) }) === "slogan" &&
    validateCampaignFields({ starts_at: "2027-01-02T00:00:00Z", ends_at: "2027-01-01T00:00:00Z" }) === "ends_at" && validateCampaignFields({ cta_target: "javascript:alert(1)" }) === "cta_target" && validateCampaignFields({ name: "Kasım" }) === null);

  // ── Katı owner denetimi ──
  const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
  const row = (r: unknown) => fakeDb((fn) => (fn === "users" ? { data: r, error: null } : { data: { ok: true }, error: null }));
  check("W01 owner (super admin + admin + aktif + demo değil) → true", await isCampaignOwner(row({ role: "admin", active: true, is_super_admin: true, is_demo_account: false }).db, OWNER));
  check("W02 super olmayan admin / demo / pasif → false", !(await isCampaignOwner(row({ role: "admin", active: true, is_super_admin: false }).db, OWNER)) &&
    !(await isCampaignOwner(row({ role: "admin", active: true, is_super_admin: true, is_demo_account: true }).db, OWNER)) &&
    !(await isCampaignOwner(row({ role: "admin", active: false, is_super_admin: true }).db, OWNER)));
  check("W03 geçersiz kimlik / DB hatası → false", !(await isCampaignOwner(row(null).db, "x")) && !(await isCampaignOwner(fakeDb(() => new Error("x")).db, OWNER)));
  const nonOwner = row({ role: "expert", active: true, is_super_admin: false });
  const so = await setCampaignStatus(nonOwner.db, OWNER, OWNER, "aktif", 1);
  check("W04 owner değilse yönetim RPC'si hiç çağrılmaz", !so.ok && so.error === "not_owner" && nonOwner.calls.length === 0);

  // ── Y1: tekrar yanıtı asla izin değildir ──
  const rep = fakeDb(() => ({ data: { ok: false, replay: true, state: "reserved", reason: "istek_suruyor", reservation_id: "r9" }, error: null }));
  const rr = await reserve(rep.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV);
  check("Y01 süren isteğin tekrarı → ok:false istek_suruyor, state ve rezervasyon kimliği iletilir", !rr.ok && rr.reason === "istek_suruyor" && rr.state === "reserved" && rr.reservationId === "r9" && rr.replay === true);
  const rep2 = fakeDb(() => ({ data: { ok: false, replay: true, state: "completed", reason: "istek_tamamlandi", reservation_id: "r9" }, error: null }));
  const rr2 = await reserve(rep2.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV);
  check("Y02 tamamlanmış isteğin tekrarı → ok:false istek_tamamlandi", !rr2.ok && rr2.reason === "istek_tamamlandi" && rr2.state === "completed");
  const rep3 = fakeDb(() => ({ data: { ok: true, replay: true, reservation_id: "r9" }, error: null }));
  const rr3 = await reserve(rep3.db, { idempotencyKey: newIdempotencyKey(), techniqueKey: "numk:dual", ip: "1.1.1.1" }, ENV);
  check("Y03 savunma: 'ok:true + replay' biçimi bile izin sayılmaz", !rr3.ok);

  // ── O1: çağrı koruyucusu (sunucu tarafı tavan + DB izni + sonuç kaydı) ──
  const { ReservationCallGuard } = await import("@/lib/campaign/quotaService");
  const guardDb = (authOk: boolean, reason = "kampanya_kapali") => {
    let n = 0;
    return fakeDb((fn, args) => {
      if (fn === "campaign_authorize_call") return { data: authOk ? { ok: true, call_id: ++n } : { ok: false, reason }, error: null };
      if (fn === "campaign_record_provider_call") return { data: { ok: true, outcome: args.p_outcome }, error: null };
      return { data: null, error: null };
    });
  };
  let fnCalls = 0;
  const provider = (status: number) => async () => { fnCalls++; return { value: "sonuc", meta: { httpStatus: status, remaining: 900 } }; };
  const g1 = guardDb(true);
  const guard1 = new ReservationCallGuard(g1.db, "r1", 2);
  const tooBig = await guard1.call("numerology/chart", 3, provider(200));
  check("G01 istenen kredi azamiyi aşıyor → DB'ye gidilmez, sağlayıcı çağrılmaz", !tooBig.ok && tooBig.reason === "rezervasyon_kredi_tavani" && g1.calls.length === 0 && fnCalls === 0);
  const c1 = await guard1.call("numerology/chart", 1, provider(200));
  const c2 = await guard1.call("numerology/chart", 1, provider(429));
  const c3 = await guard1.call("numerology/chart", 1, provider(200));
  const outcomes = g1.calls.filter((c) => c.fn === "campaign_record_provider_call").map((c) => c.args.p_outcome);
  check("G02 1+1 kredi izinli; 3. çağrı sunucu tarafında reddedilir (DB'ye gitmeden); sonuçlar ok / rate_limited", c1.ok && c2.ok && !c3.ok && c3.reason === "rezervasyon_kredi_tavani" && fnCalls === 2 && JSON.stringify(outcomes) === JSON.stringify(["ok", "rate_limited"]) && guard1.usedCredits === 2);
  const g2 = guardDb(false, "kampanya_kapali");
  const before2 = fnCalls;
  const d2 = await new ReservationCallGuard(g2.db, "r2", 5).call("x", 1, provider(200));
  check("G03 DB izni yoksa sağlayıcı ÇAĞRILMAZ ve neden iletilir", !d2.ok && d2.reason === "kampanya_kapali" && fnCalls === before2);
  const g3 = guardDb(true);
  const guard3 = new ReservationCallGuard(g3.db, "r3", 5);
  const abort = Object.assign(new Error("zaman aşımı"), { name: "AbortError" });
  const t1 = await guard3.call("x", 1, async () => { throw abort; });
  const t2 = await guard3.call("x", 1, async () => { throw new Error("ECONNRESET"); });
  const t3 = await guard3.call("x", 1, provider(500));
  const out3 = g3.calls.filter((c) => c.fn === "campaign_record_provider_call").map((c) => c.args.p_outcome);
  check("G04 zaman aşımı → timeout, ağ hatası → network_error, 500 → http_error kaydı; izinli kredi harcanmış sayılır", !t1.ok && !t2.ok && t3.ok && JSON.stringify(out3) === JSON.stringify(["timeout", "network_error", "http_error"]) && guard3.usedCredits === 3);
  const g4 = guardDb(true);
  const badEp = await new ReservationCallGuard(g4.db, "r4", 5).call("../evil", 1, provider(200));
  check("G05 geçersiz uç / kredi değeri DB'ye gitmeden reddedilir", !badEp.ok && badEp.reason === "gecersiz_istek" && g4.calls.length === 0);
  const g5 = fakeDb(() => new Error("bağlantı koptu"));
  const fnBefore = fnCalls;
  const d5 = await new ReservationCallGuard(g5.db, "r5", 5).call("x", 1, provider(200));
  check("G06 izin RPC'si DB hatası → altyapi_hatasi ve sağlayıcı çağrılmaz (fail-closed)", !d5.ok && d5.reason === "altyapi_hatasi" && fnCalls === fnBefore);

  // ── O2 / D1: CTA ve görsel yolu izin listesi ──
  const { isSafeCtaTarget, IMAGE_REF_RE, effectiveCommentsEnabled } = await import("@/lib/campaign/adminService");
  const badCta = ["javascript:alert", "data:text", "https://evil.example", "//evil.example", "../x", "register/../x", "atlas:uydurma", "evil:western.natal", "", "Bolum"];
  check("V01 CTA: tehlikeli / dış / yol atlama / katalogda olmayan hedefler reddedilir", badCta.every((v) => !isSafeCtaTarget(v)) && validateCampaignFields({ cta_target: "javascript:alert" }) === "cta_target");
  check("V02 CTA: bolum, register ve katalog teknikleri kabul edilir", ["bolum", "register", "atlas:western.natal", "numk:person_all", "kozmik:paket"].every((v) => isSafeCtaTarget(v)));
  const badImg = ["../a.webp", "/a.webp", "http://x/a.png", "assets/../a.webp", "assets/a.svg", "campaign/.hidden.png", "assets/a.webp?x", "assets//a.webp"];
  check("V03 görsel yolu: yol atlama, mutlak yol, şema, svg, gizli dosya, sorgu reddedilir; assets/ ve campaign/ kabul", badImg.every((v) => !IMAGE_REF_RE.test(v)) && IMAGE_REF_RE.test("assets/hero-manzara.webp") && IMAGE_REF_RE.test("campaign/2026/k1.png") && validateCampaignFields({ image_ref: "../a.webp" }) === "image_ref");

  // ── O3: gerçek yorum izni ──
  check("V04 yorum izni = modül VE teknik VE katalogda kaynak", effectiveCommentsEnabled({ numk: true }, "numk:dual", true) === true &&
    effectiveCommentsEnabled({ numk: false }, "numk:dual", true) === false && effectiveCommentsEnabled({ numk: true }, "numk:dual", false) === false &&
    effectiveCommentsEnabled({}, "numk:dual", true) === false && effectiveCommentsEnabled({ atlas: true }, "atlas:horary.lilly", true) === false);

  console.log(`\nservices: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
