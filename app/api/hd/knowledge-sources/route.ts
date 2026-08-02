import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  listSourcesForRecord,
  insertSource,
  updateSource,
  deleteSource,
} from "@/lib/human-design/api/knowledgeSourcePersistence";

export const runtime = "nodejs";

/**
 * /api/hd/knowledge-sources — human_design_knowledge_sources güvenli CRUD.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id + user_id YALNIZ guard'dan; request gövdesinden GÜVENİLMEZ.
 *   - record_id IDOR guard: kaynak yalnız aynı tenant'a ait knowledge kaydına bağlanır.
 *   - Tüm sorgu/insert/update/delete tenant-scoped. Yanıt no-store; demo yazamaz.
 *
 * Kaynaklar VARSAYILAN RAPORA akmaz; yalnız uzman ekranında görünür.
 * HD engine/compute/BodyGraph'a ve rapor snapshot akışına dokunmaz.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const recordId = (url.searchParams.get("recordId") ?? "").trim();
  if (!recordId) {
    return NextResponse.json(
      { ok: false, error: "recordId gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { rows, error } = await listSourcesForRecord(guard.db, guard.tenantId, recordId);
  if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında kaynak eklenemez." },
      { status: 403, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  const recordId = String(raw.recordId ?? raw.record_id ?? "").trim();
  const { id, error } = await insertSource(guard.db, guard.tenantId, guard.userId, recordId, raw);
  if (error || !id) {
    return NextResponse.json(
      { ok: false, error: error ?? "Kaynak oluşturulamadı." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında güncelleme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  const id = String(raw.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek kaynağın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { ok, error } = await updateSource(guard.db, guard.tenantId, id, raw);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: error ?? "Güncellenemedi." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında silme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Silinecek kaynağın id'si (id) gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  const { ok, error } = await deleteSource(guard.db, guard.tenantId, id);
  if (!ok) return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: true, deletedId: id }, { status: 200, headers: NO_STORE });
}
