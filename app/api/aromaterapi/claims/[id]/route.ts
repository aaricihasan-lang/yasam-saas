import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  updateClaim,
  resolveActorLabel,
  CLAIM_ERROR_HTTP,
  type UpdateClaimInput,
} from "@/lib/aromaterapi/service/claimMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/aromaterapi/claims/[id] — Aromaterapi claim UPDATE (C2T canonical yol).
 *
 * Güvenlik / sözleşme:
 *   - verifyUserRequest(includeProfile:true) → başarısızsa guard.response. Demo → 403.
 *   - actor/tenant YALNIZ guard'dan; claim id YALNIZ URL'den. Body'deki tenant/actor/
 *     claim_id/id/preparation_id/created_at/updated_at/route sessizce yok sayılmaz,
 *     allowlist dışı anahtar → 400.
 *   - reason ZORUNLU. expected_updated_at OPSİYONEL (present ise strict tz'li + gerçek
 *     takvim). patch present ise yalnız izinli core anahtarlar (status DAHİL).
 *   - Child koleksiyonları: omitted=preserve, []=clear, [...]=replace (adapter üzerinden).
 *   - Değerler coerce/trim/truncate EDİLMEZ; canonical update yalnız SECURITY DEFINER
 *     RPC (updateClaim adapter) üzerinden. Ham DB hatası istemciye SIZMAZ (stabil kod).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX_LEN = 2000;

// Zorunlu timezone'lu tarih-zaman: YYYY-MM-DDTHH:mm:ss[.1-6](Z|±HH:mm).
const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// STRICT takvim doğrulaması (Date.parse tek başına 31 Şubat vb. normalize edebilir).
function isValidExpectedUpdatedAt(value: string): boolean {
  const m = EXPECTED_UPDATED_AT_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const tz = m[8];
  if (year === 0) return false;
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;
  if (tz !== "Z") {
    const offsetHour = Number(tz.slice(1, 3));
    const offsetMinute = Number(tz.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

// Update body top-level EXACT allowlist — tenant/actor/id/claim_id/preparation_id/
// created_at/updated_at/route HİÇ yok.
const UPDATE_ALLOWED_KEYS = new Set<string>([
  "reason",
  "expected_updated_at",
  "patch",
  "routes",
  "populations",
  "sources",
  "passages",
  "relations",
]);

// Patch (core) EXACT allowlist — status DAHİL (update'te izinli). immutable/spoof yok.
const PATCH_ALLOWED_KEYS = new Set<string>([
  "claim_type",
  "safety_topic",
  "preparation_context",
  "conclusion",
  "conclusion_provenance",
  "outcome_type",
  "evidence_layer",
  "rationale",
  "rationale_status",
  "status",
]);

function bad(code: string): Response {
  return NextResponse.json({ ok: false, code }, { status: 400 });
}

type OptArr = { ok: true; value: unknown[] | undefined } | { ok: false };

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ ok: false, code: "AROMA_DEMO_FORBIDDEN" }, { status: 403 });
  }

  // claim id YALNIZ URL'den.
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("AROMA_INVALID_UUID");

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

  for (const key of Object.keys(obj)) {
    if (!UPDATE_ALLOWED_KEYS.has(key)) return bad("AROMA_FORBIDDEN_FIELD");
  }

  // reason ZORUNLU (string, trim-boş değil, <= 2000; orijinal iletilir).
  const reasonRaw = obj.reason;
  if (typeof reasonRaw !== "string" || reasonRaw.trim() === "" || reasonRaw.length > REASON_MAX_LEN) {
    return bad("AROMA_REASON_INVALID");
  }
  const reason = reasonRaw;

  // expected_updated_at OPSİYONEL; present + non-null ise strict tz'li + gerçek takvim.
  let expectedUpdatedAt: string | null = null;
  if ("expected_updated_at" in obj && obj.expected_updated_at !== null) {
    const e = obj.expected_updated_at;
    if (typeof e !== "string" || !isValidExpectedUpdatedAt(e)) {
      return bad("AROMA_INVALID_TIMESTAMP");
    }
    expectedUpdatedAt = e;
  }

  // patch OPSİYONEL; present ise plain object + yalnız izinli core anahtarlar.
  let patch: Record<string, unknown> | undefined;
  if ("patch" in obj && obj.patch !== undefined) {
    const p = obj.patch;
    if (p === null || typeof p !== "object" || Array.isArray(p)) return bad("AROMA_INVALID_PAYLOAD");
    const pObj = p as Record<string, unknown>;
    for (const key of Object.keys(pObj)) {
      if (!PATCH_ALLOWED_KEYS.has(key)) return bad("AROMA_FORBIDDEN_FIELD");
    }
    patch = pObj;
  }

  // Child: present ise array; omitted=undefined (RPC NULL=preserve), []=clear, [...]=replace.
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

  const input: UpdateClaimInput = {
    reason,
    patch,
    routes: routes.value,
    populations: populations.value,
    sources: sources.value,
    passages: passages.value,
    relations: relations.value,
    expectedUpdatedAt,
  };

  const actorLabel = resolveActorLabel(guard.profile, guard.email);
  const result = await updateClaim(
    guard.db,
    { userId: guard.userId, label: actorLabel, tenantId: guard.tenantId },
    id,
    input,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: CLAIM_ERROR_HTTP[result.code] });
  }
  return NextResponse.json(
    { ok: true, claim_id: result.claimId, warnings: result.warnings },
    { status: 200 },
  );
}
