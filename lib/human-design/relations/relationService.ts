// Human Design İLİŞKİ VE GRUP ANALİZLERİ — sunucu servisi (service_role + ZORUNLU tenant filtresi).
//
//   • 2 kişi → Connection (/human-design/connection) · 3–5 kişi → Penta (/human-design/penta).
//     Kişi sayısı uç noktayı belirler; iki sistemin sonuçları birbirine KARIŞTIRILMAZ.
//   • Katılımcı = bu tenant'ın HD danışan profili + o profilin KAYITLI, doğrulanmış Roxy BodyGraph
//     analizi. Doğum verisi istemciden ALINMAZ; analizin sunucuda çözülmüş girdisi (tarih, saat, IANA tz,
//     koordinat, nodeType) kullanılır ve danışanın GÜNCEL doğum tarihi/saati ile karşılaştırılır.
//   • Ücretli çağrı yalnız açık "oluştur" isteğinde: kayıtlı sonuç → Roxy ÇAĞRILMAZ; eşzamanlı
//     aynı istek kilidi; kullanıcı/tenant limitleri BodyGraph ile ORTAK kotadan.
//   • Roxy yanıtı şemaya + kayıtlı bireysel haritalara göre doğrulanmadan KAYDEDİLMEZ.
//   • Analiz silme yalnız analiz + katılımcı bağlarını siler; danışan / BodyGraph analizi silinmez.

import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant, tenantInsertPayload } from "../api/tenantScope";
import { deterministicUuid, isUniqueViolation, isUuid } from "../api/deterministicId";
import { hdSafeDbError } from "../api/safeError";
import { isValidIanaTimeZone, toHms } from "../api/birthTimeResolution";
import { normalizeHdPersonName } from "../api/hdIdentity";
import { readChartIdSecret } from "../api/roxyChartService";
import {
  ROXY_CONNECTION_ADAPTER_VERSION,
  ROXY_CONNECTION_ENDPOINT,
  ROXY_PENTA_ADAPTER_VERSION,
  ROXY_PENTA_ENDPOINT,
  ROXY_POLICY,
  ROXY_PROVIDER_ID,
  ROXY_RATE_LIMITS,
  type RoxyPolicy,
  type RoxyServerConfig,
} from "../providers/roxy/config";
import type { RoxyCallResult } from "../providers/roxy/client";
import type { RoxyBirthMoment, RoxyConnectionRequest, RoxyPentaRequest } from "../providers/roxy/relationClient";
import { completeActivationGates } from "../chart/centerStates";
import { computedChartAppCodes, type HdComputedChart } from "../chart/computedChart";
import { checkConnectionConsistency, expectedConnection, validateRoxyConnection, type HdConnectionResult } from "./connection";
import { checkPentaConsistency, PENTA_MAX_MEMBERS, PENTA_MIN_MEMBERS, validateRoxyPenta, type HdPentaResult } from "./penta";
import type { HdCenterCode } from "../types";

export const RELATION_ANALYSES = "human_design_relation_analyses";
export const RELATION_PARTICIPANTS = "human_design_relation_participants";

export type RelationKind = "connection" | "penta";
export const RELATION_TYPES = ["partner", "spouse", "mother_child", "father_child", "friends", "business", "family", "team", "other"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export function relationKindForCount(n: number): RelationKind | null {
  if (n === 2) return "connection";
  if (n >= PENTA_MIN_MEMBERS && n <= PENTA_MAX_MEMBERS) return "penta";
  return null;
}

export type RelationServiceDeps = {
  config: RoxyServerConfig | null;
  callConnection: (config: RoxyServerConfig, body: RoxyConnectionRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  callPenta: (config: RoxyServerConfig, body: RoxyPentaRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  sleep?: (ms: number) => Promise<void>;
  policy?: RoxyPolicy;
  log?: (msg: string, detail?: unknown) => void;
  idSecret?: string | null;
};

export type RelationCtx = { db: SupabaseClient; tenantId: string; userId: string; isDemo: boolean };

type Body =
  | { ok: true; id: string; reused: boolean; kind: RelationKind }
  | { ok: false; code: string; error: string; retryAfterSec?: number; participant?: string };
export type RelationServiceResponse = { status: number; body: Body };

const fail = (status: number, code: string, error: string, extra: { retryAfterSec?: number; participant?: string } = {}): RelationServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

/** Tablo/kolon yok → migration henüz uygulanmamış (Roxy ÇAĞRILMADAN 503). */
export function isRelationTableMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" || err.code === "PGRST205" || err.code === "42703" || err.code === "PGRST204" ||
    /relation .* does not exist|Could not find the table|column .* does not exist/i.test(err.message ?? "")
  );
}

export const RELATIONS_UNAVAILABLE = fail(
  503,
  "RELATIONS_UNAVAILABLE",
  "İlişki ve Grup Analizleri henüz etkin değil. Bireysel Human Design analizleriniz etkilenmez.",
);

const PROVIDER_ERRORS: Record<string, RelationServiceResponse> = {
  timeout: fail(504, "PROVIDER_TIMEOUT", "Hesaplama servisi zamanında yanıt vermedi. Lütfen birazdan tekrar deneyin."),
  network: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisine şu anda ulaşılamıyor. Lütfen birazdan tekrar deneyin."),
  unauthorized: fail(502, "PROVIDER_CONFIG", "Hesaplama servisi yapılandırma hatası. Lütfen yöneticiye bildirin."),
  rate_limited: fail(503, "PROVIDER_BUSY", "Hesaplama servisi şu anda yoğun. Lütfen birkaç dakika sonra tekrar deneyin."),
  bad_request: fail(422, "PROVIDER_REJECTED", "Hesaplama servisi katılımcıların doğum bilgilerini kabul etmedi. Bilgileri kontrol edin."),
  server_error: fail(502, "PROVIDER_UNAVAILABLE", "Hesaplama servisinde geçici bir hata oluştu. Lütfen birazdan tekrar deneyin."),
  malformed_json: fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden geçersiz yanıt alındı. Sonuç kaydedilmedi."),
};

type ClientRow = { id: string; name: string; birth_date: string | null; birth_time: string | null };
type ChartRow = {
  id: string;
  client_id: string | null;
  source: string | null;
  provider: string | null;
  input: unknown;
  input_hash: string | null;
  computed_result: unknown;
  birth_place: string | null;
  created_at: string | null;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Kayıtlı Roxy analizinin hesap girdisi (sunucuda çözülmüş). Geçersizse null. */
export function chartBirthMoment(input: unknown): RoxyBirthMoment | null {
  if (!isObj(input)) return null;
  const { date, time, timezone, latitude, longitude, nodeType } = input;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof time !== "string" || toHms(time) !== time) return null;
  if (typeof timezone !== "string" || !isValidIanaTimeZone(timezone)) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (nodeType !== "true" && nodeType !== "mean") return null;
  return { date, time, timezone, latitude, longitude, nodeType };
}

/** Kayıtlı analizin girdisi danışanın GÜNCEL doğum tarihi/saatiyle aynı mı? */
export function chartMatchesClient(m: RoxyBirthMoment, c: { birth_date: string | null; birth_time: string | null }): boolean {
  const d = (c.birth_date ?? "").slice(0, 10);
  const t = c.birth_time ? toHms(c.birth_time) : null;
  return d === m.date && t === m.time;
}

/** Katılımcının kayıtlı haritasından aktif kapılar + tanımlı merkezler (tam 26 aktivasyon zorunlu). */
export function participantChartFacts(computed: unknown): { gates: number[]; defined: HdCenterCode[] } | null {
  if (!isObj(computed)) return null;
  const gates = completeActivationGates(computed.activations);
  if (!gates) return null;
  const codes = computedChartAppCodes(computed as unknown as HdComputedChart);
  return { gates, defined: codes.active_centers };
}

/** Idempotency anahtarı: tür + uç + adaptör + tenant + politika + katılımcı kümesi (sırasız) ve kaynak girdileri. */
export function relationInputHash(
  kind: RelationKind,
  tenantId: string,
  policy: { nodeType: string; lang: string },
  parts: ReadonlyArray<{ clientId: string; moment: RoxyBirthMoment }>,
  secret: string | null,
): string {
  const members = [...parts]
    .map((p) => [p.clientId, p.moment.date, p.moment.time, p.moment.timezone, p.moment.latitude.toFixed(6), p.moment.longitude.toFixed(6), p.moment.nodeType])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const canonical = JSON.stringify([
    ROXY_PROVIDER_ID,
    kind === "connection" ? ROXY_CONNECTION_ENDPOINT : ROXY_PENTA_ENDPOINT,
    kind === "connection" ? ROXY_CONNECTION_ADAPTER_VERSION : ROXY_PENTA_ADAPTER_VERSION,
    tenantId,
    policy.nodeType,
    policy.lang,
    members,
  ]);
  const plain = createHash("sha256").update(canonical, "utf8").digest("hex");
  return secret ? createHmac("sha256", `hd-relation-id:v1:${secret}`).update(plain, "utf8").digest("hex") : plain;
}

export function relationIdFor(tenantId: string, inputHash: string): string {
  return deterministicUuid("hd-relation-k1", tenantId, inputHash);
}

async function findExisting(ctx: RelationCtx, id: string): Promise<{ found: boolean; kind?: RelationKind; error?: RelationServiceResponse }> {
  const { data, error } = await withTenant(ctx.db.from(RELATION_ANALYSES).select("id, kind"), ctx.tenantId, "relation.find").eq("id", id).maybeSingle();
  if (error) return { found: false, error: isRelationTableMissing(error) ? RELATIONS_UNAVAILABLE : fail(500, "DB_ERROR", hdSafeDbError("relation.find", error)) };
  return data ? { found: true, kind: (data as { kind: RelationKind }).kind } : { found: false };
}

/** Yeni ilişki/grup analizi (ya da kayıtlı sonucun yeniden kullanımı). */
export async function createRelationAnalysis(ctx: RelationCtx, rawBody: unknown, deps: RelationServiceDeps): Promise<RelationServiceResponse> {
  const policy = deps.policy ?? ROXY_POLICY;
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (ctx.isDemo) return fail(403, "DEMO_READONLY", "Demo hesabında ilişki/grup analizi oluşturulamaz.");
  if (!isObj(rawBody)) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");

  // 1) Katılımcılar — yalnız kimlikler (doğum verisi istemciden ALINMAZ).
  const rawParts = rawBody.participants;
  if (!Array.isArray(rawParts)) return fail(400, "INVALID_PARTICIPANTS", "Katılımcı listesi gerekli.");
  const kind = relationKindForCount(rawParts.length);
  if (!kind) return fail(422, "PARTICIPANT_COUNT", "İlişki analizi için 2, grup analizi (Penta) için 3–5 kişi seçilmelidir.");
  const parts: Array<{ clientId: string; chartId: string }> = [];
  for (const p of rawParts) {
    if (!isObj(p) || typeof p.client_id !== "string" || typeof p.chart_id !== "string" || !isUuid(p.client_id.trim()) || !isUuid(p.chart_id.trim())) {
      return fail(400, "INVALID_PARTICIPANTS", "Her katılımcı için geçerli danışan ve analiz seçilmelidir.");
    }
    parts.push({ clientId: p.client_id.trim().toLowerCase(), chartId: p.chart_id.trim().toLowerCase() });
  }
  if (new Set(parts.map((p) => p.clientId)).size !== parts.length) {
    return fail(422, "DUPLICATE_PARTICIPANT", "Aynı danışan bir analizde birden fazla kez seçilemez.");
  }
  if (new Set(parts.map((p) => p.chartId)).size !== parts.length) {
    return fail(422, "DUPLICATE_PARTICIPANT", "Aynı Human Design analizi birden fazla katılımcı için kullanılamaz.");
  }
  let relationType: RelationType | null = null;
  if (rawBody.relation_type !== undefined && rawBody.relation_type !== null && rawBody.relation_type !== "") {
    if (!RELATION_TYPES.includes(rawBody.relation_type as RelationType)) return fail(400, "INVALID_RELATION_TYPE", "Geçersiz ilişki türü.");
    relationType = rawBody.relation_type as RelationType;
  }

  // 2) Danışanlar ve kayıtlı analizler — YALNIZ bu tenant (başka uzmanın kaydı 404).
  const clientIds = parts.map((p) => p.clientId);
  const { data: cRows, error: cErr } = await withTenant(ctx.db.from("human_design_clients").select("id, name, birth_date, birth_time"), ctx.tenantId, "relation.clients").in("id", clientIds);
  if (cErr) return fail(500, "DB_ERROR", hdSafeDbError("relation.clients", cErr));
  const clients = new Map(((cRows ?? []) as ClientRow[]).map((c) => [c.id.toLowerCase(), c]));
  if (clients.size !== parts.length) return fail(404, "CLIENT_NOT_FOUND", "Seçilen danışanlardan biri bulunamadı veya bu hesaba ait değil.");
  const { data: hRows, error: hErr } = await withTenant(
    ctx.db.from("human_design_charts").select("id, client_id, source, provider, input, input_hash, computed_result, birth_place, created_at"),
    ctx.tenantId,
    "relation.charts",
  ).in("id", parts.map((p) => p.chartId));
  if (hErr) return fail(500, "DB_ERROR", hdSafeDbError("relation.charts", hErr));
  const charts = new Map(((hRows ?? []) as ChartRow[]).map((c) => [c.id.toLowerCase(), c]));

  const members: Array<{ clientId: string; chartId: string; name: string; moment: RoxyBirthMoment; chartInputHash: string | null; facts: { gates: number[]; defined: HdCenterCode[] } }> = [];
  for (const p of parts) {
    const c = clients.get(p.clientId)!;
    const ch = charts.get(p.chartId);
    if (!ch || (ch.client_id ?? "").toLowerCase() !== p.clientId) {
      return fail(404, "CHART_NOT_FOUND", `${c.name}: seçilen Human Design analizi bulunamadı veya bu danışana ait değil.`, { participant: c.name });
    }
    if (ch.source !== "computed" || ch.provider !== ROXY_PROVIDER_ID) {
      return fail(422, "CHART_NOT_ELIGIBLE", `${c.name}: ilişki/grup analizi için otomatik (RoxyAPI) BodyGraph analizi gereklidir.`, { participant: c.name });
    }
    const moment = chartBirthMoment(ch.input);
    const facts = participantChartFacts(ch.computed_result);
    if (!moment || !facts) {
      return fail(422, "CHART_INCOMPLETE", `${c.name}: kayıtlı analizin doğum/hesap bilgisi eksik. Önce bireysel analizi yeniden oluşturun.`, { participant: c.name });
    }
    if (!chartMatchesClient(moment, c)) {
      return fail(409, "BIRTH_DATA_CHANGED", `${c.name}: danışanın doğum bilgisi bu analiz hazırlandıktan sonra değişmiş. Önce güncel bilgilerle bireysel analizi oluşturun.`, { participant: c.name });
    }
    if (moment.nodeType !== policy.nodeType) {
      return fail(422, "CHART_POLICY_MISMATCH", `${c.name}: analiz farklı bir ay düğümü ayarıyla hazırlanmış. Güncel ayarla bireysel analizi yeniden oluşturun.`, { participant: c.name });
    }
    members.push({ clientId: p.clientId, chartId: p.chartId, name: c.name, moment, chartInputHash: ch.input_hash, facts });
  }
  // Aynı kişi (farklı profil, aynı ad + aynı doğum anı) iki kez seçilemez.
  const personKeys = members.map((m) => JSON.stringify([normalizeHdPersonName(m.name), m.moment.date, m.moment.time, m.moment.timezone]));
  if (new Set(personKeys).size !== personKeys.length) {
    return fail(422, "SAME_PERSON", "Aynı kişi farklı profillerle iki kez seçilmiş görünüyor. Lütfen farklı kişiler seçin.");
  }

  // 3) Idempotency — kayıtlı sonuç varsa Roxy ÇAĞRILMAZ.
  const secret = deps.idSecret !== undefined ? deps.idSecret : readChartIdSecret();
  const inputHash = relationInputHash(kind, ctx.tenantId, policy, members, secret);
  const id = relationIdFor(ctx.tenantId, inputHash);
  const existing = await findExisting(ctx, id);
  if (existing.error) return existing.error;
  if (existing.found) return { status: 200, body: { ok: true, id, reused: true, kind } };

  if (!deps.config) return fail(503, "AUTO_CALC_NOT_CONFIGURED", "Otomatik hesaplama şu anda yapılandırılmamış.");

  // 4) Eşzamanlı aynı istek kilidi (çift tık / yeniden gönderim / çoklu sekme).
  const claim = await deps.rateLimit("hd-roxy-relation-inflight", inputHash, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    for (let i = 0; i < 8; i++) {
      await sleep(1500);
      const again = await findExisting(ctx, id);
      if (again.error) return again.error;
      if (again.found) return { status: 200, body: { ok: true, id, reused: true, kind } };
    }
    return fail(409, "IN_PROGRESS", "Bu analiz şu anda hazırlanıyor. Birkaç saniye sonra tekrar deneyin.", { retryAfterSec: claim.retryAfterSec || 10 });
  }

  // 5) Ücretli çağrı limitleri (BodyGraph ile ORTAK kota).
  const userRl = await deps.rateLimit("hd-roxy-user", ctx.userId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
  if (!userRl.allowed) return fail(429, "RATE_LIMITED", "Kısa sürede çok fazla otomatik hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", { retryAfterSec: userRl.retryAfterSec });
  const tenantRl = await deps.rateLimit("hd-roxy-tenant", ctx.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
  if (!tenantRl.allowed) return fail(429, "RATE_LIMITED", "Hesabınızın günlük otomatik hesaplama sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", { retryAfterSec: tenantRl.retryAfterSec });

  // 6) Roxy → şema → kayıtlı haritalarla tutarlılık.
  const opts = { lang: policy.lang, timeoutMs: policy.timeoutMs };
  let result: HdConnectionResult | HdPentaResult;
  let raw: unknown;
  if (kind === "connection") {
    const call = await deps.callConnection(deps.config, { personA: members[0].moment, personB: members[1].moment }, opts);
    if (!call.ok) {
      log("[hd-relation] connection call failed", { kind: call.kind, status: call.status });
      return PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error;
    }
    const v = validateRoxyConnection(call.raw);
    if (!v.ok) {
      log("[hd-relation] connection schema mismatch", { errors: v.errors.slice(0, 10) });
      return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.");
    }
    const errs = checkConnectionConsistency(v.value, expectedConnection(members[0].facts.gates, members[1].facts.gates, members[0].facts.defined, members[1].facts.defined));
    if (errs.length > 0) {
      log("[hd-relation] connection inconsistent", { errors: errs.slice(0, 10) });
      return fail(502, "PROVIDER_INCONSISTENT", "İlişki sonucu katılımcıların kayıtlı Human Design analizleriyle uyuşmadı. Yanlış sonuç kaydedilmedi; lütfen yöneticiye bildirin.");
    }
    result = v.value;
    raw = call.raw;
  } else {
    const call = await deps.callPenta(deps.config, { members: members.map((m) => m.moment) }, opts);
    if (!call.ok) {
      log("[hd-relation] penta call failed", { kind: call.kind, status: call.status });
      return PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error;
    }
    const v = validateRoxyPenta(call.raw, members.length);
    if (!v.ok) {
      log("[hd-relation] penta schema mismatch", { errors: v.errors.slice(0, 10) });
      return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.");
    }
    const errs = checkPentaConsistency(v.value, members.map((m) => m.facts.gates));
    if (errs.length > 0) {
      log("[hd-relation] penta inconsistent", { errors: errs.slice(0, 10) });
      return fail(502, "PROVIDER_INCONSISTENT", "Grup sonucu katılımcıların kayıtlı Human Design analizleriyle uyuşmadı. Yanlış sonuç kaydedilmedi; lütfen yöneticiye bildirin.");
    }
    result = v.value;
    raw = call.raw;
  }

  // 7) Kayıt: analiz → katılımcılar (katılımcı yazılamazsa analiz geri alınır; yarım kayıt kalmaz).
  const { error: insErr } = await ctx.db.from(RELATION_ANALYSES).insert(
    tenantInsertPayload(ctx.tenantId, {
      id,
      user_id: ctx.userId,
      kind,
      member_count: members.length,
      relation_type: relationType,
      provider: ROXY_PROVIDER_ID,
      endpoint: kind === "connection" ? ROXY_CONNECTION_ENDPOINT : ROXY_PENTA_ENDPOINT,
      adapter_version: kind === "connection" ? ROXY_CONNECTION_ADAPTER_VERSION : ROXY_PENTA_ADAPTER_VERSION,
      node_type: policy.nodeType,
      lang: policy.lang,
      input_hash: inputHash,
      result,
      provider_raw: raw,
    }),
  ).select("id").single();
  if (insErr) {
    if (isUniqueViolation(insErr)) return { status: 200, body: { ok: true, id, reused: true, kind } };
    if (isRelationTableMissing(insErr)) return RELATIONS_UNAVAILABLE;
    return fail(500, "DB_INSERT_FAILED", hdSafeDbError("relation.insert", insErr));
  }
  const { error: pErr } = await ctx.db.from(RELATION_PARTICIPANTS).insert(
    members.map((m, position) =>
      tenantInsertPayload(ctx.tenantId, {
        analysis_id: id,
        position,
        client_id: m.clientId,
        client_name: m.name,
        source_chart_id: m.chartId,
        source_input_hash: m.chartInputHash,
      }),
    ),
  );
  if (pErr) {
    await withTenant(ctx.db.from(RELATION_ANALYSES).delete(), ctx.tenantId, "relation.rollback").eq("id", id);
    return fail(500, "DB_INSERT_FAILED", hdSafeDbError("relation.participants", pErr));
  }
  return { status: 200, body: { ok: true, id, reused: false, kind } };
}

// ─── Okuma / liste / silme ───────────────────────────────────────────────────

export type RelationParticipantView = {
  position: number;
  clientId: string | null;
  name: string;
  sourceChartId: string | null;
  /** Tarihsel nitelik: kaynak analiz silinmiş / danışan doğum bilgisi değişmiş / profil silinmiş. */
  status: "current" | "birth_data_changed" | "source_chart_deleted" | "client_deleted";
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  /**
   * Birleşik harita için katılımcının KAYITLI bireysel aktif kapıları (analizde kullanılan kaynak analiz
   * hâlâ aynıysa: kimlik + girdi kimliği eşleşir). Kaynak silinmiş/değişmişse null → güvenli yedek şema.
   */
  gates: number[] | null;
};

export type RelationAnalysisView = {
  id: string;
  kind: RelationKind;
  memberCount: number;
  relationType: RelationType | null;
  createdAt: string;
  // Sağlayıcı meta verisi (sağlayıcı adı / uç / adaptör / nodeType) bilerek GÖRÜNÜMDE YOK: kullanıcıya ve
  // rapora gitmez; DB satırında denetim kaydı olarak kalır.
  participants: RelationParticipantView[];
  result: HdConnectionResult | HdPentaResult;
};

type AnalysisRow = {
  id: string;
  kind: RelationKind;
  member_count: number;
  relation_type: RelationType | null;
  created_at: string;
  provider: string;
  endpoint: string;
  adapter_version: string;
  node_type: string;
  lang: string;
  result: unknown;
};
type ParticipantRow = { analysis_id: string; position: number; client_id: string | null; client_name: string; source_chart_id: string | null; source_input_hash: string | null };

export async function getRelationAnalysis(ctx: RelationCtx, id: string): Promise<{ status: number; body: { ok: true; analysis: RelationAnalysisView } | { ok: false; code: string; error: string } }> {
  if (!isUuid(id)) return { status: 400, body: { ok: false, code: "INVALID_ID", error: "Geçersiz analiz kimliği." } };
  // provider_raw OKUNMAZ (istemciye/rapora gitmez).
  const { data, error } = await withTenant(
    ctx.db.from(RELATION_ANALYSES).select("id, kind, member_count, relation_type, created_at, provider, endpoint, adapter_version, node_type, lang, result"),
    ctx.tenantId,
    "relation.get",
  ).eq("id", id).maybeSingle();
  if (error) {
    if (isRelationTableMissing(error)) return { status: 503, body: { ok: false, code: "RELATIONS_UNAVAILABLE", error: (RELATIONS_UNAVAILABLE.body as { error: string }).error } };
    return { status: 500, body: { ok: false, code: "DB_ERROR", error: hdSafeDbError("relation.get", error) } };
  }
  if (!data) return { status: 404, body: { ok: false, code: "NOT_FOUND", error: "Analiz bulunamadı." } };
  const a = data as AnalysisRow;
  const { data: pRows, error: pErr } = await withTenant(
    ctx.db.from(RELATION_PARTICIPANTS).select("analysis_id, position, client_id, client_name, source_chart_id, source_input_hash"),
    ctx.tenantId,
    "relation.participants",
  ).eq("analysis_id", id).order("position", { ascending: true });
  if (pErr) return { status: 500, body: { ok: false, code: "DB_ERROR", error: hdSafeDbError("relation.participants", pErr) } };
  const ps = (pRows ?? []) as ParticipantRow[];
  if (ps.length !== a.member_count) return { status: 409, body: { ok: false, code: "INCOMPLETE", error: "Analiz kaydı eksik; lütfen yeniden oluşturun." } };
  const participants = await participantViews(ctx, ps);
  return {
    status: 200,
    body: {
      ok: true,
      analysis: {
        id: a.id,
        kind: a.kind,
        memberCount: a.member_count,
        relationType: a.relation_type,
        createdAt: a.created_at,
        participants,
        result: a.result as HdConnectionResult | HdPentaResult,
      },
    },
  };
}

async function participantViews(ctx: RelationCtx, ps: ParticipantRow[]): Promise<RelationParticipantView[]> {
  const cIds = ps.map((p) => p.client_id).filter((x): x is string => !!x);
  const hIds = ps.map((p) => p.source_chart_id).filter((x): x is string => !!x);
  const clients = new Map<string, ClientRow>();
  const charts = new Map<string, ChartRow>();
  if (cIds.length) {
    const { data } = await withTenant(ctx.db.from("human_design_clients").select("id, name, birth_date, birth_time"), ctx.tenantId, "relation.view.clients").in("id", cIds);
    for (const c of (data ?? []) as ClientRow[]) clients.set(c.id.toLowerCase(), c);
  }
  if (hIds.length) {
    const { data } = await withTenant(ctx.db.from("human_design_charts").select("id, client_id, source, provider, input, input_hash, computed_result, birth_place, created_at"), ctx.tenantId, "relation.view.charts").in("id", hIds);
    for (const c of (data ?? []) as ChartRow[]) charts.set(c.id.toLowerCase(), c);
  }
  return ps.map((p) => {
    const c = p.client_id ? clients.get(p.client_id.toLowerCase()) : undefined;
    const h = p.source_chart_id ? charts.get(p.source_chart_id.toLowerCase()) : undefined;
    const m = h ? chartBirthMoment(h.input) : null;
    let status: RelationParticipantView["status"] = "current";
    if (!c) status = "client_deleted";
    else if (!h || !m || (p.source_input_hash && h.input_hash !== p.source_input_hash)) status = "source_chart_deleted";
    else if (!chartMatchesClient(m, c)) status = "birth_data_changed";
    // Kaynak analiz analizdeki ile AYNI ise (kimlik + girdi kimliği) kapılar kullanılabilir.
    const sameSource = !!h && (!p.source_input_hash || h.input_hash === p.source_input_hash);
    const facts = sameSource ? participantChartFacts(h!.computed_result) : null;
    return {
      position: p.position,
      clientId: p.client_id,
      name: p.client_name,
      sourceChartId: p.source_chart_id,
      status,
      birthDate: m?.date ?? null,
      birthTime: m?.time ? m.time.slice(0, 5) : null,
      birthPlace: h?.birth_place ?? null,
      gates: facts ? facts.gates : null,
    };
  });
}

export type RelationListRow = { id: string; kind: RelationKind; memberCount: number; relationType: RelationType | null; createdAt: string; names: string[] };

export async function listRelationAnalyses(ctx: RelationCtx, opts: { clientId?: string | null } = {}): Promise<{ ok: true; rows: RelationListRow[] } | { ok: false; status: number; code: string; error: string }> {
  let ids: string[] | null = null;
  if (opts.clientId) {
    if (!isUuid(opts.clientId)) return { ok: false, status: 400, code: "INVALID_ID", error: "Geçersiz danışan." };
    const { data, error } = await withTenant(ctx.db.from(RELATION_PARTICIPANTS).select("analysis_id"), ctx.tenantId, "relation.list.byClient").eq("client_id", opts.clientId);
    if (error) return isRelationTableMissing(error) ? { ok: false, status: 503, code: "RELATIONS_UNAVAILABLE", error: (RELATIONS_UNAVAILABLE.body as { error: string }).error } : { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("relation.list", error) };
    ids = [...new Set(((data ?? []) as Array<{ analysis_id: string }>).map((r) => r.analysis_id))];
    if (ids.length === 0) return { ok: true, rows: [] };
  }
  let q = withTenant(ctx.db.from(RELATION_ANALYSES).select("id, kind, member_count, relation_type, created_at"), ctx.tenantId, "relation.list");
  if (ids) q = q.in("id", ids);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return isRelationTableMissing(error) ? { ok: false, status: 503, code: "RELATIONS_UNAVAILABLE", error: (RELATIONS_UNAVAILABLE.body as { error: string }).error } : { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("relation.list", error) };
  const rows = (data ?? []) as Array<Pick<AnalysisRow, "id" | "kind" | "member_count" | "relation_type" | "created_at">>;
  if (rows.length === 0) return { ok: true, rows: [] };
  const { data: pData, error: pErr } = await withTenant(ctx.db.from(RELATION_PARTICIPANTS).select("analysis_id, position, client_name"), ctx.tenantId, "relation.list.names").in("analysis_id", rows.map((r) => r.id));
  if (pErr) return { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("relation.list.names", pErr) };
  const byA = new Map<string, Array<{ position: number; client_name: string }>>();
  for (const p of (pData ?? []) as Array<{ analysis_id: string; position: number; client_name: string }>) {
    byA.set(p.analysis_id, [...(byA.get(p.analysis_id) ?? []), p]);
  }
  return {
    ok: true,
    rows: rows
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        memberCount: r.member_count,
        relationType: r.relation_type,
        createdAt: r.created_at,
        names: (byA.get(r.id) ?? []).sort((a, b) => a.position - b.position).map((p) => p.client_name),
      }))
      .filter((r) => r.names.length === r.memberCount), // yarım kayıt listelenmez
  };
}

export async function deleteRelationAnalysis(ctx: RelationCtx, id: string): Promise<{ status: number; body: { ok: true } | { ok: false; code: string; error: string } }> {
  if (ctx.isDemo) return { status: 403, body: { ok: false, code: "DEMO_READONLY", error: "Demo hesabında silme yapılamaz." } };
  if (!isUuid(id)) return { status: 400, body: { ok: false, code: "INVALID_ID", error: "Geçersiz analiz kimliği." } };
  // YALNIZ analiz satırı (+ cascade katılımcı bağları). Danışan / BodyGraph analizi silinmez.
  const { data, error } = await withTenant(ctx.db.from(RELATION_ANALYSES).delete(), ctx.tenantId, "relation.delete").eq("id", id).select("id");
  if (error) {
    if (isRelationTableMissing(error)) return { status: 503, body: { ok: false, code: "RELATIONS_UNAVAILABLE", error: (RELATIONS_UNAVAILABLE.body as { error: string }).error } };
    return { status: 500, body: { ok: false, code: "DB_ERROR", error: hdSafeDbError("relation.delete", error) } };
  }
  if (!data || (data as unknown[]).length === 0) return { status: 404, body: { ok: false, code: "NOT_FOUND", error: "Analiz bulunamadı." } };
  return { status: 200, body: { ok: true } };
}

// ─── Katılımcı adayları (danışan seçimi) ─────────────────────────────────────

export type RelationCandidate = {
  clientId: string;
  name: string;
  birthDate: string | null;
  birthTime: string | null;
  /** Uygun (otomatik, tam, güncel) BodyGraph analizi; yoksa null + neden. */
  chart: { id: string; birthPlace: string | null; createdAt: string | null } | null;
  reason: null | "no_auto_chart" | "birth_data_changed" | "chart_incomplete";
};

/** Bu tenant'ın HD danışanları + her biri için kullanılabilir en güncel Roxy analizi (Roxy çağrısı YOK). */
export async function listRelationCandidates(ctx: RelationCtx, policy: RoxyPolicy = ROXY_POLICY): Promise<{ ok: true; rows: RelationCandidate[] } | { ok: false; status: number; code: string; error: string }> {
  const { data: cData, error: cErr } = await withTenant(ctx.db.from("human_design_clients").select("id, name, birth_date, birth_time"), ctx.tenantId, "relation.cand.clients").order("name", { ascending: true }).limit(2000);
  if (cErr) return { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("relation.cand.clients", cErr) };
  const clients = (cData ?? []) as ClientRow[];
  if (clients.length === 0) return { ok: true, rows: [] };
  // 1. geçiş: yalnız hafif kolonlar (hesap sonucu OKUNMAZ).
  const { data: hData, error: hErr } = await withTenant(
    ctx.db.from("human_design_charts").select("id, client_id, input, birth_place, created_at"),
    ctx.tenantId,
    "relation.cand.charts",
  ).eq("source", "computed").eq("provider", ROXY_PROVIDER_ID).order("created_at", { ascending: false }).limit(5000);
  if (hErr) return { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("relation.cand.charts", hErr) };
  const byClient = new Map<string, Array<Pick<ChartRow, "id" | "input" | "birth_place" | "created_at">>>();
  for (const h of (hData ?? []) as ChartRow[]) {
    if (!h.client_id) continue;
    const k = h.client_id.toLowerCase();
    byClient.set(k, [...(byClient.get(k) ?? []), h]);
  }
  const hhmm = (t: string | null) => (t ? (toHms(t) ?? "").slice(0, 5) || null : null);
  const picked = new Map<string, Pick<ChartRow, "id" | "birth_place" | "created_at">>();
  const reasons = new Map<string, RelationCandidate["reason"]>();
  for (const c of clients) {
    const list = byClient.get(c.id.toLowerCase()) ?? [];
    const valid = list.filter((h) => {
      const m = chartBirthMoment(h.input);
      return !!m && m.nodeType === policy.nodeType;
    });
    const current = valid.find((h) => chartMatchesClient(chartBirthMoment(h.input)!, c));
    if (current) picked.set(c.id, current);
    else reasons.set(c.id, list.length === 0 ? "no_auto_chart" : valid.length > 0 ? "birth_data_changed" : "chart_incomplete");
  }
  // 2. geçiş: yalnız seçilen analizlerin tam 26 aktivasyonu doğrulanır.
  const ids = [...picked.values()].map((h) => h.id);
  const complete = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await withTenant(ctx.db.from("human_design_charts").select("id, computed_result"), ctx.tenantId, "relation.cand.facts").in("id", ids.slice(i, i + 200));
    if (error) return { ok: false, status: 500, code: "DB_ERROR", error: hdSafeDbError("relation.cand.facts", error) };
    for (const r of (data ?? []) as Array<{ id: string; computed_result: unknown }>) if (participantChartFacts(r.computed_result)) complete.add(r.id);
  }
  return {
    ok: true,
    rows: clients.map((c) => {
      const h = picked.get(c.id);
      const usable = !!h && complete.has(h.id);
      return {
        clientId: c.id,
        name: c.name,
        birthDate: c.birth_date ? c.birth_date.slice(0, 10) : null,
        birthTime: hhmm(c.birth_time),
        chart: usable ? { id: h!.id, birthPlace: h!.birth_place, createdAt: h!.created_at } : null,
        reason: usable ? null : h ? "chart_incomplete" : reasons.get(c.id) ?? "no_auto_chart",
      };
    }),
  };
}
