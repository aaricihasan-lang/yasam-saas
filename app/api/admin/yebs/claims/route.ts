import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listClaims,
  YEBS_CLAIM_TYPES,
  YEBS_CLAIM_PROVENANCE_KINDS,
  YEBS_CLAIM_EVIDENCE_LAYERS,
  YEBS_CLAIM_STATUSES,
  YEBS_CLAIM_OUTCOME_TYPES,
  type YebsClaimType,
  type YebsClaimProvenanceKind,
  type YebsClaimEvidenceLayer,
  type YebsClaimStatus,
  type YebsClaimOutcomeType,
} from "@/lib/yebs/service/claims";
import {
  createClaim,
  type CreateClaimInput,
  type CreateClaimErrorCode,
} from "@/lib/yebs/service/claimMutations";

export const runtime = "nodejs";

/**
 * GET  /api/admin/yebs/claims — SALT-OKUNUR liste (A4AR)
 * POST /api/admin/yebs/claims — audit'li create (A4AW)
 *
 * verifyAdminRequest; yalnız guard.db (service_role). JOIN yok; canonical 11 alan.
 * Claim Sources / DELETE / status transition BU DOSYADA YOK (A4B / API-TX).
 */

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const MAX_Q_LEN = 100;
const CLAIM_TEXT_MAX = 20000;
const REASON_MAX_LEN = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAFETY_TOPIC_RE = /^[a-z][a-z0-9_]*$/;

/** tab/LF/CR dışındaki C0/C1 kontrol karakterlerini yakalar (NUL dahil). */
const HARMFUL_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
function hasHarmfulControl(value: string): boolean {
  return HARMFUL_CONTROL_RE.test(value);
}

/* ----------------------------- GET ----------------------------- */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;

  const bad = (error: string, code: string): Response =>
    NextResponse.json({ ok: false, error, code }, { status: 400 });

  // limit
  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      return bad("Geçersiz limit değeri (1-200 arası tam sayı olmalıdır).", "YEBS_INVALID_LIMIT");
    }
    limit = n;
  }
  // offset
  let offset = 0;
  const rawOffset = sp.get("offset");
  if (rawOffset !== null) {
    const n = Number(rawOffset);
    if (!Number.isInteger(n) || n < 0) {
      return bad("Geçersiz offset değeri (0 veya pozitif tam sayı olmalıdır).", "YEBS_INVALID_OFFSET");
    }
    offset = n;
  }
  // concept_id
  let conceptId: string | undefined;
  const rawConcept = sp.get("concept_id");
  if (rawConcept !== null && rawConcept !== "") {
    if (!UUID_RE.test(rawConcept)) {
      return bad("Geçersiz concept_id değeri.", "YEBS_INVALID_CONCEPT_ID");
    }
    conceptId = rawConcept;
  }
  // claim_type
  let claimType: YebsClaimType | undefined;
  const rawType = sp.get("claim_type");
  if (rawType !== null && rawType !== "") {
    if (!(YEBS_CLAIM_TYPES as readonly string[]).includes(rawType)) {
      return bad("Geçersiz claim_type değeri.", "YEBS_INVALID_CLAIM_TYPE");
    }
    claimType = rawType as YebsClaimType;
  }
  // provenance_kind
  let provenanceKind: YebsClaimProvenanceKind | undefined;
  const rawProv = sp.get("provenance_kind");
  if (rawProv !== null && rawProv !== "") {
    if (!(YEBS_CLAIM_PROVENANCE_KINDS as readonly string[]).includes(rawProv)) {
      return bad("Geçersiz provenance_kind değeri.", "YEBS_INVALID_PROVENANCE_KIND");
    }
    provenanceKind = rawProv as YebsClaimProvenanceKind;
  }
  // evidence_layer
  let evidenceLayer: YebsClaimEvidenceLayer | undefined;
  const rawLayer = sp.get("evidence_layer");
  if (rawLayer !== null && rawLayer !== "") {
    if (!(YEBS_CLAIM_EVIDENCE_LAYERS as readonly string[]).includes(rawLayer)) {
      return bad("Geçersiz evidence_layer değeri.", "YEBS_INVALID_EVIDENCE_LAYER");
    }
    evidenceLayer = rawLayer as YebsClaimEvidenceLayer;
  }
  // status
  let status: YebsClaimStatus | undefined;
  const rawStatus = sp.get("status");
  if (rawStatus !== null && rawStatus !== "") {
    if (!(YEBS_CLAIM_STATUSES as readonly string[]).includes(rawStatus)) {
      return bad("Geçersiz status değeri.", "YEBS_INVALID_STATUS");
    }
    status = rawStatus as YebsClaimStatus;
  }
  // outcome_type
  let outcomeType: YebsClaimOutcomeType | undefined;
  const rawOutcome = sp.get("outcome_type");
  if (rawOutcome !== null && rawOutcome !== "") {
    if (!(YEBS_CLAIM_OUTCOME_TYPES as readonly string[]).includes(rawOutcome)) {
      return bad("Geçersiz outcome_type değeri.", "YEBS_INVALID_OUTCOME_TYPE");
    }
    outcomeType = rawOutcome as YebsClaimOutcomeType;
  }
  // safety_topic (snake_case)
  let safetyTopic: string | undefined;
  const rawSafety = sp.get("safety_topic");
  if (rawSafety !== null && rawSafety !== "") {
    if (!SAFETY_TOPIC_RE.test(rawSafety)) {
      return bad("Geçersiz safety_topic değeri.", "YEBS_INVALID_SAFETY_TOPIC");
    }
    safetyTopic = rawSafety;
  }
  // q — yalnız claim_text; trim + 100 + PostgREST özel karakter arındırma
  let q: string | undefined;
  const rawQ = sp.get("q");
  if (rawQ !== null) {
    const cleaned = rawQ.trim().replace(/[,()*%]/g, "").slice(0, MAX_Q_LEN);
    q = cleaned ? cleaned : undefined;
  }

  const result = await listClaims(db, {
    limit,
    offset,
    q,
    conceptId,
    claimType,
    provenanceKind,
    evidenceLayer,
    status,
    outcomeType,
    safetyTopic,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "YEBS iddia kayıtları alınamadı.", code: result.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, rows: result.rows, count: result.count, limit, offset });
}

/* ----------------------------- POST ----------------------------- */

const ALLOWED_BODY_KEYS = [
  "concept_id", "claim_type", "claim_text", "provenance_kind", "evidence_layer",
  "outcome_type", "safety_topic", "reason",
] as const;

const SAFETY_OUTCOME_TYPES = [
  "harm_shown", "risk_suspected", "contraindicated", "source_does_not_recommend",
  "not_classified_as_risk", "insufficient_data", "conflicting", "unknown",
] as const;

const RESEARCH_OUTCOME_TYPES = [
  "positive_finding", "no_effect_found", "mixed_findings", "insufficient_data",
  "no_study_done", "conflicting", "unknown",
] as const;

function invalidBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

/** missing/undefined/null → null; string → orijinal; başka tip → geçersiz. */
function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!(key in obj)) return { ok: true, value: null };
  const v = obj[key];
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  return { ok: false };
}

function mapCreateError(code: CreateClaimErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_INVALID_CLAIM_INPUT":
      return NextResponse.json({ ok: false, error: "Geçersiz iddia verisi.", code }, { status: 400 });
    case "YEBS_CLAIM_CONCEPT_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "İddianın kavramı bulunamadı.", code }, { status: 404 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CLAIM_CREATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "İddia oluşturulamadı.", code: "YEBS_CLAIM_CREATE_FAILED" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidBody();
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalidBody();
  const obj = body as Record<string, unknown>;

  const allowed = new Set<string>(ALLOWED_BODY_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidBody();
  }

  // required strings (nonblank; coercion YOK)
  for (const key of ["concept_id", "claim_type", "claim_text", "provenance_kind", "evidence_layer"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
  }

  // concept_id UUID
  const conceptId = obj.concept_id as string;
  if (!UUID_RE.test(conceptId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz concept_id değeri.", code: "YEBS_INVALID_CONCEPT_ID" }, { status: 400 });
  }

  // enum membership
  const claimType = obj.claim_type as string;
  if (!(YEBS_CLAIM_TYPES as readonly string[]).includes(claimType)) return invalidBody();
  const provenanceKind = obj.provenance_kind as string;
  if (!(YEBS_CLAIM_PROVENANCE_KINDS as readonly string[]).includes(provenanceKind)) return invalidBody();
  const evidenceLayer = obj.evidence_layer as string;
  if (!(YEBS_CLAIM_EVIDENCE_LAYERS as readonly string[]).includes(evidenceLayer)) return invalidBody();

  // claim_text: btrim nonblank, ≤20000, zararlı kontrol karakteri reddi
  const claimTextRaw = obj.claim_text as string;
  const claimText = claimTextRaw.trim();
  if (claimText === "" || claimText.length > CLAIM_TEXT_MAX || hasHarmfulControl(claimText)) {
    return invalidBody();
  }

  // outcome_type / safety_topic: string | null; trim → null
  const outcomeRead = readOptionalString(obj, "outcome_type");
  if (!outcomeRead.ok) return invalidBody();
  const safetyRead = readOptionalString(obj, "safety_topic");
  if (!safetyRead.ok) return invalidBody();
  const outcomeType = outcomeRead.value === null ? null : (outcomeRead.value.trim() || null);
  const safetyTopic = safetyRead.value === null ? null : (safetyRead.value.trim() || null);

  // COUPLING (route katmanı; RPC de ayrıca doğrular)
  if (claimType === "safety") {
    if (safetyTopic === null || !SAFETY_TOPIC_RE.test(safetyTopic)) return invalidBody();
    if (outcomeType === null || !(SAFETY_OUTCOME_TYPES as readonly string[]).includes(outcomeType)) return invalidBody();
  } else if (claimType === "research_finding") {
    if (safetyTopic !== null) return invalidBody();
    if (outcomeType !== null && !(RESEARCH_OUTCOME_TYPES as readonly string[]).includes(outcomeType)) return invalidBody();
  } else {
    if (safetyTopic !== null) return invalidBody();
    if (outcomeType !== null) return invalidBody();
  }

  // reason optional
  const reasonRead = readOptionalString(obj, "reason");
  if (!reasonRead.ok) return invalidBody();
  if (reasonRead.value !== null &&
      (reasonRead.value.trim() === "" || reasonRead.value.length > REASON_MAX_LEN || hasHarmfulControl(reasonRead.value))) {
    return invalidBody();
  }

  const input: CreateClaimInput = {
    conceptId,
    claimType,
    claimText,
    provenanceKind,
    evidenceLayer,
    outcomeType,
    safetyTopic,
    reason: reasonRead.value,
  };

  const result = await createClaim(db, adminId, input);
  if (!result.ok) return mapCreateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}
