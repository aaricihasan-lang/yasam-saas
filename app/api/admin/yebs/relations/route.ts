import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listConceptRelations,
  YEBS_CONCEPT_RELATION_TYPES,
  YEBS_CONCEPT_RELATION_STATUSES,
  type YebsConceptRelationType,
  type YebsConceptRelationStatus,
} from "@/lib/yebs/service/conceptRelations";
import {
  createConceptRelation,
  type CreateConceptRelationInput,
  type CreateConceptRelationErrorCode,
} from "@/lib/yebs/service/conceptRelationMutations";

export const runtime = "nodejs";

/**
 * GET  /api/admin/yebs/relations — SALT-OKUNUR liste (A5AR)
 * POST /api/admin/yebs/relations — audit'li create (A5AW)
 *
 * verifyAdminRequest; yalnız guard.db (service_role). JOIN yok; canonical 7 alan.
 * Kayıt-yönlü relation; otomatik inverse YOK. DELETE / status transition YOK.
 */

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const REASON_MAX_LEN = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** tab(\x09)/LF(\x0A)/CR(\x0D) dışındaki C0 kontrol karakterleri + DEL (NUL dahil). */
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

  // limit / offset
  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      return bad("Geçersiz limit değeri (1-200 arası tam sayı olmalıdır).", "YEBS_INVALID_LIMIT");
    }
    limit = n;
  }
  let offset = 0;
  const rawOffset = sp.get("offset");
  if (rawOffset !== null) {
    const n = Number(rawOffset);
    if (!Number.isInteger(n) || n < 0) {
      return bad("Geçersiz offset değeri (0 veya pozitif tam sayı olmalıdır).", "YEBS_INVALID_OFFSET");
    }
    offset = n;
  }
  // UUID filtreleri
  function readUuid(key: string, code: string): { ok: true; value: string | undefined } | { ok: false; res: Response } {
    const raw = sp.get(key);
    if (raw === null || raw === "") return { ok: true, value: undefined };
    if (!UUID_RE.test(raw)) return { ok: false, res: bad(`Geçersiz ${key} değeri.`, code) };
    return { ok: true, value: raw };
  }
  const src = readUuid("source_concept_id", "YEBS_INVALID_SOURCE_CONCEPT_ID");
  if (!src.ok) return src.res;
  const tgt = readUuid("target_concept_id", "YEBS_INVALID_TARGET_CONCEPT_ID");
  if (!tgt.ok) return tgt.res;
  const cpt = readUuid("concept_id", "YEBS_INVALID_CONCEPT_ID");
  if (!cpt.ok) return cpt.res;
  const srcId = readUuid("source_id", "YEBS_INVALID_SOURCE_ID");
  if (!srcId.ok) return srcId.res;
  // relation_type
  let relationType: YebsConceptRelationType | undefined;
  const rawType = sp.get("relation_type");
  if (rawType !== null && rawType !== "") {
    if (!(YEBS_CONCEPT_RELATION_TYPES as readonly string[]).includes(rawType)) {
      return bad("Geçersiz relation_type değeri.", "YEBS_INVALID_RELATION_TYPE");
    }
    relationType = rawType as YebsConceptRelationType;
  }
  // status
  let status: YebsConceptRelationStatus | undefined;
  const rawStatus = sp.get("status");
  if (rawStatus !== null && rawStatus !== "") {
    if (!(YEBS_CONCEPT_RELATION_STATUSES as readonly string[]).includes(rawStatus)) {
      return bad("Geçersiz status değeri.", "YEBS_INVALID_STATUS");
    }
    status = rawStatus as YebsConceptRelationStatus;
  }
  // has_sources (yalnız "true" | "false")
  let hasSources: boolean | undefined;
  const rawHas = sp.get("has_sources");
  if (rawHas !== null && rawHas !== "") {
    if (rawHas === "true") hasSources = true;
    else if (rawHas === "false") hasSources = false;
    else return bad("has_sources yalnız true/false olabilir.", "YEBS_INVALID_HAS_FILTER");
  }

  const result = await listConceptRelations(db, {
    limit,
    offset,
    sourceConceptId: src.value,
    targetConceptId: tgt.value,
    conceptId: cpt.value,
    relationType,
    status,
    hasSources,
    sourceId: srcId.value,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "YEBS ilişki kayıtları alınamadı.", code: result.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, rows: result.rows, count: result.count, limit, offset });
}

/* ----------------------------- POST ----------------------------- */

const ALLOWED_BODY_KEYS = [
  "source_concept_id", "target_concept_id", "relation_type", "reason",
] as const;

function invalidBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

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

function mapCreateError(code: CreateConceptRelationErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_CONCEPT_RELATION_INVALID_INPUT":
      return NextResponse.json({ ok: false, error: "Geçersiz ilişki verisi.", code }, { status: 400 });
    case "YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynak kavram bulunamadı.", code }, { status: 404 });
    case "YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Hedef kavram bulunamadı.", code }, { status: 404 });
    case "YEBS_CONCEPT_RELATION_CROSS_TRADITION":
      return NextResponse.json({ ok: false, error: "Bu ilişki türü yalnız aynı gelenek içinde kurulabilir.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu simetrik ilişkinin ayna kaydı zaten var.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu hiyerarşik ilişki başka bir tiple zaten eşdeğer olarak kayıtlı.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT":
      return NextResponse.json({ ok: false, error: "Bu ilişki mevcut hiyerarşik kayıtla doğrudan çelişiyor.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu kaynak/hedef/tip ile ilişki zaten var.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CONCEPT_RELATION_CREATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "İlişki oluşturulamadı.", code: "YEBS_CONCEPT_RELATION_CREATE_FAILED" }, { status: 500 });
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

  // required strings (nonblank)
  for (const key of ["source_concept_id", "target_concept_id", "relation_type"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
  }

  const sourceConceptId = obj.source_concept_id as string;
  const targetConceptId = obj.target_concept_id as string;
  if (!UUID_RE.test(sourceConceptId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz source_concept_id değeri.", code: "YEBS_INVALID_SOURCE_CONCEPT_ID" }, { status: 400 });
  }
  if (!UUID_RE.test(targetConceptId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz target_concept_id değeri.", code: "YEBS_INVALID_TARGET_CONCEPT_ID" }, { status: 400 });
  }
  // self-relation reddi (route + RPC + DB CHECK)
  if (sourceConceptId === targetConceptId) return invalidBody();

  const relationType = obj.relation_type as string;
  if (!(YEBS_CONCEPT_RELATION_TYPES as readonly string[]).includes(relationType)) return invalidBody();

  // reason optional
  const reasonRead = readOptionalString(obj, "reason");
  if (!reasonRead.ok) return invalidBody();
  if (reasonRead.value !== null &&
      (reasonRead.value.trim() === "" || reasonRead.value.length > REASON_MAX_LEN || hasHarmfulControl(reasonRead.value))) {
    return invalidBody();
  }

  const input: CreateConceptRelationInput = {
    sourceConceptId,
    targetConceptId,
    relationType,
    reason: reasonRead.value,
  };

  const result = await createConceptRelation(db, adminId, input);
  if (!result.ok) return mapCreateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}
