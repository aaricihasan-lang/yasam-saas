/**
 * Yaşam Hafızası™ — Admin REPLAY isteği doğrulama (SAF; IO yok).
 * ====================================================================
 *
 * Historical replay (satış öncesi): aktivasyon öncesi hiç olay üretmemiş kayıtlar + kaçan silmeler
 * mevcut outbox → worker zincirinden geçirilir. Index'e DOĞRUDAN yazılmaz.
 *
 * Eylemler:
 *   - coverage : kaynak başına, gerçek tenant'lar için kaynak/uygun/index/eksik/bayat sayımı (salt-okunur)
 *   - enqueue  : (kaynak, tenant, mod) için bir sayfa replay olayı (cursor: afterId) — idempotent
 *   - drain    : bekleyen outbox olaylarını süre bütçesiyle işle (kaldığı yerden devam)
 *   - progress : kaynak/tenant için outbox durum × sonuç dağılımı (salt-okunur)
 *
 * Kaynak allowlist'i DB tarafındaki `yh_replay_source_spec` ile BİREBİR aynıdır (harness kanıtlar).
 * Numeroloji / Human Design / Kozmik / YEBS / danışan kaynakları KAPSAM DIŞI.
 */

export const YH_REPLAY_SOURCE_KEYS = [
  "dogaltas:stones",
  "dogaltas:minerals",
  "dogaltas:knowledge",
  "dogaltas:combinations",
  "refleksoloji:protocols",
  "sifa_rehberi:guides",
  "sifa_rehberi:guide-sections",
  "biyoenerji:subconscious-causes",
  "biyoenerji:symbols",
  "biyoenerji:chakras",
  "biyoenerji:imaginations",
  "biyoenerji:sessions",
  "biyoenerji:energy-bodies",
  "biyoenerji:chakra-blocks",
  "aromaterapi:oils",
  "aromaterapi:reference-sheets",
  "aromaterapi:reference-rows",
  "aromaterapi:blends",
  "aromaterapi:plant-taxa",
  "aromaterapi:preparations",
  "aromaterapi:method",
  "kupa_hacamat:knowledge",
  "kupa_hacamat:points",
  "kupa_hacamat:topics",
  "kupa_hacamat:techniques",
  "kupa_hacamat:safety-notes",
  "kisisel_arsiv:archives",
  "beslenme:foods",
  "beslenme:topics",
  "beslenme:templates",
] as const;
export type YhReplaySourceKey = (typeof YH_REPLAY_SOURCE_KEYS)[number];

export const YH_REPLAY_MODES = ["missing", "all", "orphans"] as const;
export type YhReplayMode = (typeof YH_REPLAY_MODES)[number];

/** Kullanıcısız legacy tenant'lar ve demo — RPC de reddeder; burada erken (ağ öncesi) red. */
export const YH_REPLAY_FORBIDDEN_TENANTS: readonly string[] = [
  "40f842a0-e3e8-448c-8971-9a938e1faccb", // demo
  "11111111-1111-1111-1111-111111111111", // kullanıcısız legacy tenant
];

export const YH_REPLAY_MAX_PAGE = 500;
export const YH_REPLAY_DRAIN_MAX_EVENTS = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidatedReplayRequest =
  | { readonly action: "coverage"; readonly sourceKey: YhReplaySourceKey }
  | {
      readonly action: "enqueue";
      readonly sourceKey: YhReplaySourceKey;
      readonly tenantId: string;
      readonly mode: YhReplayMode;
      readonly limit: number;
      readonly afterId: string | null;
    }
  | { readonly action: "drain"; readonly maxEvents: number }
  | { readonly action: "progress"; readonly sourceKey: YhReplaySourceKey | null; readonly tenantId: string | null };

export type ReplayValidation =
  | { readonly ok: true; readonly value: ValidatedReplayRequest }
  | { readonly ok: false; readonly code: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sourceKeyOf(v: unknown): YhReplaySourceKey | null {
  return typeof v === "string" && (YH_REPLAY_SOURCE_KEYS as readonly string[]).includes(v)
    ? (v as YhReplaySourceKey)
    : null;
}

function tenantOf(v: unknown): { ok: true; id: string } | { ok: false; code: string } {
  if (typeof v !== "string" || !UUID_RE.test(v)) return { ok: false, code: "invalid-tenant" };
  const id = v.toLowerCase();
  if (YH_REPLAY_FORBIDDEN_TENANTS.includes(id)) return { ok: false, code: "forbidden-tenant" };
  return { ok: true, id };
}

function intIn(v: unknown, min: number, max: number, dflt: number): number | null {
  if (v === undefined || v === null) return dflt;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return null;
  return v;
}

/** Ham JSON gövdesi → doğrulanmış istek (fail-closed; bilinmeyen alanlar yok sayılır). */
export function validateReplayRequest(raw: unknown): ReplayValidation {
  if (!isRecord(raw)) return { ok: false, code: "invalid-body" };
  const action = raw.action;

  if (action === "coverage") {
    const sourceKey = sourceKeyOf(raw.sourceKey);
    if (sourceKey === null) return { ok: false, code: "invalid-source" };
    return { ok: true, value: { action, sourceKey } };
  }

  if (action === "enqueue") {
    const sourceKey = sourceKeyOf(raw.sourceKey);
    if (sourceKey === null) return { ok: false, code: "invalid-source" };
    const t = tenantOf(raw.tenantId);
    if (!t.ok) return { ok: false, code: t.code };
    const mode = raw.mode;
    if (typeof mode !== "string" || !(YH_REPLAY_MODES as readonly string[]).includes(mode)) {
      return { ok: false, code: "invalid-mode" };
    }
    const limit = intIn(raw.limit, 1, YH_REPLAY_MAX_PAGE, 200);
    if (limit === null) return { ok: false, code: "invalid-limit" };
    let afterId: string | null = null;
    if (raw.afterId !== undefined && raw.afterId !== null) {
      if (typeof raw.afterId !== "string" || !UUID_RE.test(raw.afterId)) return { ok: false, code: "invalid-cursor" };
      afterId = raw.afterId.toLowerCase();
    }
    return { ok: true, value: { action, sourceKey, tenantId: t.id, mode: mode as YhReplayMode, limit, afterId } };
  }

  if (action === "drain") {
    const maxEvents = intIn(raw.maxEvents, 1, YH_REPLAY_DRAIN_MAX_EVENTS, 300);
    if (maxEvents === null) return { ok: false, code: "invalid-max-events" };
    return { ok: true, value: { action, maxEvents } };
  }

  if (action === "progress") {
    let sourceKey: YhReplaySourceKey | null = null;
    if (raw.sourceKey !== undefined && raw.sourceKey !== null) {
      sourceKey = sourceKeyOf(raw.sourceKey);
      if (sourceKey === null) return { ok: false, code: "invalid-source" };
    }
    let tenantId: string | null = null;
    if (raw.tenantId !== undefined && raw.tenantId !== null) {
      const t = tenantOf(raw.tenantId);
      if (!t.ok) return { ok: false, code: t.code };
      tenantId = t.id;
    }
    return { ok: true, value: { action, sourceKey, tenantId } };
  }

  return { ok: false, code: "invalid-action" };
}

/** Coverage satırı (RPC yanıtının güvenli sayısal biçimi). */
export interface ReplayCoverageRow {
  readonly tenantId: string;
  readonly sourceRows: number;
  readonly eligible: number;
  readonly indexed: number;
  readonly missing: number;
  readonly stale: number;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return 0;
}

/** RPC satırları → güvenli coverage satırları (yalnız id + sayılar; içerik yok). */
export function toCoverageRows(data: unknown): ReplayCoverageRow[] {
  if (!Array.isArray(data)) return [];
  const out: ReplayCoverageRow[] = [];
  for (const r of data) {
    if (!isRecord(r) || typeof r.tenant_id !== "string" || !UUID_RE.test(r.tenant_id)) continue;
    out.push({
      tenantId: r.tenant_id,
      sourceRows: num(r.source_rows),
      eligible: num(r.eligible),
      indexed: num(r.indexed),
      missing: num(r.missing),
      stale: num(r.stale),
    });
  }
  return out;
}
