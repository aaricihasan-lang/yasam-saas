import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerDb } from "@/lib/supabase-server";
import {
  createUserSession,
  extractLocationFromHeaders,
  validateSessionToken,
} from "@/lib/auth/sessionSecurity";
import { limitReasonMessage } from "@/lib/auth/sessionLimits";
import { verifyLoginCredentials } from "@/lib/auth/credentialLogin";

export const runtime = "nodejs";

/**
 * POST /api/auth/session
 * Başarılı KİMLİK DOĞRULAMASI sonrası oturum kaydı oluşturur.
 *
 * P0-1 KAPANIŞI (atomik server-login): token yalnızca, credential'lar bu güvenilir
 * server yürütmesi içinde `login_user` ile doğrulandıktan sonra üretilir. Çıplak bir
 * userId ARTIK KABUL EDİLMEZ — yalnız UUID bilmek token üretmeye yetmez.
 *
 * Body: { email: string, password: string }
 * Returns (başarı): { sessionToken, suspiciousLogin, highRisk }
 * Returns (geçersiz credential): 401 · (inaktif): 403 · (limit reddi): 403 { error, reason }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown }
      | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email.trim() || !password.trim()) {
      // Credential yok → kimlik kanıtı yok. Token ÜRETİLMEZ.
      return NextResponse.json({ error: "Kimlik doğrulama gerekli." }, { status: 401 });
    }

    const db = getServerDb();

    // SUNUCU-TARAFI credential doğrulaması (bcrypt/login_user). userId doğrulanmış
    // sonuçtan TÜRETİLİR; client'tan gelen bir kimliğe güvenilmez.
    const verified = await verifyLoginCredentials(db, email, password);
    if (!verified) {
      // Account enumeration'ı artırmamak için tek genel mesaj.
      return NextResponse.json({ error: "E-posta veya şifre hatalı." }, { status: 401 });
    }

    // Mevcut davranışı koru: yalnızca aktif kullanıcı oturum açabilir.
    if (!verified.active) {
      return NextResponse.json({ error: "Hesabınız aktif değil." }, { status: 403 });
    }

    const location     = extractLocationFromHeaders(req.headers);
    const sessionToken = randomUUID();

    const result = await createUserSession(db, verified.userId, location, sessionToken);

    // P3 reject-new: limit aşımında yeni oturum OLUŞTURULMAZ (mevcut oturumlar korunur).
    if (!result.ok) {
      return NextResponse.json(
        { error: limitReasonMessage(result.reason, result.deviceType), reason: result.reason },
        { status: 403 },
      );
    }

    return NextResponse.json({
      sessionToken,
      suspiciousLogin: result.suspiciousLogin,
      highRisk: result.highRisk,
    });
  } catch {
    // Hata ayrıntısı/stack client'a sızdırılmaz.
    return NextResponse.json({ error: "Oturum oluşturulamadı." }, { status: 500 });
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
