import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listSources,
  YEBS_SOURCE_TYPES,
  YEBS_SOURCE_STATUSES,
  type YebsSourceType,
  type YebsSourceStatus,
} from "@/lib/yebs/service/sources";
import {
  createSource,
  type CreateSourceInput,
  type CreateSourceErrorCode,
} from "@/lib/yebs/service/sourceMutations";

export const runtime = "nodejs";

/**
 * GET  /api/admin/yebs/sources — SALT-OKUNUR liste (A3R)
 * POST /api/admin/yebs/sources — audit'li create (A3W)
 *
 * verifyAdminRequest; yalnız guard.db (service_role). JOIN yok; canonical row.
 */

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const MAX_Q_LEN = 100;
const REASON_MAX_LEN = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Katı YYYY-MM-DD + gerçek takvim (31 Şubat vb. reddi). Değer normalize edilmez. */
function isValidYmd(value: string): boolean {
  const m = YMD_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year === 0) return false;
  if (month < 1 || month > 12) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
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
  // source_type
  let sourceType: YebsSourceType | undefined;
  const rawType = sp.get("source_type");
  if (rawType !== null && rawType !== "") {
    if (!(YEBS_SOURCE_TYPES as readonly string[]).includes(rawType)) {
      return bad("Geçersiz source_type değeri.", "YEBS_INVALID_SOURCE_TYPE");
    }
    sourceType = rawType as YebsSourceType;
  }
  // status
  let status: YebsSourceStatus | undefined;
  const rawStatus = sp.get("status");
  if (rawStatus !== null && rawStatus !== "") {
    if (!(YEBS_SOURCE_STATUSES as readonly string[]).includes(rawStatus)) {
      return bad("Geçersiz status değeri.", "YEBS_INVALID_STATUS");
    }
    status = rawStatus as YebsSourceStatus;
  }
  // publication_year
  let publicationYear: number | undefined;
  const rawYear = sp.get("publication_year");
  if (rawYear !== null && rawYear !== "") {
    const n = Number(rawYear);
    if (!Number.isInteger(n) || n < -3000 || n > 2100) {
      return bad("Geçersiz publication_year değeri.", "YEBS_INVALID_PUBLICATION_YEAR");
    }
    publicationYear = n;
  }
  // tradition_context_id
  let traditionContextId: string | undefined;
  const rawTrad = sp.get("tradition_context_id");
  if (rawTrad !== null && rawTrad !== "") {
    if (!UUID_RE.test(rawTrad)) {
      return bad("Geçersiz tradition_context_id değeri.", "YEBS_INVALID_TRADITION_ID");
    }
    traditionContextId = rawTrad;
  }
  // has_* (yalnız "true" | "false")
  function readBool(key: string): { ok: true; value: boolean | undefined } | { ok: false } {
    const raw = sp.get(key);
    if (raw === null || raw === "") return { ok: true, value: undefined };
    if (raw === "true") return { ok: true, value: true };
    if (raw === "false") return { ok: true, value: false };
    return { ok: false };
  }
  const hd = readBool("has_doi"), hp = readBool("has_pmid"), hi = readBool("has_isbn"), hu = readBool("has_url");
  if (!hd.ok || !hp.ok || !hi.ok || !hu.ok) {
    return bad("has_* filtreleri yalnız true/false olabilir.", "YEBS_INVALID_HAS_FILTER");
  }
  // nonblank string filters (language_tag/author/publisher; arındırma)
  function cleanStr(key: string): string | undefined {
    const raw = sp.get(key);
    if (raw === null) return undefined;
    const cleaned = raw.trim().replace(/[,()*%]/g, "").slice(0, MAX_Q_LEN);
    return cleaned ? cleaned : undefined;
  }
  const languageTag = cleanStr("language_tag");
  const author = cleanStr("author");
  const publisher = cleanStr("publisher");
  const q = cleanStr("q");

  const result = await listSources(db, {
    limit,
    offset,
    q,
    sourceType,
    status,
    languageTag,
    author,
    publisher,
    publicationYear,
    hasDoi: hd.value,
    hasPmid: hp.value,
    hasIsbn: hi.value,
    hasUrl: hu.value,
    traditionContextId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "YEBS kaynak kayıtları alınamadı.", code: result.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, rows: result.rows, count: result.count, limit, offset });
}

/* ----------------------------- POST ----------------------------- */

const ALLOWED_BODY_KEYS = [
  "source_type", "title", "language_tag", "script_code", "authors", "organization",
  "publisher", "publication_year", "dating_note", "edition", "doi", "pmid", "isbn",
  "url", "document_no", "tradition_context_id", "accessed_on", "notes", "reason",
] as const;

const OPTIONAL_STRING_KEYS = [
  "script_code", "authors", "organization", "publisher", "dating_note", "edition",
  "doi", "pmid", "isbn", "url", "document_no", "notes",
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

function mapCreateError(code: CreateSourceErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_INVALID_SOURCE_INPUT":
      return NextResponse.json({ ok: false, error: "Geçersiz kaynak verisi.", code }, { status: 400 });
    case "YEBS_SOURCE_TRADITION_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynağın bağlam geleneği bulunamadı.", code }, { status: 404 });
    case "YEBS_SOURCE_DOI_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu DOI ile bir kaynak zaten var.", code }, { status: 409 });
    case "YEBS_SOURCE_PMID_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu PMID ile bir kaynak zaten var.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_SOURCE_CREATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "Kaynak oluşturulamadı.", code: "YEBS_SOURCE_CREATE_FAILED" }, { status: 500 });
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
  for (const key of ["source_type", "title", "language_tag"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
  }

  // optional strings
  const opt: Record<string, string | null> = {};
  for (const key of OPTIONAL_STRING_KEYS) {
    const r = readOptionalString(obj, key);
    if (!r.ok) return invalidBody();
    opt[key] = r.value;
  }

  // publication_year: integer number | null (string kabul edilmez)
  let publicationYear: number | null = null;
  if ("publication_year" in obj) {
    const v = obj.publication_year;
    if (v === null || v === undefined) publicationYear = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= -3000 && v <= 2100) publicationYear = v;
    else return invalidBody();
  }

  // tradition_context_id: uuid | null
  let traditionContextId: string | null = null;
  if ("tradition_context_id" in obj) {
    const v = obj.tradition_context_id;
    if (v === null || v === undefined) traditionContextId = null;
    else if (typeof v === "string" && UUID_RE.test(v)) traditionContextId = v;
    else if (typeof v === "string") {
      return NextResponse.json({ ok: false, error: "Geçersiz tradition_context_id değeri.", code: "YEBS_INVALID_TRADITION_ID" }, { status: 400 });
    } else return invalidBody();
  }

  // accessed_on: YYYY-MM-DD (gerçek takvim) | null
  let accessedOn: string | null = null;
  if ("accessed_on" in obj) {
    const v = obj.accessed_on;
    if (v === null || v === undefined) accessedOn = null;
    else if (typeof v === "string" && isValidYmd(v)) accessedOn = v;
    else return invalidBody();
  }

  // reason optional
  const reasonRead = readOptionalString(obj, "reason");
  if (!reasonRead.ok) return invalidBody();
  if (reasonRead.value !== null && (reasonRead.value.trim() === "" || reasonRead.value.length > REASON_MAX_LEN)) {
    return invalidBody();
  }

  const input: CreateSourceInput = {
    sourceType: obj.source_type as string,
    title: obj.title as string,
    languageTag: obj.language_tag as string,
    scriptCode: opt.script_code,
    authors: opt.authors,
    organization: opt.organization,
    publisher: opt.publisher,
    publicationYear,
    datingNote: opt.dating_note,
    edition: opt.edition,
    doi: opt.doi,
    pmid: opt.pmid,
    isbn: opt.isbn,
    url: opt.url,
    documentNo: opt.document_no,
    traditionContextId,
    accessedOn,
    notes: opt.notes,
    reason: reasonRead.value,
  };

  const result = await createSource(db, adminId, input);
  if (!result.ok) return mapCreateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}
