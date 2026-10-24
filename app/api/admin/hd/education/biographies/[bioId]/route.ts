import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { BioValidationError, parseBioContent } from "@/lib/human-design/education/biography/biographyContract";
import {
  BioStoreError, getOwnerBiography, setBiographyPublish, setBiographyReviewed, updateBiography,
} from "@/lib/human-design/education/biography/biographyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bioId: string }> };
const MAX_BODY = 300_000;
const fail = (status: number, error: string, code?: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, code, ...extra }, { status, headers: EDU_NO_STORE });

async function readJson(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return { ok: false, res: fail(413, "İstek çok büyük.") };
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, res: fail(400, "Geçerli JSON gövdesi gerekli.") };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, res: fail(400, "Geçerli JSON gövdesi gerekli.") };
  }
}
const revisionOf = (b: Record<string, unknown>) => (Number.isInteger(b.revision) && Number(b.revision) >= 1 ? Number(b.revision) : null);
function storeFail(e: unknown): Response {
  if (e instanceof BioStoreError) {
    if (e.code === "NOT_FOUND") return eduNotFound();
    if (e.code === "CONFLICT") {
      return fail(409, `Bu hayat hikâyesi başka bir oturumda değiştirildi (güncel=${e.current ?? "?"}). Sayfayı yenileyip tekrar deneyin.`, "BIO_CONFLICT", { current: e.current ?? null });
    }
    if (e.code === "PUBLISH_BLOCKED") return fail(422, "Kayıt veritabanı kurallarını karşılamıyor (yayın için kaynak kontrolü ve en az bir kaynak gerekir).", "BIO_RULE");
  }
  return fail(500, "İşlem tamamlanamadı.");
}

/** GET — YALNIZ owner: tam biyografi + geçmiş (taslak dahil). */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  try {
    const { bioId } = await context.params;
    const data = await getOwnerBiography(gate.ctx.db, String(bioId ?? ""));
    if (!data) return eduNotFound();
    return NextResponse.json({ ok: true, data }, { headers: EDU_NO_STORE });
  } catch (e) {
    return storeFail(e);
  }
}

/** PUT — YALNIZ owner: içerik düzenleme { revision, content }. Aktör oturumdan; gövdeden alınmaz. */
export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  const j = await readJson(req);
  if (!j.ok) return j.res;
  const rev = revisionOf(j.body);
  if (rev === null) return fail(400, "revision zorunlu.");
  let content;
  try {
    content = parseBioContent(j.body.content);
  } catch (e) {
    return e instanceof BioValidationError ? fail(400, e.message, "BIO_INVALID", { field: e.field }) : fail(400, "Geçersiz içerik.");
  }
  try {
    const { bioId } = await context.params;
    const revision = await updateBiography(gate.ctx.db, gate.ctx.ownerId, String(bioId ?? ""), rev, content);
    return NextResponse.json({ ok: true, revision }, { headers: EDU_NO_STORE });
  } catch (e) {
    return storeFail(e);
  }
}

/** POST — YALNIZ owner: { action: "publish" | "unpublish" | "review", revision }. */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  const j = await readJson(req);
  if (!j.ok) return j.res;
  const rev = revisionOf(j.body);
  const action = j.body.action;
  if (rev === null || (action !== "publish" && action !== "unpublish" && action !== "review")) return fail(400, "Geçersiz işlem veya eksik alan.");
  try {
    const { bioId } = await context.params;
    const id = String(bioId ?? "");
    const revision = action === "review"
      ? await setBiographyReviewed(gate.ctx.db, gate.ctx.ownerId, id, rev)
      : await setBiographyPublish(gate.ctx.db, gate.ctx.ownerId, id, rev, action === "publish");
    return NextResponse.json({ ok: true, revision }, { headers: EDU_NO_STORE });
  } catch (e) {
    return storeFail(e);
  }
}
