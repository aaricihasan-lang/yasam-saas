import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/support — tüm destek mesajlarını listele
 * PATCH /api/admin/support — mesaj durumunu / admin notunu güncelle
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 200);

  let query = db
    .from("support_messages")
    .select(
      `id, subject, message, priority, status, admin_note, created_at, updated_at,
       users!support_messages_user_id_fkey(full_name, email)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && ["open", "read", "replied", "closed"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const body = (await req.json()) as {
    id?: unknown;
    status?: unknown;
    admin_note?: unknown;
  };

  const id         = String(body.id ?? "").trim();
  const newStatus  = String(body.status ?? "").trim();
  const adminNote  = body.admin_note !== undefined ? String(body.admin_note).trim() : undefined;

  if (!id) return NextResponse.json({ error: "Mesaj ID gerekli." }, { status: 400 });

  const validStatuses = ["open", "read", "replied", "closed"];
  if (newStatus && !validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (newStatus) update.status = newStatus;
  if (adminNote !== undefined) update.admin_note = adminNote || null;

  const { error } = await db.from("support_messages").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
