/**
 * Gökyüzü Atlası — DEMO HESABI salt okunur görünüm servisi (D8, owner kararı 2026-11-01).
 *
 * Demo hesabı (users.is_demo_account=true) gerçek Atlas uçlarına ERİŞEMEZ (DEMO_DENIED → tek tip 404; değişmedi).
 * Bunun yerine yalnız bu servis, depoda duran ÖNCEDEN HESAPLANMIŞ sentetik örneği (fixture.generated.ts) sunar:
 *   • Örnek, scripts/astrology/demo/build-demo-fixture.ts ile SİSTEMİN KENDİ MOTORUNDAN üretilir (depodaki gerçek sağlayıcı
 *     yanıtlarıyla birebir; sağlayıcı yorumu yok). CI `--check` ile yeniden üretilebilirliği doğrular.
 *   • Bu modül VERİTABANI, motor, sağlayıcı istemcisi ya da ağ İÇE AKTARMAZ (statik test denetler) → demo isteği hiçbir
 *     tenant verisine dokunamaz ve ücretli sağlayıcıya ulaşamaz.
 *   • Yazma / değişiklik / rapor / yeni hesaplama → 403 DEMO_READONLY. Hesap planı ve çalıştırma yalnız hazır örneği döndürür;
 *     hazır örneği olmayan seçim açık nedenle engellenir (uydurma sonuç üretilmez).
 */
import DEMO_FIXTURE_JSON from "./fixture.generated";

export type DemoResponse = { status: number; body: Record<string, unknown> };

type Plan = {
  cachedCount: number;
  coveredCount: number;
  dedupedCount: number;
  units: unknown[];
  selections: { technique: string; options: Record<string, unknown> | null }[];
};
type Selection = {
  profileId: string;
  technique: string;
  options: Record<string, unknown>;
  plan: Plan;
  view: Record<string, unknown>;
  workspace: Record<string, unknown> | null;
};
type ProfileList = { profiles: { id: string; label: string }[] } & Record<string, unknown>;
type ListAnalysis = { id: string; technique: string; tradition: string };
type AnalysesList = { analyses: ListAnalysis[]; groups: { tradition: string; techniques: { technique: string }[] }[] } & Record<string, unknown>;
type Fixture = {
  profilesList: ProfileList;
  profilesArchive: ProfileList;
  profilesArchived: ProfileList;
  profiles: Record<string, Record<string, unknown>>;
  analysesList: Record<string, AnalysesList>;
  analyses: Record<string, Record<string, unknown>>;
  revisions: Record<string, Record<string, unknown>>;
  kb: Record<string, unknown>;
  emptyClientCandidates: Record<string, unknown>;
  emptyHoraryRecords: Record<string, unknown>;
  selections: Selection[];
};
let parsed: Fixture | null = null;
/** Örnek ilk istekte bir kez ayrıştırılır (yanıtlar her seferinde kopyalanır → paylaşılan nesne değişmez). */
function fx(): Fixture {
  parsed ??= JSON.parse(DEMO_FIXTURE_JSON) as Fixture;
  return parsed;
}

export const DEMO_READONLY_CODE = "DEMO_READONLY";
export const DEMO_READONLY_MESSAGE =
  "Demo hesabında Gökyüzü Atlası salt okunurdur: kayıt, değişiklik, rapor indirme ve yeni hesaplama yapılmaz. Hazır örnek analizleri inceleyebilirsiniz.";
export const DEMO_SAMPLE_ONLY_CODE = "DEMO_SAMPLE_ONLY";
const DEMO_SAMPLE_ONLY_MESSAGE = "Demo hesabında bu seçim için hazır örnek yok; yeni hesaplama yapılmaz. Örnek Harita A'daki hazır analizleri inceleyebilirsiniz.";

const ok = (body: Record<string, unknown>): DemoResponse => ({ status: 200, body: { ok: true, ...body } });
const readonly = (): DemoResponse => ({ status: 403, body: { ok: false, code: DEMO_READONLY_CODE, error: DEMO_READONLY_MESSAGE } });
const notFound = (): DemoResponse => ({ status: 404, body: { ok: false, code: "NOT_FOUND", error: "Bulunamadı." } });
const clone = <T>(v: T): T => structuredClone(v);
const norm = (s: string) => s.toLocaleLowerCase("tr-TR");

/** Hazır örnekler (teknik + profil). Aynı profil + teknik için tek örnek vardır. */
export function demoSampleTechniques(): { profileId: string; technique: string }[] {
  return fx().selections.map((s) => ({ profileId: s.profileId, technique: s.technique }));
}

function findSample(profileId: unknown, technique: unknown, options: unknown): Selection | null {
  const s = fx().selections.find((x) => x.profileId === profileId && x.technique === technique);
  if (!s) return null;
  // İkili teknik: hazır örnek yalnız aynı karşı tarafla (Örnek Harita B) geçerlidir.
  const want = s.options.partnerProfileId;
  if (want !== undefined) {
    const got = options && typeof options === "object" ? (options as Record<string, unknown>).partnerProfileId : undefined;
    if (got !== want) return null;
  }
  return s;
}

function listProfiles(sp: URLSearchParams): DemoResponse {
  // Arşivlenmiş profil yok; toplu silme kimlik listesi (scope=ids) silme akışına aittir → salt okunur.
  if (sp.get("scope") === "ids") return readonly();
  if (sp.get("archived") === "1") return { status: 200, body: clone(fx().profilesArchived) };
  const body = clone(sp.get("view") === "archive" ? fx().profilesArchive : fx().profilesList);
  const q = norm((sp.get("q") ?? "").trim());
  if (q) {
    body.profiles = body.profiles.filter((p) => norm(p.label).includes(q));
    (body as Record<string, unknown>).total = body.profiles.length;
  }
  return { status: 200, body };
}

function listAnalyses(sp: URLSearchParams): DemoResponse {
  const pid = sp.get("profileId") ?? "";
  const base = fx().analysesList[pid];
  if (!base) return { status: 404, body: { ok: false, code: "PROFILE_NOT_FOUND", error: "Doğum profili bulunamadı." } };
  const tradition = sp.get("tradition") || null;
  const technique = sp.get("technique") || null;
  const limN = Number(sp.get("limit") ?? 50);
  const offN = Number(sp.get("offset") ?? 0);
  const limit = Number.isInteger(limN) ? Math.min(100, Math.max(1, limN)) : 50;
  const offset = Number.isInteger(offN) ? Math.max(0, offN) : 0;
  const filtered = base.analyses.filter((a) => (!tradition || a.tradition === tradition) && (!technique || a.technique === technique));
  const page = filtered.slice(offset, offset + limit);
  return {
    status: 200,
    body: { ...clone(base), filter: { tradition, technique }, filteredTotal: filtered.length, offset, limit, hasMore: offset + page.length < filtered.length, analyses: clone(page) },
  };
}

type EngineBody = { profileId?: unknown; revision?: unknown; selections?: unknown };

function engineRequest(body: unknown): { profileId: string; sels: { technique: unknown; options: unknown }[] } | DemoResponse {
  const b = (body && typeof body === "object" ? body : {}) as EngineBody;
  const profileId = typeof b.profileId === "string" ? b.profileId : "";
  if (!fx().profiles[profileId]) return { status: 404, body: { ok: false, code: "PROFILE_NOT_FOUND", error: "Doğum profili bulunamadı." } };
  if (b.revision !== 1) return { status: 409, body: { ok: false, code: "REVISION_MISMATCH", error: "Profil revizyonu güncel değil." } };
  if (!Array.isArray(b.selections) || b.selections.length === 0 || b.selections.length > 60) {
    return { status: 400, body: { ok: false, code: "INVALID_SELECTIONS", error: "Geçersiz hesap seçimi." } };
  }
  const sels = b.selections.map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { technique: o.technique, options: o.options ?? null };
  });
  return { profileId, sels };
}

const blockOf = () => ({ code: DEMO_SAMPLE_ONLY_CODE, error: DEMO_SAMPLE_ONLY_MESSAGE });

function plan(profileId: string, sels: { technique: unknown; options: unknown }[]) {
  const samples = sels.map((s) => findSample(profileId, s.technique, s.options));
  const hit = samples.filter((x): x is Selection => !!x);
  return {
    samples,
    plan: {
      selectedCount: sels.length,
      blockedCount: samples.length - hit.length,
      newRequestCount: 0,
      cachedCount: hit.reduce((a, s) => a + s.plan.cachedCount, 0),
      coveredCount: hit.reduce((a, s) => a + s.plan.coveredCount, 0),
      dedupedCount: hit.reduce((a, s) => a + s.plan.dedupedCount, 0),
      requiresConfirmation: false,
      units: hit.flatMap((s) => clone(s.plan.units)),
      selections: samples.map((s, i) =>
        s
          ? clone(s.plan.selections[0])
          : { technique: typeof sels[i].technique === "string" ? sels[i].technique : null, options: clone(sels[i].options), unitCount: 0, newRequests: 0, blocked: blockOf(), info: null },
      ),
    },
  };
}

function results(samples: (Selection | null)[], sels: { technique: unknown }[]): Record<string, unknown>[] {
  return samples.map((s, i) => (s ? { ...clone(s.view), selectionIndex: i } : { selectionIndex: i, technique: sels[i].technique, ok: false, ...blockOf() }));
}

function engine(op: "plan" | "view" | "run", body: unknown): DemoResponse {
  const r = engineRequest(body);
  if ("status" in r) return r;
  const p = plan(r.profileId, r.sels);
  if (op === "plan") return ok({ plan: p.plan, revision: 1 });
  const revision = clone(fx().revisions[r.profileId] ?? null);
  const items = results(p.samples, r.sels);
  if (op === "view") return ok({ revision, results: items });
  const anyOk = items.some((x) => x.ok === true);
  const executed = { newResults: 0, cachedResults: p.samples.filter(Boolean).length, providerAttempts: 0 };
  return {
    status: anyOk ? 200 : 422,
    body: { ok: anyOk, ...(anyOk ? {} : blockOf()), plan: p.plan, executed, revision, results: items },
  };
}

function workspace(body: unknown): DemoResponse {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const s = findSample(b.profileId, b.technique, b.options);
  if (s?.workspace) return { status: 200, body: clone(s.workspace) };
  return ok({ technique: typeof b.technique === "string" ? b.technique : null, contextKey: "", contextLocationId: null, noteContext: null, knowledgeBankEnabled: true, topics: [], kbMatches: [], notes: [] });
}

/**
 * Demo isteğini yanıtlar. `path` = /api/astroloji/demo/ sonrasındaki kanonik Atlas API yolu (ör. "profiles", "engine/plan").
 * İzin listesi DIŞINDAKİ her şey: GET → 404, yazma yöntemleri → 403 DEMO_READONLY.
 */
export function handleAstrologyDemoRequest(method: string, path: string, sp: URLSearchParams, body: unknown): DemoResponse {
  const m = method.toUpperCase();
  const seg = path.split("/").filter(Boolean);
  const p = seg.join("/");
  if (m === "GET") {
    // Erişim yoklaması: gerçek /access demo hesabına 404 kalır; arayüz bunun ardından bu yoklamayı dener.
    if (p === "access") return ok({ demo: true, readOnly: true, entitlements: { module: true, engine: true, knowledgeBank: true, providerInterpretations: false }, isOwner: false, providerConfigured: false, ownerPreviewAvailable: false });
    if (p === "profiles") return listProfiles(sp);
    if (seg[0] === "profiles" && seg.length === 2) return fx().profiles[seg[1]] ? { status: 200, body: clone(fx().profiles[seg[1]]) } : notFound();
    if (p === "analyses") return listAnalyses(sp);
    // Rapor üretimi (Word / PDF) demo hesabında kapalı.
    if (p === "analyses/report" || (seg[0] === "analyses" && seg[2] === "report")) return readonly();
    if (seg[0] === "analyses" && seg.length === 2) return fx().analyses[seg[1]] ? { status: 200, body: clone(fx().analyses[seg[1]]) } : notFound();
    if (p === "kb") return { status: 200, body: clone(fx().kb) };
    if (p === "clients/candidates") return { status: 200, body: clone(fx().emptyClientCandidates) };
    if (p === "horary/western/records") return { status: 200, body: clone(fx().emptyHoraryRecords) };
    if (seg[0] === "horary" && seg.includes("report")) return readonly();
    return notFound();
  }
  if (m === "POST") {
    if (p === "engine/plan") return engine("plan", body);
    if (p === "engine/view") return engine("view", body);
    if (p === "engine/run") return engine("run", body);
    if (p === "workspace") return workspace(body);
  }
  return readonly();
}
