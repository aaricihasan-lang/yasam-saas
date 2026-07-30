import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listClaimSources,
  YEBS_CLAIM_SOURCE_ROLES,
  YEBS_CLAIM_SOURCE_RATIONALE_STATUSES,
  YEBS_CLAIM_SOURCE_VERIFICATION_STATUSES,
  type YebsClaimSourceRole,
  type YebsClaimSourceRationaleStatus,
  type YebsClaimSourceVerificationStatus,
} from "@/lib/yebs/service/claimSources";
import {
  attachClaimSource,
  type AttachClaimSourceInput,
  type AttachClaimSourceErrorCode,
} from "@/lib/yebs/service/claimSourceMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ claimId: string }> };

/**
 * GET  /api/admin/yebs/claims/[claimId]/sources — SALT-OKUNUR liste (A4BR)
 * POST /api/admin/yebs/claims/[claimId]/sources — audit'li attach (A4B)
 *
 * verifyAdminRequest; yalnız guard.db (service_role). JOIN yok; canonical 18 alan.
 * verification_status body'den alınmaz (attach=unverified). DELETE burada değil (detail).
 */

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const REASON_MAX_LEN = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const ISO15924_RE = /^[A-Z][a-z]{3}$/;
const HARMFUL_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
function hasHarmfulControl(value: string): boolean {
  return HARMFUL_CONTROL_RE.test(value);
}

// A4B metin sınırları (D7 sözleşmesi).
const LIMITS = {
  locator_text: 2000,
  url_fragment: 2000,
  transliteration_scheme: 200,
  source_original_excerpt: 50000,
  transliteration: 50000,
  faithful_translation: 50000,
  rationale: 20000,
} as const;

/* ----------------------------- GET ----------------------------- */

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { claimId } = await ctx.params;
  if (!UUID_RE.test(claimId)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz iddia kimliği.", code: "YEBS_INVALID_CLAIM_ID" },
      { status: 400 },
    );
  }

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
  // source_id
  let sourceId: string | undefined;
  const rawSource = sp.get("source_id");
  if (rawSource !== null && rawSource !== "") {
    if (!UUID_RE.test(rawSource)) return bad("Geçersiz source_id değeri.", "YEBS_INVALID_SOURCE_ID");
    sourceId = rawSource;
  }
  // source_role
  let sourceRole: YebsClaimSourceRole | undefined;
  const rawRole = sp.get("source_role");
  if (rawRole !== null && rawRole !== "") {
    if (!(YEBS_CLAIM_SOURCE_ROLES as readonly string[]).includes(rawRole)) {
      return bad("Geçersiz source_role değeri.", "YEBS_INVALID_SOURCE_ROLE");
    }
    sourceRole = rawRole as YebsClaimSourceRole;
  }
  // rationale_status
  let rationaleStatus: YebsClaimSourceRationaleStatus | undefined;
  const rawRat = sp.get("rationale_status");
  if (rawRat !== null && rawRat !== "") {
    if (!(YEBS_CLAIM_SOURCE_RATIONALE_STATUSES as readonly string[]).includes(rawRat)) {
      return bad("Geçersiz rationale_status değeri.", "YEBS_INVALID_RATIONALE_STATUS");
    }
    rationaleStatus = rawRat as YebsClaimSourceRationaleStatus;
  }
  // verification_status
  let verificationStatus: YebsClaimSourceVerificationStatus | undefined;
  const rawVer = sp.get("verification_status");
  if (rawVer !== null && rawVer !== "") {
    if (!(YEBS_CLAIM_SOURCE_VERIFICATION_STATUSES as readonly string[]).includes(rawVer)) {
      return bad("Geçersiz verification_status değeri.", "YEBS_INVALID_VERIFICATION_STATUS");
    }
    verificationStatus = rawVer as YebsClaimSourceVerificationStatus;
  }
  // has_excerpt / has_translation (yalnız "true" | "false")
  function readBool(key: string): { ok: true; value: boolean | undefined } | { ok: false } {
    const raw = sp.get(key);
    if (raw === null || raw === "") return { ok: true, value: undefined };
    if (raw === "true") return { ok: true, value: true };
    if (raw === "false") return { ok: true, value: false };
    return { ok: false };
  }
  const he = readBool("has_excerpt"), ht = readBool("has_translation");
  if (!he.ok || !ht.ok) return bad("has_* filtreleri yalnız true/false olabilir.", "YEBS_INVALID_HAS_FILTER");

  const result = await listClaimSources(db, claimId, {
    limit,
    offset,
    sourceId,
    sourceRole,
    rationaleStatus,
    verificationStatus,
    hasExcerpt: he.value,
    hasTranslation: ht.value,
  });

  if (!result.ok) {
    if (result.code === "YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "İddia kaydı bulunamadı.", code: result.code }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: "YEBS kaynak bağları alınamadı.", code: result.code },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, rows: result.rows, count: result.count, limit, offset });
}

/* ----------------------------- POST (attach) ----------------------------- */

const ALLOWED_BODY_KEYS = [
  "source_id", "source_role", "locator_text", "url_fragment", "source_original_excerpt",
  "source_original_language_tag", "source_original_script_code", "transliteration",
  "transliteration_scheme", "faithful_translation", "translation_language_tag",
  "rationale", "rationale_status", "reason",
] as const;

// Nullable metin alanları (trim→null; uzunluk + zararlı kontrol).
const TEXT_LEN_KEYS = [
  "locator_text", "url_fragment", "source_original_excerpt", "transliteration",
  "transliteration_scheme", "faithful_translation", "rationale",
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

/** Nullable metin: trim → null; uzunluk + zararlı kontrol karakteri denetimi. */
function normText(
  raw: string | null,
  max: number,
): { ok: true; value: string | null } | { ok: false } {
  if (raw === null) return { ok: true, value: null };
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  if (t.length > max || hasHarmfulControl(t)) return { ok: false };
  return { ok: true, value: t };
}

function mapAttachError(code: AttachClaimSourceErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_CLAIM_SOURCE_INVALID_INPUT":
      return NextResponse.json({ ok: false, error: "Geçersiz kaynak bağı verisi.", code }, { status: 400 });
    case "YEBS_CLAIM_SOURCE_CLAIM_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "İddia kaydı bulunamadı.", code }, { status: 404 });
    case "YEBS_CLAIM_SOURCE_SOURCE_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynak kaydı bulunamadı.", code }, { status: 404 });
    case "YEBS_CLAIM_SOURCE_CLAIM_LOCKED":
      return NextResponse.json({ ok: false, error: "Yalnız taslak durumundaki iddiaya kaynak bağlanabilir.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CLAIM_ID_REQUIRED":
    case "YEBS_CLAIM_SOURCE_ATTACH_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "Kaynak bağı oluşturulamadı.", code: "YEBS_CLAIM_SOURCE_ATTACH_FAILED" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { claimId } = await ctx.params;
  if (!UUID_RE.test(claimId)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz iddia kimliği.", code: "YEBS_INVALID_CLAIM_ID" },
      { status: 400 },
    );
  }

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
  for (const key of ["source_id", "source_role", "rationale_status"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
  }

  // source_id UUID
  const sourceId = obj.source_id as string;
  if (!UUID_RE.test(sourceId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz source_id değeri.", code: "YEBS_INVALID_SOURCE_ID" }, { status: 400 });
  }
  // enum
  const sourceRole = obj.source_role as string;
  if (!(YEBS_CLAIM_SOURCE_ROLES as readonly string[]).includes(sourceRole)) return invalidBody();
  const rationaleStatus = obj.rationale_status as string;
  if (!(YEBS_CLAIM_SOURCE_RATIONALE_STATUSES as readonly string[]).includes(rationaleStatus)) return invalidBody();

  // nullable text (trim→null + uzunluk + kontrol)
  const text: Record<string, string | null> = {};
  for (const key of TEXT_LEN_KEYS) {
    const r = readOptionalString(obj, key);
    if (!r.ok) return invalidBody();
    const n = normText(r.value, LIMITS[key]);
    if (!n.ok) return invalidBody();
    text[key] = n.value;
  }
  // language/script (trim→null + format)
  function readTag(key: string, re: RegExp): { ok: true; value: string | null } | { ok: false } {
    const r = readOptionalString(obj, key);
    if (!r.ok) return { ok: false };
    if (r.value === null) return { ok: true, value: null };
    const t = r.value.trim();
    if (t === "") return { ok: true, value: null };
    if (!re.test(t)) return { ok: false };
    return { ok: true, value: t };
  }
  const excerptLang = readTag("source_original_language_tag", BCP47_RE);
  const excerptScript = readTag("source_original_script_code", ISO15924_RE);
  const transLang = readTag("translation_language_tag", BCP47_RE);
  if (!excerptLang.ok || !excerptScript.ok || !transLang.ok) return invalidBody();

  const excerpt = text.source_original_excerpt;
  const transliteration = text.transliteration;
  const translitScheme = text.transliteration_scheme;
  const faithful = text.faithful_translation;
  const rationale = text.rationale;

  // COUPLING (route katmanı; RPC de ayrıca doğrular)
  // rationale ↔ rationale_status
  if (rationaleStatus === "from_source") {
    if (rationale === null) return invalidBody();
  } else {
    if (rationale !== null) return invalidBody();
  }
  // excerpt ↔ dil/script
  if (excerpt === null) {
    if (excerptLang.value !== null || excerptScript.value !== null) return invalidBody();
  } else {
    if (excerptLang.value === null) return invalidBody();
  }
  // transliteration → excerpt
  if (transliteration !== null && excerpt === null) return invalidBody();
  // transliteration_scheme → transliteration
  if (translitScheme !== null && transliteration === null) return invalidBody();
  // faithful_translation → excerpt
  if (faithful !== null && excerpt === null) return invalidBody();
  // faithful_translation ↔ translation_language_tag
  if ((faithful === null) !== (transLang.value === null)) return invalidBody();

  // reason optional
  const reasonRead = readOptionalString(obj, "reason");
  if (!reasonRead.ok) return invalidBody();
  if (reasonRead.value !== null &&
      (reasonRead.value.trim() === "" || reasonRead.value.length > REASON_MAX_LEN || hasHarmfulControl(reasonRead.value))) {
    return invalidBody();
  }

  const input: AttachClaimSourceInput = {
    sourceId,
    sourceRole,
    rationaleStatus,
    locatorText: text.locator_text,
    urlFragment: text.url_fragment,
    sourceOriginalExcerpt: excerpt,
    sourceOriginalLanguageTag: excerptLang.value,
    sourceOriginalScriptCode: excerptScript.value,
    transliteration,
    transliterationScheme: translitScheme,
    faithfulTranslation: faithful,
    translationLanguageTag: transLang.value,
    rationale,
    reason: reasonRead.value,
  };

  const result = await attachClaimSource(db, adminId, claimId, input);
  if (!result.ok) return mapAttachError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}
