// KP Transit EN BÜYÜK teknik anlık görüntüleri (sentetik sağlayıcı; ücretli çağrı YOK) → PG parça/boyut testi girdisi.
// (a) 15 parça: 7 gezegen × (Sub-Lord + Rasi) + konum tablosu, 7 gün × 60 dk  (b) 14 parça: 7 gezegen × 2, 92 gün.
// Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pg/kp-transit-max-snapshot.ts <çıktı-klasörü>
import { writeFileSync } from "node:fs";
import { createFakeClient, createStore } from "../fakeSupabase";
import { syntheticPlanetsInterval, syntheticRasiChanges, syntheticSublordChanges } from "../syntheticKpTiming";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";

const OUT = process.argv[2];
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", CLIENT = "44444444-4444-4444-8444-444444444444";
const IST = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
type J = Record<string, unknown>;
const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "A" }] });
const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) } as EngineCtx;
const deps: EngineDeps = {
  config: { apiKey: "k-test", baseUrl: "https://roxy-fake.local/api/v2" },
  callProvider: async (_c, endpoint, body) => {
    if (endpoint.endsWith("sublord-changes")) return { ok: true, raw: syntheticSublordChanges(body as never), attempts: 1 };
    if (endpoint.endsWith("rasi-changes")) return { ok: true, raw: syntheticRasiChanges(body as never), attempts: 1 };
    if (endpoint.endsWith("planets-interval")) return { ok: true, raw: syntheticPlanetsInterval(body as never), attempts: 1 };
    return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
  },
  rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  log: () => undefined,
  now: () => new Date("2026-11-25T09:00:00Z"),
} as EngineDeps;
async function main() {
const pr = await createAstroProfile(ctx, { label: "Sentetik", clientId: CLIENT, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, (id) => (id === IST.id ? IST : null));
const pid = ((pr.body as J).profile as J).id as string;
const ALL7 = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];
for (const [name, range, n] of [
  ["kp15-7gun-60dk", { startDate: "2026-11-02", days: 7, planets: ALL7, kinds: ["sublord", "rasi", "positions"], intervalMinutes: 60 }, 15],
  ["kp14-92gun", { startDate: "2026-11-02", days: 92, planets: ALL7, kinds: ["sublord", "rasi"] }, 14],
] as const) {
  const r = await runAstrology(ctx, { profileId: pid, selections: [{ technique: "kp.transit", options: { range, ayanamsa: "kp-newcomb", nodeType: "mean" } }], confirmNewRequests: n }, deps, { ownerPreviewHideInterp: false });
  const it = ((r.body as J).results as J[])[0] as J;
  const tech = (it.view as J).technical;
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(tech));
  const rows = ((tech as J).sublord as { changes: unknown[] }[]).reduce((x, s) => x + s.changes.length, 0) + ((tech as J).rasi as { changes: unknown[] }[]).reduce((x, s) => x + s.changes.length, 0);
  console.log(`${name}: ${n} parça, geçiş satırı ${rows}, konum satırı ${((tech as J).positions as { rows: unknown[] } | null)?.rows.length ?? 0}, JSON ${JSON.stringify(tech).length} B`);
}
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
