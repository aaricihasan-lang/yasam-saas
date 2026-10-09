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
import { syntheticSubResponse } from "./syntheticDasha";

const PORT = Number(process.argv[2] ?? 54329);
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const ADMIN2 = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));

const store = createStore({
  users: [
    { id: OWNER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "admin@yasamsistemi.com", full_name: "Owner (yerel test)", module_permissions: {} },
    { id: ADMIN2, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TENANT_A, email: "admin2@local.test", full_name: "Admin 2 (owner değil)", module_permissions: {} },
  ],
  clients: [
    { id: "11111111-1111-4111-8111-111111111111", tenant_id: TENANT_A, ad: "Ali", soyad: "Örnek", dogum: "1990-07-15" },
    { id: "22222222-2222-4222-8222-222222222222", tenant_id: TENANT_A, ad: "Ayşe", soyad: "Deneme", dogum: null },
  ],
});
store.sessions.set("local-owner-token-aaaaaaaaaaaa", OWNER);
store.sessions.set("local-admin2-token-bbbbbbbbbbb", ADMIN2);

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
  await createAstroProfile(
    ctx,
    { label: "Sentetik B — Ankara", clientId: "22222222-2222-4222-8222-222222222222", birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" },
    resolveAstroLocation,
  );
  // Aşama 7B görsel doğrulama (SENTETİK): aynı ad/soyad/doğum tarihli üç danışan, sayfalama için 40 ek profil,
  // Ali profilinde üç gelenekte kayıtlı analizler (1 gerçek kaydet akışı + liste için sentetik satırlar).
  store.tables.clients.push(
    { id: "c7b70001-0000-4000-8000-000000000001", tenant_id: TENANT_A, ad: "İlknur", soyad: "IŞIK", dogum: "1985-05-06", telefon: "0532 123 45 67", kan: "A Rh+", created_at: "2026-01-02T10:00:00Z" },
    { id: "c7b70002-0000-4000-8000-000000000002", tenant_id: TENANT_A, ad: "ilknur", soyad: "ışık", dogum: "1985-05-06", telefon: null, created_at: "2026-02-02T10:00:00Z" },
    { id: "c7b70003-0000-4000-8000-000000000003", tenant_id: TENANT_A, ad: "İLKNUR", soyad: "Işık", dogum: "1985-05-06", telefon: "05559876543", created_at: "2026-03-02T10:00:00Z" },
  );
  await createAstroProfile(ctx, { label: "İlknur Işık — natal", birthDate: "1985-05-06", birthTime: "08:15", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" }, resolveAstroLocation);
  for (let i = 1; i <= 40; i += 1) {
    await createAstroProfile(ctx, { label: `Sentetik Kişi ${String(i).padStart(2, "0")}`, birthDate: `1970-01-${String((i % 28) + 1).padStart(2, "0")}`, timeKnown: false, locationId: "tr-06-ankara" }, resolveAstroLocation);
  }
  await saveAnalysis(ctx, { profileId: pid, revision: 1, technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" }, includeProviderInterp: true, saveRequestId: "7b7b7b7b-0000-4000-8000-000000000001", title: "Ali natal (gerçek kayıt)" }, false);
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
const GOLDEN: Record<string, Record<string, unknown>> = {};
const GOLDEN_RELOCATED: Record<string, { body: Record<string, unknown>; response: Record<string, unknown> }> = {};
const GOLDEN_VARGA: Record<number, Record<string, unknown>> = {};
const GOLDEN_KP: Record<string, Record<string, unknown>> = {};
for (const f of readdirSync(GOLDEN_DIR).filter((x) => x.endsWith(".json"))) {
  const g = JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8"));
  // Konumlu return golden'ları (Aşama 4.1, Londra) ayrı tutulur; varsayılan endpoint golden'ı doğum yeridir.
  if (/-london\.json$/.test(f)) GOLDEN_RELOCATED[g.endpoint] = { body: g.body, response: g.response };
  // 6: KP golden'ları AYRI (KP dasha Vedik dasha ile aynı uç yolunu kullanır; ayrım gövdedeki significators:true).
  else if (f.startsWith("kp-")) GOLDEN_KP[g.endpoint] = g.response;
  // 5.1B: birden fazla varga golden'ı (D9, D30) → bölüme göre seçilir; uç varsayılanı D9.
  else if (g.endpoint === "/vedic-astrology/divisional-chart") {
    GOLDEN_VARGA[Number(g.body.division)] = g.response;
    if (Number(g.body.division) === 9) GOLDEN[g.endpoint] = g.response;
  } else GOLDEN[g.endpoint] = g.response;
}
let roxyHits = 0;

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
      if (kpReq && GOLDEN_KP[path]) {
        raw = structuredClone(GOLDEN_KP[path]);
        // SENTETİK yankılar (yalnız UI testi; içerik golden anıdır): istenen an / sayı.
        if (path === "/vedic-astrology/kp/ruling-planets") raw.datetime = new Date(Date.parse(`${String(body.datetime)}Z`) - Number(body.timezone) * 3600_000).toISOString();
        if (path === "/vedic-astrology/kp/horary") raw.questionTime = `${String(body.date)}T${String(body.time)}.000Z`;
        if (path === "/vedic-astrology/kp/planets-interval") (raw.intervals as { datetime: string }[])[0].datetime = String(body.startDatetime);
      } else if (kpReq && path.startsWith("/vedic-astrology/dasha/sub/") && GOLDEN_KP["/vedic-astrology/dasha/major"]) {
        const m = /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)(?:\/([A-Za-z]+))?$/.exec(path);
        raw = m ? (syntheticSubResponse(GOLDEN_KP["/vedic-astrology/dasha/major"], m[1], m[2] ?? null) ?? undefined) : undefined;
      } else if (path === "/astrology/natal-chart") {
        const natal = structuredClone(FIXTURE) as Record<string, unknown>;
        natal.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
        natal.houseSystem = body.houseSystem;
        raw = natal;
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
