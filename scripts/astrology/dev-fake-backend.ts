/**
 * ASTROLOJİ — YEREL GÖRSEL DOĞRULAMA için sahte PostgREST sunucusu (YALNIZ localhost; prod/DB/Roxy YOK).
 *
 * `next start`'ı NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<port> ile çalıştırınca uygulamanın
 * service-role sorguları bu bellek-içi depoya gider. Başlangıçta owner + owner olmayan admin +
 * danışan + bir doğum profili ve (sahte sağlayıcı fixture'ından) kayıtlı natal sonuç seed edilir →
 * UI "Kayıtlı sonucu aç" ile 0 sağlayıcı isteğiyle açılır. ROXY_API_KEY verilmez → yeni hesap 503.
 *
 * Aşama 3: FAKE_ROXY_CERT + FAKE_ROXY_KEY (yerel, kendinden imzalı) verilirse <port+1> üzerinde YEREL
 * HTTPS sahte Roxy açılır; golden fixture'ları (gerçek yanıtlar, sentetik kişiler) endpoint'e göre
 * döndürür. Yalnız "local-fake-roxy-key" başlığını kabul eder (gerçek anahtar burada KULLANILMAZ);
 * logda yalnız endpoint yolu ve sayaç vardır (gövde/doğum verisi YOK).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/dev-fake-backend.ts [port]
 */
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createFakeClient, createStore, handlePostgrest } from "./fakeSupabase";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineDeps } from "@/lib/astrology/engine/service";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { createKb } from "@/lib/astrology/kb/service";
import { saveAnalysis } from "@/lib/astrology/analyses/service";
import { lunarReturnsInMonth, natalMoonLongitude } from "@/lib/astrology/engine/lunarReturnDate";
import { syntheticCurrentResponse, syntheticDeepResponse, syntheticSubResponse } from "./syntheticDasha";
import { syntheticPlanetsInterval, syntheticRasiChanges, syntheticSublordChanges } from "./syntheticKpTiming";

const PORT = Number(process.argv[2] ?? 54329);
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const ADMIN2 = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const EXPERT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const TENANT_E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EXPERT_CLIENT = "e1e1e1e1-0000-4000-8000-0000000000e1";
// AŞAMA 2.2 (2026-10-21): FAKE_NATAL_REAL_GOLDEN=1 → natal için OpenAPI türevi fixture yerine AYNI sentetik kişinin GERÇEK natal
// golden'ı (2026-10-07; Placidus, true node) kullanılır. Solar Arc çift halkası natal boylamların Solar Arc yanıtıyla tutarlı
// olmasını şart koşar (türev fixture tutarsızdır → çerçeve haklı olarak eklenmez). Varsayılan (değişken yok) davranış AYNEN.
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures", process.env.FAKE_NATAL_REAL_GOLDEN === "1" ? "roxy-natal-golden-2026-10-07.json" : "roxy-natal-spec-derived.json"), "utf8"),
);

const store = createStore({
  users: [
    { id: OWNER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "admin@yasamsistemi.com", full_name: "Owner (yerel test)", module_permissions: {} },
    { id: ADMIN2, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TENANT_A, email: "admin2@local.test", full_name: "Admin 2 (owner değil)", module_permissions: {} },
    // Aşama 7C görsel doğrulama: SENTETİK uzman (kendi tenant'ı; onaylı Premium). Astroloji başta KAPALI → admin açar.
    { id: EXPERT, role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active", is_super_admin: false, is_demo_account: false, tenant_id: TENANT_E, email: "uzman@local.test", full_name: "Sentetik Uzman (yerel test)", module_permissions: { clients: true, astrology: false, astrology_provider_interp: false } },
  ],
  clients: [
    { id: "11111111-1111-4111-8111-111111111111", tenant_id: TENANT_A, ad: "Ali", soyad: "Örnek", dogum: "1990-07-15" },
    { id: "22222222-2222-4222-8222-222222222222", tenant_id: TENANT_A, ad: "Ayşe", soyad: "Deneme", dogum: null },
    { id: EXPERT_CLIENT, tenant_id: TENANT_E, ad: "Uzman", soyad: "Danışanı", dogum: "1992-02-02", telefon: "05001112233", created_at: "2026-09-01T10:00:00Z" },
  ],
  user_payment_history: [],
  // 9C: HttpOnly H5 bootstrap (/api/auth/session/cookie) user_sessions satırını okur (kanal + mutlak bitiş).
  user_sessions: [
    { session_token: "local-owner-token-aaaaaaaaaaaa", user_id: OWNER, client_channel: "web", is_active: true, expires_at: new Date(Date.now() + 8 * 3600_000).toISOString() },
    { session_token: "local-admin2-token-bbbbbbbbbbb", user_id: ADMIN2, client_channel: "web", is_active: true, expires_at: new Date(Date.now() + 8 * 3600_000).toISOString() },
    { session_token: "local-expert-token-eeeeeeeeeee", user_id: EXPERT, client_channel: "web", is_active: true, expires_at: new Date(Date.now() + 8 * 3600_000).toISOString() },
  ],
});
store.sessions.set("local-owner-token-aaaaaaaaaaaa", OWNER);
store.sessions.set("local-admin2-token-bbbbbbbbbbb", ADMIN2);
store.sessions.set("local-expert-token-eeeeeeeeeee", EXPERT);

async function seed() {
  const ctx = { db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const c = await createAstroProfile(
    ctx,
    { label: "Ali Örnek — natal", clientId: "11111111-1111-4111-8111-111111111111", birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" },
    resolveAstroLocation,
  );
  const pid = (c.body as { profile: { id: string } }).profile.id;
  const deps: EngineDeps = {
    config: { apiKey: "local-fake", baseUrl: "https://fake.invalid/api/v2" },
    callProvider: async (_c, _e, body) => {
      const raw = structuredClone(FIXTURE);
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  };
  await runAstrology(ctx, { profileId: pid, selections: [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }] }, deps, { ownerPreviewHideInterp: false });
  // Aşama 2 görsel doğrulama: haritadaki Satürn evine eşleşen bir Bilgi Bankası kaydı + ilgisiz bir kayıt.
  const sat = (FIXTURE.planets as { name: string; house: number }[]).find((p) => p.name === "Saturn")!;
  await createKb(ctx, { tradition: "western", topicKey: `planet_in_house:saturn:${sat.house}`, title: "Satürn bu evde — çalışma notum", body: "Sorumluluk temalarını önce aile ve günlük düzende okurum.", sourceNote: "Yerel test notu", tags: ["satürn", "test"] });
  await createKb(ctx, { tradition: "western", topicKey: "planet_in_sign:sun:aries", title: "Koç Güneşi (ilgisiz)", body: "Bu haritayla eşleşmemeli." });
  await createAstroProfile(
    ctx,
    { label: "Saat bilinmeyen örnek", birthDate: "1985-01-02", timeKnown: false, locationId: "tr-06-ankara" },
    resolveAstroLocation,
  );
  // Aşama 3: sinastri/composite karşı tarafı (sentetik B; Ayşe danışanına bağlı).
  const pb = await createAstroProfile(
    ctx,
    { label: "Sentetik B — Ankara", clientId: "22222222-2222-4222-8222-222222222222", birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" },
    resolveAstroLocation,
  );
  // Kalıcı silme görsel doğrulaması (SENTETİK): Ali'nin, karşı tarafı Sentetik B olan ortak analizi → B silinince KORUNMALI.
  const pbId = (pb.body as { profile: { id: string } }).profile.id;
  await ctx.db.rpc("astro_analysis_save_v2", {
    p_tenant_id: TENANT_A, p_user_id: OWNER, p_profile_id: pid, p_profile_revision: 1, p_partner_profile_id: pbId, p_partner_profile_revision: 1, p_result_ids: [],
    p_technique: "western.synastry", p_title: "Ali & Sentetik B sinastri (ortak)", p_save_request_id: "7c7c7c7c-0000-4000-8000-000000000001", p_technique_params: { partnerProfileId: pbId },
    p_profile_snapshot: { label: "Ali Örnek — natal", partner: { profileId: pbId, label: "Sentetik B — Ankara" } }, p_method_snapshot: { houseSystem: "placidus" },
    p_technical_snapshot: { schema: "astro.western.synastry.v1", aspects: [{ a: "venus", type: "conjunction", b: "mars" }] }, p_kb_snapshot: [], p_provider_interp_included: false,
    p_provider_interp_snapshot: null, p_versions_snapshot: {}, p_notes: [],
  });
  // Aşama 7B görsel doğrulama (SENTETİK): aynı ad/soyad/doğum tarihli üç danışan, sayfalama için 40 ek profil,
  // Ali profilinde üç gelenekte kayıtlı analizler (1 gerçek kaydet akışı + liste için sentetik satırlar).
  store.tables.clients.push(
    { id: "c7b70001-0000-4000-8000-000000000001", tenant_id: TENANT_A, ad: "İlknur", soyad: "IŞIK", dogum: "1985-05-06", telefon: "0532 123 45 67", kan: "A Rh+", created_at: "2026-01-02T10:00:00Z" },
    { id: "c7b70002-0000-4000-8000-000000000002", tenant_id: TENANT_A, ad: "ilknur", soyad: "ışık", dogum: "1985-05-06", telefon: null, created_at: "2026-02-02T10:00:00Z" },
    { id: "c7b70003-0000-4000-8000-000000000003", tenant_id: TENANT_A, ad: "İLKNUR", soyad: "Işık", dogum: "1985-05-06", telefon: "05559876543", created_at: "2026-03-02T10:00:00Z" },
  );
  await createAstroProfile(ctx, { label: "İlknur Işık — natal", birthDate: "1985-05-06", birthTime: "08:15", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" }, resolveAstroLocation);
  // 2026-10-21 (owner kararı, YENİ-P2-03 engeli): YALNIZ FAKE_SEED_STALE_TZ=1 → #471 öncesi tarihsel saat dilimiyle açılmış
  // revizyonu taklit eden SENTETİK profil (saklı ofset güncel tablodan 1 saat farklı) + sağlam karşı taraf. Varsayılan tohum aynen.
  if (process.env.FAKE_SEED_STALE_TZ === "1") {
    const st = await createAstroProfile(ctx, { label: "TEST · Reykjavik 1950 (eski ofset)", birthDate: "1950-06-15", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "gn-3413829" }, resolveAstroLocation);
    const stId = (st.body as { profile: { id: string } }).profile.id;
    const rv = (store.tables.astro_birth_profile_revisions as { profile_id: string; utc_offset_seconds: number }[]).find((r) => r.profile_id === stId)!;
    rv.utc_offset_seconds -= 3600;
    await createAstroProfile(ctx, { label: "TEST · Reykjavik 1951 (güncel ofset)", birthDate: "1951-06-15", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "gn-3413829" }, resolveAstroLocation);
  }
  for (let i = 1; i <= 40; i += 1) {
    await createAstroProfile(ctx, { label: `Sentetik Kişi ${String(i).padStart(2, "0")}`, birthDate: `1970-01-${String((i % 28) + 1).padStart(2, "0")}`, timeKnown: false, locationId: "tr-06-ankara" }, resolveAstroLocation);
  }
  await saveAnalysis(ctx, { profileId: pid, revision: 1, technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" }, includeProviderInterp: true, saveRequestId: "7b7b7b7b-0000-4000-8000-000000000001", title: "Ali natal (gerçek kayıt)" }, false);
  // Aşama 7C: uzmanın KENDİ verisi (kendi tenant'ı): danışanına eşleşik profil + Roxy yorumlu kayıtlı natal analiz.
  // (Tohum, yetkiden bağımsız servis bağlamıyla yazılır; ekranda görünürlük uzmanın GÜNCEL yetkisine göre sunucuda belirlenir.)
  const ectx = { db: createFakeClient(store), tenantId: TENANT_E, userId: EXPERT, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const ep = await createAstroProfile(ectx, { label: "Uzman Danışanı — natal", clientId: EXPERT_CLIENT, birthDate: "1992-02-02", birthTime: "09:15", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" }, resolveAstroLocation);
  const epid = (ep.body as { profile: { id: string } }).profile.id;
  await runAstrology(ectx, { profileId: epid, selections: [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }] }, deps, { ownerPreviewHideInterp: false });
  await saveAnalysis(ectx, { profileId: epid, revision: 1, technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" }, includeProviderInterp: true, saveRequestId: "7c7c7c7c-0000-4000-8000-0000000000e1", title: "Uzman natal (Roxy yorumlu kayıt)" }, false);
  for (let i = 1; i <= 14; i += 1) {
    const technique = i % 3 === 0 ? "vedic.d1" : i % 3 === 1 ? "kp.chart" : "western.transit";
    await ctx.db.rpc("astro_analysis_save_v2", {
      p_tenant_id: TENANT_A, p_user_id: OWNER, p_profile_id: pid, p_profile_revision: 1, p_partner_profile_id: null, p_partner_profile_revision: null, p_result_ids: [],
      p_technique: technique, p_title: `Sentetik liste kaydı ${i}`, p_save_request_id: `7b7b7b7b-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, p_technique_params: {},
      p_profile_snapshot: { label: "Ali Örnek — natal" }, p_method_snapshot: {}, p_technical_snapshot: {}, p_kb_snapshot: [], p_provider_interp_included: false,
      p_provider_interp_snapshot: null, p_versions_snapshot: {}, p_notes: [],
    });
  }
}

const GOLDEN_DIR = join(__dirname, "fixtures", "golden");
/**
 * D4: tarihe bağlı golden'lar (progression / solar arc) YALNIZ kendi hedef tarihleri için döndürülür. Başka tarih
 * istenirse golden'ın tarihi DEĞİŞTİRİLMEZ (ilerletilmiş konumlar tarihe bağlıdır; sahte "gerçek sonuç" üretilmez):
 * açıkça SENTETİK 501 yanıtı verilir → uygulama sonucu kaydetmez; log "gerçek hesaplama doğrulanamadı" der.
 */
const GOLDEN_TARGET_DATE: Record<string, string> = {};
const GOLDEN: Record<string, Record<string, unknown>> = {};
const GOLDEN_RELOCATED: Record<string, { body: Record<string, unknown>; response: Record<string, unknown> }> = {};
const GOLDEN_VARGA: Record<number, Record<string, unknown>> = {};
const GOLDEN_KP: Record<string, Record<string, unknown>> = {};
const KP_EXACT_ONLY = new Set(["kp-planets-mars-2036-split.json", "kp-sublord-mercury-retro-2026.json", "kp-ruling-interval-a.json", "kp-ruling-interval-b.json"]);
for (const f of readdirSync(GOLDEN_DIR).filter((x) => x.endsWith(".json"))) {
  const g = JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8"));
  // Konumlu return golden'ları (Aşama 4.1, Londra) ayrı tutulur; varsayılan endpoint golden'ı doğum yeridir.
  if (/-london\.json$/.test(f)) GOLDEN_RELOCATED[g.endpoint] = { body: g.body, response: g.response };
  // 6: KP golden'ları AYRI (KP dasha Vedik dasha ile aynı uç yolunu kullanır; ayrım gövdedeki significators:true).
  // ATL-P2-03 yeniden doğrulama golden'ları (Mars 2036 tek-an kısa aralık, Merkür retro) YALNIZ birebir gövdeyle eşleşir;
  // uç varsayılanını (yerleşim denemesi) EZMEZ — ezerse ör. 7 günlük konum aralığına 4 noktalı yanıt döner.
  else if (f.startsWith("kp-")) {
    if (!KP_EXACT_ONLY.has(f)) GOLDEN_KP[g.endpoint] = g.response;
  }
  // 5.1B: birden fazla varga golden'ı (D9, D30) → bölüme göre seçilir; uç varsayılanı D9.
  else if (g.endpoint === "/vedic-astrology/divisional-chart") {
    GOLDEN_VARGA[Number(g.body.division)] = g.response;
    if (Number(g.body.division) === 9) GOLDEN[g.endpoint] = g.response;
  } else GOLDEN[g.endpoint] = g.response;
  if (g.endpoint === "/astrology/progressions" || g.endpoint === "/astrology/solar-arc") GOLDEN_TARGET_DATE[g.endpoint] = String(g.body.targetDate);
}
let roxyHits = 0;

/**
 * FINAL (owner kuralı): KATI MOD varsayılan. Sahte Roxy yalnız BİREBİR aynı istek gövdesine sahip GERÇEK golden yanıtını
 * döndürür; başka tarih / an / konum / kişi için golden'ı YENİDEN ETİKETLEMEZ (eski "SENTETİK yankı" davranışı kapalı).
 * Golden yoksa açıkça SENTETİK 501 → uygulama sonucu kaydetmez; log "gerçek sağlayıcı doğrulaması bekliyor" der.
 *   • natal-chart: golden gerçek natal yerine OpenAPI'den türetilmiş fixture vardır → yalnız fixture'ın doğum girdisiyle.
 *   • dasha alt dönemleri: golden major yanıtını 1e-12 ile üreten doğrulanmış model (syntheticDasha) → yalnız golden major
 *     gövdesiyle BİREBİR aynı doğum girdisi için (başka kişiye uygulanmaz).
 * Eski yeniden etiketleme yalnız açıkça FAKE_ROXY_RELABEL=1 ile (yerleşim denemesi; sonuçlar GERÇEK DEĞİLDİR).
 */
const STRICT = process.env.FAKE_ROXY_RELABEL !== "1";
const canon = (v: unknown): string =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canon).join(",")}]`
      : `{${Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
          .join(",")}}`;
const ALL_GOLDEN: { endpoint: string; body: string; query: Record<string, string> | null; response: Record<string, unknown>; file: string }[] = readdirSync(GOLDEN_DIR)
  .filter((x) => x.endsWith(".json"))
  .map((f) => {
    const g = JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8"));
    return { endpoint: g.endpoint, body: canon(g.body), query: g.query ?? null, response: g.response, file: f };
  });
const SCHEMA_DIR = join(__dirname, "fixtures", "schema");
const SCHEMA_FIXTURES: { endpoint: string; body: string; response: Record<string, unknown>; file: string }[] =
  process.env.FAKE_SCHEMA_FIXTURES === "1"
    ? readdirSync(SCHEMA_DIR)
        .filter((x) => x.endsWith(".json"))
        .map((f) => {
          const g = JSON.parse(readFileSync(join(SCHEMA_DIR, f), "utf8"));
          if (g._kaynak !== "openapi-schema-example") throw new Error(`${f}: şema-örneği işareti yok`);
          return { endpoint: g.endpoint, body: canon(g.body), response: g.response, file: f };
        })
    : [];
/** Sorgulu golden (ör. fixed-stars orb=3 / orb=1) yalnız AYNI sorgu değerleriyle eşleşir. */
const queryOk = (g: { query: Record<string, string> | null }, params: URLSearchParams | null) => !g.query || Object.entries(g.query).every(([k, v]) => params?.get(k) === v);
function strictMatch(path: string, body: Record<string, unknown>, params: URLSearchParams | null = null): { raw: Record<string, unknown>; source: string } | null {
  const exact = ALL_GOLDEN.find((g) => g.endpoint === path && g.body === canon(body) && queryOk(g, params));
  if (exact) return { raw: structuredClone(exact.response), source: `golden ${exact.file}` };
  // 22.10.2026 (yalnız ek): ŞEMA-ÖRNEĞİ fixture'ları (gerçek yanıt DEĞİL; fixtures/schema) yalnız FAKE_SCHEMA_FIXTURES=1 ile ve BİREBİR
  // gövdeyle döner; log kaynağı açıkça "ŞEMA-ÖRNEĞİ" der. Golden klasörüne KONMAZ.
  const sch = SCHEMA_FIXTURES.find((g) => g.endpoint === path && g.body === canon(body));
  if (sch) return { raw: structuredClone(sch.response), source: `ŞEMA-ÖRNEĞİ ${sch.file} (gerçek sağlayıcı yanıtı değil)` };
  if (path === "/astrology/natal-chart") {
    const bd = (FIXTURE as { birthDetails: Record<string, unknown>; houseSystem?: unknown }).birthDetails;
    const same = ["date", "time", "latitude", "longitude", "timezone"].every((k) => canon(body[k]) === canon(bd[k]));
    if (same && body.houseSystem === (FIXTURE as { houseSystem?: unknown }).houseSystem) return { raw: structuredClone(FIXTURE), source: process.env.FAKE_NATAL_REAL_GOLDEN === "1" ? "golden natal 2026-10-07" : "spec-derived natal fixture (OpenAPI)" };
  }
  // TRANSİT-03: KP zaman aralığı uçlarının 10 gerçek golden'ı (17.10.2026) yukarıda BİREBİR gövdeyle önce eşleşir. Golden'ı
  // olmayan gövdeler için yalnız açıkça FAKE_ROXY_KP_SYNTH=1 verilirse bağımsız astronomiyle kurulan SENTETİK yanıt
  // (syntheticKpTiming; golden KP verisine sabitlenmiş, ≤0,005°) döner — log "SENTETİK" der; GERÇEK SAĞLAYICI SONUCU DEĞİLDİR.
  if (process.env.FAKE_ROXY_KP_SYNTH === "1") {
    if (path === "/vedic-astrology/kp/sublord-changes") return { raw: syntheticSublordChanges(body as never), source: "SENTETİK KP sub-lord (astronomy-engine)" };
    if (path === "/vedic-astrology/kp/rasi-changes") return { raw: syntheticRasiChanges(body as never), source: "SENTETİK KP rasi (astronomy-engine)" };
    if (path === "/vedic-astrology/kp/planets-interval" && body.intervalMinutes !== 15) return { raw: syntheticPlanetsInterval(body as never), source: "SENTETİK KP konum aralığı (astronomy-engine)" };
  }
  const m = /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)(?:\/([A-Za-z]+))?$/.exec(path);
  if (m) {
    const major = ALL_GOLDEN.find((g) => g.endpoint === "/vedic-astrology/dasha/major" && g.body === canon(body));
    const sub = major ? syntheticSubResponse(major.response, m[1], m[2] ?? null) : null;
    if (sub) return { raw: sub, source: `doğrulanmış dasha modeli (${major!.file})` };
  }
  // 2026-10-21: Sookshma / Prana yolları (golden'ı olmayan) ve güncel dönem zinciri (golden anı dışındaki anlar) → AYNI doğrulanmış
  // model (Sookshma + Prana + KP current gerçek golden'larını BİREBİR üretir; dasha-depth harness denetler). Anlatı üretilmez.
  const deep = /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)\/([A-Za-z]+)\/([A-Za-z]+)(?:\/([A-Za-z]+))?$/.exec(path);
  if (deep) {
    const major = ALL_GOLDEN.find((g) => g.endpoint === "/vedic-astrology/dasha/major" && g.body === canon(body));
    const r = major ? syntheticDeepResponse(major.response, [deep[1], deep[2], deep[3], ...(deep[4] ? [deep[4]] : [])]) : null;
    if (r) return { raw: r, source: `doğrulanmış dasha modeli (${major!.file})` };
  }
  if (path === "/vedic-astrology/dasha/current" && typeof body.datetime === "string") {
    const { datetime, ...birth } = body;
    const major = ALL_GOLDEN.find((g) => g.endpoint === "/vedic-astrology/dasha/major" && g.body === canon(birth));
    const r = major ? syntheticCurrentResponse(major.response, String(datetime)) : null;
    if (r) return { raw: r, source: `doğrulanmış dasha modeli — güncel zincir (${major!.file})` };
  }
  return null;
}

function startFakeRoxy() {
  const cert = process.env.FAKE_ROXY_CERT;
  const key = process.env.FAKE_ROXY_KEY;
  if (!cert || !key) return;
  createHttpsServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "https://x").pathname.replace(/^\/api\/v2/, "");
      if (req.headers["x-api-key"] !== "local-fake-roxy-key") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      roxyHits += 1;
      console.log(`fake roxy #${roxyHits} ${path}`);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      let raw: Record<string, unknown> | undefined;
      const kpReq = path.startsWith("/vedic-astrology/kp/") || body.significators === true;
      if (STRICT) {
        const hit = strictMatch(path, body, new URL(req.url ?? "/", "https://x").searchParams);
        if (!hit) {
          console.log(`fake roxy SENTETİK 501 ${path}: bu istek için golden fixture yok — gerçek sağlayıcı doğrulaması bekliyor`);
          res.writeHead(501, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ synthetic: true, error: `SENTETİK YEREL TEST: ${path} için bu girdilerle golden fixture yok; gerçek sağlayıcı doğrulaması bekliyor.` }));
          return;
        }
        console.log(`fake roxy ${path} ← ${hit.source}`);
        raw = hit.raw;
      } else if (kpReq && GOLDEN_KP[path] && path !== "/vedic-astrology/dasha/current") {
        raw = structuredClone(GOLDEN_KP[path]);
        // SENTETİK yankılar (yalnız UI testi; içerik golden anıdır): istenen an / sayı.
        if (path === "/vedic-astrology/kp/ruling-planets") raw.datetime = new Date(Date.parse(`${String(body.datetime)}Z`) - Number(body.timezone) * 3600_000).toISOString();
        if (path === "/vedic-astrology/kp/horary") raw.questionTime = `${String(body.date)}T${String(body.time)}.000Z`;
        if (path === "/vedic-astrology/kp/planets-interval") (raw.intervals as { datetime: string }[])[0].datetime = String(body.startDatetime);
      } else if (kpReq && path.startsWith("/vedic-astrology/dasha/sub/") && GOLDEN_KP["/vedic-astrology/dasha/major"]) {
        const m = /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)(?:\/([A-Za-z]+))?(?:\/([A-Za-z]+))?(?:\/([A-Za-z]+))?$/.exec(path);
        const segs = m ? [m[1], m[2], m[3], m[4]].filter(Boolean) : [];
        raw = !m ? undefined : segs.length <= 2 ? (syntheticSubResponse(GOLDEN_KP["/vedic-astrology/dasha/major"], m[1], m[2] ?? null) ?? undefined) : (syntheticDeepResponse(GOLDEN_KP["/vedic-astrology/dasha/major"], segs) ?? undefined);
      } else if (kpReq && path === "/vedic-astrology/dasha/current" && GOLDEN_KP["/vedic-astrology/dasha/major"]) {
        raw = syntheticCurrentResponse(GOLDEN_KP["/vedic-astrology/dasha/major"], String(body.datetime)) ?? undefined;
      } else if (path === "/astrology/natal-chart") {
        const natal = structuredClone(FIXTURE) as Record<string, unknown>;
        natal.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
        natal.houseSystem = body.houseSystem;
        raw = natal;
      } else if (GOLDEN_TARGET_DATE[path] && String(body.targetDate) !== GOLDEN_TARGET_DATE[path]) {
        console.log(`fake roxy SENTETİK 501 ${path}: targetDate ${String(body.targetDate)} için golden fixture yok (yalnız ${GOLDEN_TARGET_DATE[path]}) — gerçek hesaplama doğrulanamadı`);
        res.writeHead(501, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ synthetic: true, error: `SENTETİK YEREL TEST: ${path} için yalnız ${GOLDEN_TARGET_DATE[path]} tarihli golden var; gerçek hesaplama doğrulanamadı.` }));
        return;
      } else if (GOLDEN[path]) {
        const rel = GOLDEN_RELOCATED[path];
        const isRel = rel && Math.abs(Number(body.latitude) - Number(rel.body.latitude)) < 1e-3 && Math.abs(Number(body.longitude) - Number(rel.body.longitude)) < 1e-3;
        const varga = path === "/vedic-astrology/divisional-chart" ? GOLDEN_VARGA[Number(body.division)] : undefined;
        raw = structuredClone(isRel ? rel.response : (varga ?? GOLDEN[path]));
        // SENTETİK konum yankısı (golden dışı konumlar): harita içeriği golden'dır, yalnız yankı.
        if ((path === "/astrology/solar-return" || path === "/astrology/lunar-return") && !isRel) raw.location = { ...(raw.location as object), latitude: body.latitude, longitude: body.longitude };
        if (path === "/forecast/transits") raw.events = (raw.events as { date: string }[]).filter((e) => e.date >= body.startDate && e.date <= body.endDate);
        // SENTETİK yankı: istenen konum (harita içeriği golden) → adaptörün konum doğrulaması geçer.
        if (path === "/astrology/relocation-chart") raw.relocation = { latitude: body.relocationLatitude, longitude: body.relocationLongitude };
        // SENTETİK yankı (5.1A): Gochara içeriği golden anındır; yalnız transitDatetime istenen ana çekilir (UI testi).
        if (path === "/vedic-astrology/transit") raw.transitDatetime = `${String(body.transitDate)}T${String(body.transitTime)}`;
        if (path === "/astrology/local-space") raw.birthDetails = { ...(raw.birthDetails as object), latitude: body.latitude, longitude: body.longitude };
        if (path === "/astrology/lunar-return") {
          // Sağlayıcı kuralı taklidi: returnDate'e EN YAKIN dönüş (SENTETİK; golden harita korunur, yalnız an).
          const birthUtc = new Date(Date.parse(`${body.birthDate}T${body.birthTime}Z`) - Number(body.timezone) * 3600_000).toISOString();
          const moon = natalMoonLongitude(birthUtc);
          const target = Date.parse(`${body.returnDate}T12:00:00Z`);
          const months = [-1, 0, 1].map((d) => {
            const m = new Date(`${String(body.returnDate).slice(0, 7)}-15T00:00:00Z`);
            m.setUTCMonth(m.getUTCMonth() + d);
            return m.toISOString().slice(0, 7);
          });
          const near = months
            .flatMap((m) => lunarReturnsInMonth(moon, m))
            .sort((a, b) => Math.abs(Date.parse(`${a.approxUtc}:00Z`) - target) - Math.abs(Date.parse(`${b.approxUtc}:00Z`) - target))[0];
          if (near) raw.lunarReturnDate = new Date(Date.parse(`${near.approxUtc}:00Z`) + Number(body.timezone) * 3600_000).toISOString().slice(0, 19);
        }
      }
      // 5.1F: golden'ı olmayan dasha alt yolları → SENTETİK (golden'ları birebir üreten doğrulanmış model; anlatı yok).
      const sub = !raw ? /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)(?:\/([A-Za-z]+))?$/.exec(path) : null;
      if (sub && GOLDEN["/vedic-astrology/dasha/major"]) raw = syntheticSubResponse(GOLDEN["/vedic-astrology/dasha/major"], sub[1], sub[2] ?? null) ?? undefined;
      const deepSub = !raw ? /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)\/([A-Za-z]+)\/([A-Za-z]+)(?:\/([A-Za-z]+))?$/.exec(path) : null;
      if (deepSub && GOLDEN["/vedic-astrology/dasha/major"]) raw = syntheticDeepResponse(GOLDEN["/vedic-astrology/dasha/major"], [deepSub[1], deepSub[2], deepSub[3], ...(deepSub[4] ? [deepSub[4]] : [])]) ?? undefined;
      if (!raw && path === "/vedic-astrology/dasha/current" && GOLDEN["/vedic-astrology/dasha/major"]) raw = syntheticCurrentResponse(GOLDEN["/vedic-astrology/dasha/major"], String(body.datetime)) ?? undefined;
      res.writeHead(raw ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(raw ?? { error: "unknown endpoint" }));
    });
  }).listen(PORT + 1, "127.0.0.1", () => console.log(`fake roxy https :${PORT + 1}`));
}

void seed().then(() => {
  startFakeRoxy();
  createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", async () => {
      try {
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const r = handlePostgrest(store, `http://127.0.0.1:${PORT}${req.url}`, (req.method ?? "GET").toUpperCase(), headers, Buffer.concat(chunks).toString("utf8"));
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(await r.text());
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "FAKE", message: (e as Error).message }));
      }
    });
  }).listen(PORT, "127.0.0.1", () => console.log(`fake postgrest :${PORT} — results=${store.tables.astro_provider_results.length}`));
});
