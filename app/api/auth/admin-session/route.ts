import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const COOKIE_NAME = "yasam_admin_id";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 saat

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * POST /api/auth/admin-session
 * Admin login sonrası çağrılır. userId doğrulanır; geçerliyse httpOnly cookie set edilir.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { userId?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!userId) {
      return NextResponse.json({ error: "userId gerekli." }, { status: 400 });
    }

    const db = getDb();

    const { data, error } = await db
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .eq("role", "admin")
      .eq("active", true)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Yetki yok." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/admin-session
 * Logout sırasında cookie temizlemek için çağrılır.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
  return response;
}
