import { NextRequest, NextResponse } from "next/server";
import { requestTranslator } from "@/lib/i18n/serverMessages";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export const runtime = "nodejs";

/** AUTH-02: kullanıcı başına destek mesajı sınırı (DB-temelli, instance'lar arası ortak). */
const SUPPORT_USER_LIMIT = 10;
const SUPPORT_USER_WINDOW_SEC = 60 * 60;

/**
 * GET /api/settings/support — kullanıcının kendi mesajlarını listele
 * POST /api/settings/support — yeni destek mesajı gönder
 * Header: x-user-id
 */
export async function GET(req: NextRequest) {
  const te = requestTranslator(req, "settings.api");
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
    return NextResponse.json({ error: te("supportLoadFailed") }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const te = requestTranslator(req, "settings.api");
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { userId, tenantId, db } = guard;
  // AUTH-02: herkese açık demo hesabı salt okunur — destek kutusuna yazamaz.
  if (guard.is_demo_account) return demoReadOnlyResponse();

  let body: { subject?: unknown; message?: unknown; priority?: unknown };
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: te("invalidRequest") }, { status: 400 });
  }

  const subject  = String(body.subject ?? "").trim();
  const message  = String(body.message ?? "").trim();
  const priority = body.priority === "urgent" ? "urgent" : "normal";

  if (!subject) return NextResponse.json({ error: te("subjectRequired") }, { status: 400 });
  if (!message) return NextResponse.json({ error: te("messageRequired") }, { status: 400 });
  if (subject.length > 200) return NextResponse.json({ error: te("subjectTooLong") }, { status: 400 });
  if (message.length > 5000) return NextResponse.json({ error: te("messageTooLong") }, { status: 400 });

  const hit = await hitDbRateLimit(db, rateLimitBucket("support-user", userId), SUPPORT_USER_LIMIT, SUPPORT_USER_WINDOW_SEC);
  if (!hit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", error: te("supportRateLimited") },
      { status: 429, headers: { "Retry-After": String(Math.max(1, hit.retryAfterSec)) } },
    );
  }

  const { data, error } = await db
    .from("support_messages")
    .insert({ user_id: userId, tenant_id: tenantId, subject, message, priority })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[settings/support] insert", error);
    return NextResponse.json({ error: te("supportSendFailed") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
