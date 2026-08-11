import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { editDraftConsultation, updateConsultation } from "@/lib/human-design/consultation/admin/consultationAdminService";
import {
  httpStatusForConsultationError,
  messageForConsultationError,
} from "@/lib/human-design/consultation/admin/consultationErrorHttp";
import type { HdConsultationEditDraftInput } from "@/lib/human-design/consultation/editInput";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;
type RouteContext = { params: Promise<{ id: string }> };
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);
const numOrUndef = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const boolOrUndef = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

function parseEditQuestions(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((q) => ({ questionText: str(q.questionText), topicScope: strOrNull(q.topicScope), sortOrder: numOrUndef(q.sortOrder) }));
}
function parseEditConditions(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((c) => ({
    conditionKind: str(c.conditionKind) as "type_is" | "authority_is" | "has_channel" | "has_gate",
    conditionValue: str(c.conditionValue),
    sortOrder: numOrUndef(c.sortOrder),
  }));
}
function parseEditEvidence(v: unknown) {
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
/** PUT gövdesini edit input'a çevirir. entity/canonical pin ALINMAZ (edit değiştiremez). */
function parseEditInput(raw: Record<string, unknown>, expectedVersion: number): HdConsultationEditDraftInput {
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections.filter(isObj) : [];
  return {
    expectedVersion,
    sections: sectionsRaw.map((s) => ({
      clientRef: str(s.clientRef),
      sectionKind: str(s.sectionKind) as HdConsultationEditDraftInput["sections"][number]["sectionKind"],
      bodyText: str(s.bodyText),
      usageScope: str(s.usageScope) as HdConsultationEditDraftInput["sections"][number]["usageScope"],
      topicScope: strOrNull(s.topicScope),
      sortOrder: numOrUndef(s.sortOrder),
      status: (s.status === "published" || s.status === "archived" ? s.status : "draft"),
      questions: parseEditQuestions(s.questions),
      conditions: parseEditConditions(s.conditions),
      evidence: parseEditEvidence(s.evidence),
    })),
    contentQuestions: parseEditQuestions(raw.contentQuestions),
    contentConditions: parseEditConditions(raw.contentConditions),
  };
}

/**
 * PATCH: rpc_hd_consultation_update — YALNIZ is_ai_generated patch + explicit repin.
 * expected_version zorunlu; uyuşmazlık → 409. Canonical pin doğrudan yamanamaz.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });

  const expectedVersion = raw.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ ok: false, error: "expectedVersion (pozitif tam sayı) zorunlu." }, { status: 400, headers: NO_STORE });
  }
  const isAiGenerated = typeof raw.isAiGenerated === "boolean" ? raw.isAiGenerated : undefined;
  const repin = raw.repin === true;
  if (isAiGenerated === undefined && !repin) {
    return NextResponse.json({ ok: false, error: "Güncellenecek bir alan yok (isAiGenerated veya repin)." }, { status: 400, headers: NO_STORE });
  }

  const r = await updateConsultation(guard.db, guard.adminId, id, { expectedVersion, isAiGenerated, repin });
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, version: r.data.version }, { headers: NO_STORE });
}

/**
 * PUT: rpc_hd_consultation_edit_draft — DRAFT gövde düzenleme (sections + nested
 * q/c/e + content-düzeyi q/c) atomik yeniden kurma. expectedVersion zorunlu;
 * stale → 409. published/archived → 409 (NOT_DRAFT/ARCHIVED). Canonical pin
 * değişmez. Ham DB metni sızmaz (stabil kod → sabit mesaj). Hard delete YOK.
 */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400, headers: NO_STORE });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  if (!isObj(raw)) return NextResponse.json({ ok: false, error: "Gövde nesne olmalı." }, { status: 400, headers: NO_STORE });

  const expectedVersion = raw.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ ok: false, error: "expectedVersion (pozitif tam sayı) zorunlu." }, { status: 400, headers: NO_STORE });
  }
  if (!Array.isArray(raw.sections)) {
    return NextResponse.json({ ok: false, error: "sections dizi olmalı." }, { status: 400, headers: NO_STORE });
  }

  const input = parseEditInput(raw, expectedVersion);
  // actor ASLA gövdeden — guard.adminId (güvenilir) service'e pozisyonel geçer.
  const r = await editDraftConsultation(guard.db, guard.adminId, id, input);
  if (!r.ok) return NextResponse.json({ ok: false, error: messageForConsultationError(r.code, r.message), code: r.code }, { status: httpStatusForConsultationError(r.code), headers: NO_STORE });
  return NextResponse.json({ ok: true, version: r.data.version }, { headers: NO_STORE });
}
