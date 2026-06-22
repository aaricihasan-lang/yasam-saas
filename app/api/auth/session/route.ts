import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerDb } from "@/lib/supabase-server";
import {
  createUserSession,
  extractLocationFromHeaders,
  validateSessionToken,
} from "@/lib/auth/sessionSecurity";

export const runtime = "nodejs";

/**
 * POST /api/auth/session
 * Başarılı giriş sonrası oturum kaydı oluşturur.
 * Body: { userId: string }
 * Returns: { sessionToken, suspiciousLogin, highRisk }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { userId?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ error: "userId gerekli." }, { status: 400 });
    }

    const db = getServerDb();

    const { data: user } = await db
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("active", true)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    const location     = extractLocationFromHeaders(req.headers);
    const sessionToken = randomUUID();

    const { suspiciousLogin, highRisk } = await createUserSession(
      db,
      userId,
      location,
      sessionToken,
    );

    return NextResponse.json({ sessionToken, suspiciousLogin, highRisk });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/auth/session?token=<sessionToken>
 * Oturum geçerliliğini kontrol eder.
 * Returns: { valid: boolean }
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") ?? "";
    if (!token) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const db    = getServerDb();
    const valid = await validateSessionToken(db, token);
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
