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
}

const GOLDEN_DIR = join(__dirname, "fixtures", "golden");
const GOLDEN: Record<string, Record<string, unknown>> = {};
for (const f of readdirSync(GOLDEN_DIR).filter((x) => x.endsWith(".json"))) {
  const g = JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8"));
  GOLDEN[g.endpoint] = g.response;
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
      if (path === "/astrology/natal-chart") {
        const natal = structuredClone(FIXTURE) as Record<string, unknown>;
        natal.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
        natal.houseSystem = body.houseSystem;
        raw = natal;
      } else if (GOLDEN[path]) {
        raw = structuredClone(GOLDEN[path]);
        if (path === "/forecast/transits") raw.events = (raw.events as { date: string }[]).filter((e) => e.date >= body.startDate && e.date <= body.endDate);
      }
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
