import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  createClaim,
  resolveActorLabel,
  CLAIM_ERROR_HTTP,
  type CreateClaimInput,
} from "@/lib/aromaterapi/service/claimMutations";
import { parseListParams, isUuid } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readListOk, readServerError } from "@/lib/aromaterapi/service/readErrors";
import {
  listKnowledgeRecords,
  isSafetyTopic,
  CLAIM_TYPES,
  CLAIM_STATUS,
  EVIDENCE_LAYERS,
  RATIONALE_STATUS,
} from "@/lib/aromaterapi/service/claimReads";

export const runtime = "nodejs";

/**
 * GET /api/aromaterapi/claims — Bilgi Kayıtları (claims) tenant-scoped listesi.
 * C3C read: mutation YAPMAZ; POST (aşağıda, C2T) sözleşmesine dokunmaz. Güvenlik
 * (Bölüm 9): tenantId oturumdan; claim_type=safety + safety_topic + evidence
 * filtreleriyle güvenlik görünümü. Kullanıcıya "claim" terimi gösterilmez.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);

  // preparation_id — opsiyonel UUID filtresi.
  const prepRaw = url.searchParams.get("preparation_id");
  let preparationId: string | undefined;
  if (prepRaw !== null && prepRaw !== "") {
    if (!isUuid(prepRaw)) return readFail("AROMA_INVALID_UUID");
    preparationId = prepRaw;
  }

  // safety_topic — dinamik (allowlist değil); yalnız biçim doğrulaması.
  const topicRaw = url.searchParams.get("safety_topic");
  let safetyTopic: string | undefined;
  if (topicRaw !== null && topicRaw !== "") {
    const t = topicRaw.trim();
    if (t.length > 128 || !isSafetyTopic(t)) return readFail("AROMA_INVALID_FILTER");
    safetyTopic = t;
  }

  const parsed = parseListParams(url.searchParams, {
    sorts: {
      updated: { column: "updated_at", ascending: false },
      created: { column: "created_at", ascending: false },
      type: { column: "claim_type", ascending: true },
    },
    filters: {
      claim_type: { column: "claim_type", allow: CLAIM_TYPES },
      status: { column: "status", allow: CLAIM_STATUS },
      evidence_layer: { column: "evidence_layer", allow: EVIDENCE_LAYERS },
      rationale_status: { column: "rationale_status", allow: RATIONALE_STATUS },
    },
  });
  if (!parsed.ok) return readFail(parsed.code);

  try {
    const { rows, total } = await listKnowledgeRecords(guard.db, guard.tenantId, parsed.value, {
      preparationId,
      safetyTopic,
    });
    return readListOk(rows, parsed.value.page, parsed.value.limit, total);
  } catch (e) {
    return readServerError("claims:list", e);
  }
}

/**
 * POST /api/aromaterapi/claims — Aromaterapi claim CREATE (C2T canonical yol).
 *
 * Güvenlik / sözleşme:
 *   - requireModuleAccess(includeProfile, "aromatherapy":true) → başarısızsa guard.response. Demo → 403.
 *   - actor (userId/label) ve tenantId YALNIZ guard'dan; body'deki tenant/actor/status/id
 *     alanları sessizce yok sayılmaz, allowlist dışı anahtar → 400.
 *   - status create'te YASAK (allowlist'te yok). route (legacy) DB default'una bırakılır.
 *   - Değerler coerce/trim EDİLMEZ; canonical create yalnız SECURITY DEFINER RPC
 *     (createClaim adapter) üzerinden. Ham DB hatası istemciye SIZMAZ (stabil kod).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX_LEN = 2000;

// Create body EXACT allowlist — tenant/actor/status/id/timestamp/route HİÇ yok.
const CREATE_ALLOWED_KEYS = new Set<string>([
  "preparation_id",
  "claim_type",
  "conclusion",
  "conclusion_provenance",
  "evidence_layer",
  "rationale_status",
  "safety_topic",
  "preparation_context",
  "outcome_type",
  "rationale",
  "routes",
  "populations",
  "sources",
  "passages",
  "relations",
  "reason",
]);

function bad(code: string): Response {
  return NextResponse.json({ ok: false, code }, { status: 400 });
}

type OptStr = { ok: true; value: string | null } | { ok: false };
type OptArr = { ok: true; value: unknown[] | undefined } | { ok: false };

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy", { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ ok: false, code: "AROMA_DEMO_FORBIDDEN" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("AROMA_INVALID_BODY");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return bad("AROMA_INVALID_BODY");
  }
  const obj = body as Record<string, unknown>;

  // Allowlist dışı / spoof (tenant/actor/status/id) anahtar → 400 (sessizce yok sayılmaz).
  for (const key of Object.keys(obj)) {
    if (!CREATE_ALLOWED_KEYS.has(key)) return bad("AROMA_FORBIDDEN_FIELD");
  }

  // Zorunlu non-empty string alanlar (nihai enum/coupling validation RPC'de).
  const preparationId = obj.preparation_id;
  if (typeof preparationId !== "string" || !UUID_RE.test(preparationId)) {
    return bad("AROMA_INVALID_UUID");
  }
  const reqStr = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const claimType = reqStr(obj.claim_type);
  const conclusion = reqStr(obj.conclusion);
  const conclusionProvenance = reqStr(obj.conclusion_provenance);
  const evidenceLayer = reqStr(obj.evidence_layer);
  const rationaleStatus = reqStr(obj.rationale_status);
  if (!claimType || !conclusion || !conclusionProvenance || !evidenceLayer || !rationaleStatus) {
    return bad("AROMA_MISSING_REQUIRED_FIELD");
  }

  // Opsiyonel nullable string alanlar (present ise string | null).
  const optStr = (key: string): OptStr => {
    if (!(key in obj)) return { ok: true, value: null };
    const v = obj[key];
    if (v === null) return { ok: true, value: null };
    if (typeof v === "string") return { ok: true, value: v };
    return { ok: false };
  };
  const safetyTopic = optStr("safety_topic");
  const preparationContext = optStr("preparation_context");
  const outcomeType = optStr("outcome_type");
  const rationale = optStr("rationale");
  if (!safetyTopic.ok || !preparationContext.ok || !outcomeType.ok || !rationale.ok) {
    return bad("AROMA_INVALID_FIELD_TYPE");
  }

  // reason OPSİYONEL; present + non-null ise non-blank, <= 2000 (orijinal iletilir).
  let reason: string | null = null;
  if ("reason" in obj && obj.reason !== null) {
    const r = obj.reason;
    if (typeof r !== "string" || r.trim() === "" || r.length > REASON_MAX_LEN) {
      return bad("AROMA_REASON_INVALID");
    }
    reason = r;
  }

  // Child koleksiyonları: present ise array (derin key/tip doğrulaması RPC'de).
  const childArr = (key: string): OptArr => {
    if (!(key in obj)) return { ok: true, value: undefined };
    const v = obj[key];
    if (!Array.isArray(v)) return { ok: false };
    return { ok: true, value: v };
  };
  const routes = childArr("routes");
  const populations = childArr("populations");
  const sources = childArr("sources");
  const passages = childArr("passages");
  const relations = childArr("relations");
  if (!routes.ok || !populations.ok || !sources.ok || !passages.ok || !relations.ok) {
    return bad("AROMA_INVALID_PAYLOAD");
  }

  const input: CreateClaimInput = {
    preparationId,
    claimType,
    conclusion,
    conclusionProvenance,
    evidenceLayer,
    rationaleStatus,
    safetyTopic: safetyTopic.value,
    preparationContext: preparationContext.value,
    outcomeType: outcomeType.value,
    rationale: rationale.value,
    routes: routes.value,
    populations: populations.value,
    sources: sources.value,
    passages: passages.value,
    relations: relations.value,
    reason,
  };

  const actorLabel = resolveActorLabel(guard.profile, guard.email);
  const result = await createClaim(
    guard.db,
    { userId: guard.userId, label: actorLabel, tenantId: guard.tenantId },
    input,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: CLAIM_ERROR_HTTP[result.code] });
  }
  return NextResponse.json(
    { ok: true, claim_id: result.claimId, warnings: result.warnings },
    { status: 201 },
  );
}
