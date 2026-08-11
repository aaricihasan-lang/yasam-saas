import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  createConsultation,
  getConsultationDetail,
  listConsultation,
} from "@/lib/human-design/consultation/admin/consultationAdminService";
import {
  httpStatusForConsultationError,
  messageForConsultationError,
} from "@/lib/human-design/consultation/admin/consultationErrorHttp";
import type { HdConsultationCreateInput } from "@/lib/human-design/consultation/createInput";
import { HD_CANONICAL_ENTITY_KINDS, type HdCanonicalEntityKind } from "@/lib/human-design/knowledge-system/canonicalKeys";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
const numOrUndef = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const boolOrUndef = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

function parseQuestions(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((q) => ({ questionText: str(q.questionText), topicScope: strOrNull(q.topicScope), sortOrder: numOrUndef(q.sortOrder) }));
}
// condition_kind whitelist; canonical registry doğrulaması DB'de (RPC) yapılır.
type HdConditionKindLoose = "type_is" | "authority_is" | "has_channel" | "has_gate";
function parseConditions(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((c) => ({
    conditionKind: str(c.conditionKind) as HdConditionKindLoose,
    conditionValue: str(c.conditionValue),
    sortOrder: numOrUndef(c.sortOrder),
  }));
}
function parseEvidence(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((e) => ({
    passageId: str(e.passageId),
    relationType: str(e.relationType) as "supports" | "contradicts" | "school_specific" | "background",
    isPrimary: boolOrUndef(e.isPrimary),
    isSingleSource: boolOrUndef(e.isSingleSource),
    editorialNote: strOrNull(e.editorialNote),
    sortOrder: numOrUndef(e.sortOrder),
  }));
}

function parseCreateInput(raw: Record<string, unknown>): HdConsultationCreateInput {
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections.filter(isObj) : [];
  return {
    entityId: str(raw.entityId),
    canonicalContentId: strOrNull(raw.canonicalContentId),
    isAiGenerated: boolOrUndef(raw.isAiGenerated),
    sections: sectionsRaw.map((s) => ({
      clientRef: str(s.clientRef),
      sectionKind: str(s.sectionKind) as HdConsultationCreateInput["sections"][number]["sectionKind"],
      bodyText: str(s.bodyText),
      usageScope: str(s.usageScope) as HdConsultationCreateInput["sections"][number]["usageScope"],
      topicScope: strOrNull(s.topicScope),
      sortOrder: numOrUndef(s.sortOrder),
      status: (s.status === "published" || s.status === "archived" ? s.status : "draft"),
      questions: parseQuestions(s.questions),
      conditions: parseConditions(s.conditions),
      evidence: parseEvidence(s.evidence),
    })),
    contentQuestions: parseQuestions(raw.contentQuestions),
    contentConditions: parseConditions(raw.contentConditions),
  };
}

/** GET: ?id=<uuid> → detay; aksi halde liste (?kind, ?status, ?q). */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) {
    const r = await getConsultationDetail(guard.db, id);
    if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
    return NextResponse.json({ ok: true, detail: r.data }, { headers: NO_STORE });
  }

  const kindParam = req.nextUrl.searchParams.get("kind")?.trim();
  const kind = HD_CANONICAL_ENTITY_KINDS.includes(kindParam as HdCanonicalEntityKind) ? (kindParam as HdCanonicalEntityKind) : undefined;
  const status = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  const q = req.nextUrl.searchParams.get("q")?.trim() || undefined;

  const r = await listConsultation(guard.db, { kind, status, q });
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, entries: r.data, count: r.data.length }, { headers: NO_STORE });
}

/** POST: nested atomik create (yalnız rpc_hd_consultation_create). */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });

  const input = parseCreateInput(raw);
  // actor ASLA gövdeden — guard.adminId (güvenilir) service'e pozisyonel geçer.
  const r = await createConsultation(guard.db, guard.adminId, input);
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, id: r.data.contentId, version: r.data.version }, { status: 201, headers: NO_STORE });
}
