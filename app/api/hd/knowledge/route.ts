import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  listKnowledge,
  listKnowledgeByCodes,
  insertKnowledge,
  updateKnowledge,
  deleteKnowledge,
  deleteKnowledgeBulk,
} from "@/lib/human-design/api/knowledgePersistence";

export const runtime = "nodejs";

/**
 * /api/hd/knowledge — human_design_knowledge_records güvenli CRUD (Sprint-4 Aşama-1).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id + user_id YALNIZ guard'dan; request gövdesinden GÜVENİLMEZ.
 *   - Tüm sorgu/insert/update/delete tenant-scoped (.eq("tenant_id", ...)).
 *   - Yanıt no-store; demo hesap yazamaz.
 *
 * HD engine/compute/BodyGraph'a dokunmaz — yalnız knowledge_records tablosu.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const codesRaw = url.searchParams.get("codes");

  if (codesRaw !== null) {
    const codes = codesRaw.split(",").map((c) => c.trim()).filter(Boolean);
    const { rows, error } = await listKnowledgeByCodes(guard.db, guard.tenantId, codes);
    if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
  }

  const { rows, error } = await listKnowledge(guard.db, guard.tenantId);
  if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında kayıt eklenemez." },
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

  const { id, error } = await insertKnowledge(guard.db, guard.tenantId, guard.userId, raw);
  if (error || !id) {
    return NextResponse.json(
      { ok: false, error: error ?? "Kayıt oluşturulamadı." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
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
      { ok: false, error: "Güncellenecek kaydın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { ok, error } = await updateKnowledge(guard.db, guard.tenantId, id, raw);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: error ?? "Güncellenemedi." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında silme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("ids");
  if (idsRaw !== null) {
    const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const { ok, error } = await deleteKnowledgeBulk(guard.db, guard.tenantId, ids);
    if (!ok) return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
    return NextResponse.json({ ok: true, deletedCount: ids.length }, { status: 200, headers: NO_STORE });
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Silinecek kaydın id'si (id) veya id listesi (ids) gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  const { ok, error } = await deleteKnowledge(guard.db, guard.tenantId, id);
  if (!ok) return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: true, deletedId: id }, { status: 200, headers: NO_STORE });
}
