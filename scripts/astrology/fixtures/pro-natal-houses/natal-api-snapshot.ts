/**
 * Natal API ANLIK GÖRÜNTÜSÜ — mevcut 4 ev sisteminin API çıktısı ve önbellek anahtarları (Aşama 2 regresyon kilidi).
 *
 * Aynı modül hem DEĞİŞİKLİKSİZ taban kodda (#655 head) hem bu dalda çalıştırılır; çıktılar birebir aynı olmalıdır.
 * Taban üretimi (yalnız yeniden üretim):
 *   cd <taban worktree> && npx tsx --tsconfig scripts/astrology/tsconfig.json <bu dosyanın kopyası> > natal-api-baseline-2026-10-31.json
 * Ağ YOK: sahte Supabase (bellek içi) + sahte sağlayıcı (gerçek Türkçe golden yanıt). Kimlik/zaman alanları normalize edilir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { getAstrologyResult, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { createFakeClient, createStore } from "@/scripts/astrology/fakeSupabase";

const FIX = join(process.cwd(), "scripts", "astrology", "fixtures");
export const GOLDEN = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8")) as Record<string, unknown>;
export const PROVIDER_SYSTEMS = ["placidus", "whole-sign", "equal", "koch"] as const;

export const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
export const CLIENT = "11111111-1111-4111-8111-111111111111";
export const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
export const LOCATIONS = new Map<string, ResolvedLocation>([[ISTANBUL.id, ISTANBUL]]);
export const resolveLoc = (id: unknown): ResolvedLocation | null => (typeof id === "string" ? (LOCATIONS.get(id) ?? null) : null);

export function seedStore() {
  return createStore({
    users: [{ id: OWNER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT, email: "owner@example.invalid" }],
    clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Örnek", soyad: "Danışan" }],
  });
}
export function ownerCtx(store: ReturnType<typeof createStore>): EngineCtx {
  return { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
}

/** Sahte sağlayıcı: natal-chart → verilen ham yanıt (varsayılan Türkçe golden); houseSystem isteğin yankısı. Çağrılar sayılır. */
export function providerDeps(rawFor: (endpoint: string, body: Record<string, unknown>) => unknown = () => GOLDEN) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const locks = new Map<string, number>();
  const deps: EngineDeps = {
    config: { apiKey: "test-key-not-secret", baseUrl: "https://provider-fake.local/api/v2" },
    callProvider: async (_cfg, endpoint, body) => {
      calls.push({ endpoint, body });
      const raw = structuredClone(rawFor(endpoint, body)) as Record<string, unknown>;
      if (endpoint === "/astrology/natal-chart") raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async (scope, value, limit) => {
      const k = `${scope}:${value}`;
      const n = (locks.get(k) ?? 0) + 1;
      locks.set(k, n);
      return { allowed: n <= limit, retryAfterSec: n <= limit ? 0 : 5 };
    },
    sleep: async () => undefined,
    log: () => undefined,
  };
  return { calls, deps };
}

export async function createProfile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(
    ctx,
    { label: "Örnek — natal", clientId: CLIENT, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over },
    resolveLoc,
  );
  if (r.status !== 201) throw new Error(`profil ${r.status} ${JSON.stringify(r.body)}`);
  return (r.body as { profile: { id: string } }).profile.id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOLATILE_KEY = /^(id|resultIds|computedAt|createdAt|updatedAt|created_at|updated_at|analysisAt|savedAt|analysis_at|profileId|clientId|analysisId)$/;
/** Kimlik/zaman alanlarını sabitler (iki ağaçta rastgele UUID ve saat farklıdır). */
export function normalize(v: unknown): unknown {
  return JSON.parse(
    JSON.stringify(v, (k, x) => {
      if (VOLATILE_KEY.test(k)) return "<v>";
      if (typeof x === "string" && UUID.test(x)) return "<uuid>";
      if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(x) && k !== "birthUtc") return "<t>";
      return x;
    }),
  );
}

/** Mevcut 4 sistemin: birim kimliği (input_hash + gövde + adaptör), run görünümü, results/[id], kayıtlı analiz kaydet+aç. */
export async function natalApiSnapshot(): Promise<Record<string, unknown>> {
  let seq = 0;
  const reqId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const out: Record<string, unknown> = {};
  const def = getTechnique("western.natal")!;
  const births = [
    { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-07-15T11:30:00.000Z" },
    { birth: { birthDate: "1972-02-29", birthTime: null, utcOffsetSeconds: 7200, latitude: -33.8688, longitude: 151.2093 }, birthUtc: "1972-02-28T22:00:00.000Z" },
    { birth: { birthDate: "1900-01-01", birthTime: "12:00:00", utcOffsetSeconds: 7016, latitude: 63.4305, longitude: 10.3951 }, birthUtc: "1900-01-01T10:03:04.000Z" },
  ];
  const keys: unknown[] = [];
  for (const b of births)
    for (const hs of PROVIDER_SYSTEMS)
      for (const nodeType of ["true", "mean"]) {
        const opts = def.parseOptions({ houseSystem: hs, nodeType }, new Date(0))!;
        const u = def.units({ birth: b.birth as never, birthUtc: b.birthUtc, partner: null }, opts);
        keys.push({ hs, nodeType, opts, units: u.map((x) => ({ inputHash: x.inputHash, adapterVersion: x.adapterVersion, endpoint: x.endpoint, body: x.body, covers: x.covers })) });
      }
  out.keys = keys;

  for (const timeKnown of [true, false]) {
    const store = seedStore();
    const ctx = ownerCtx(store);
    const pid = await createProfile(ctx, timeKnown ? {} : { birthTime: undefined, timeKnown: false, timeAccuracy: "unknown" });
    const runs: unknown[] = [];
    for (const hs of PROVIDER_SYSTEMS) {
      const p = providerDeps();
      const r = await runAstrology(ctx, { profileId: pid, selections: [{ technique: "western.natal", options: { houseSystem: hs, nodeType: "true" } }] }, p.deps, { ownerPreviewHideInterp: false });
      const body = r.body as { results: { view?: { id: string } }[] };
      const viewId = body.results[0]?.view?.id;
      const g = viewId ? await getAstrologyResult(ctx, viewId, { profileId: null, revision: null, ownerPreviewHideInterp: false }) : null;
      const save = await saveAnalysis(ctx, { profileId: pid, revision: 1, technique: "western.natal", options: { houseSystem: hs, nodeType: "true" }, title: `Natal ${hs}`, saveRequestId: reqId() }, false);
      const sid = (save.body as { analysisId?: string }).analysisId;
      const open = sid ? await getAnalysis(ctx, sid, false) : null;
      const saveById = viewId ? await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId: viewId, title: `Natal id ${hs}`, saveRequestId: reqId() }, false) : null;
      runs.push({ hs, run: { status: r.status, body: r.body }, calls: p.calls.length, result: g, save: { status: save.status, body: save.body }, open, saveById: saveById && { status: saveById.status, body: saveById.body } });
    }
    out[timeKnown ? "runsTimeKnown" : "runsTimeUnknown"] = runs;
  }
  return normalize(out) as Record<string, unknown>;
}

if (require.main === module) {
  void natalApiSnapshot().then((s) => process.stdout.write(JSON.stringify(s)));
}
