import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/settings/support — kullanıcının kendi mesajlarını listele
 * POST /api/settings/support — yeni destek mesajı gönder
 * Header: x-user-id
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { userId, db } = guard;

  const { data, error } = await db
    .from("support_messages")
    .select("id, subject, message, priority, status, admin_note, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[settings/support] list", error);
    return NextResponse.json({ error: "Mesajlar yüklenemedi." }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { userId, tenantId, db } = guard;

  let body: { subject?: unknown; message?: unknown; priority?: unknown };
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const subject  = String(body.subject ?? "").trim();
  const message  = String(body.message ?? "").trim();
  const priority = body.priority === "urgent" ? "urgent" : "normal";

  if (!subject) return NextResponse.json({ error: "Konu gerekli." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Mesaj gerekli." }, { status: 400 });
  if (subject.length > 200) return NextResponse.json({ error: "Konu en fazla 200 karakter." }, { status: 400 });
  if (message.length > 5000) return NextResponse.json({ error: "Mesaj en fazla 5000 karakter." }, { status: 400 });

  const { data, error } = await db
    .from("support_messages")
    .insert({ user_id: userId, tenant_id: tenantId, subject, message, priority })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[settings/support] insert", error);
    return NextResponse.json({ error: "Mesaj gönderilemedi; lütfen tekrar deneyin." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
