import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserGuardOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  db: SupabaseClient;
};

export type UserGuardFail = {
  ok: false;
  response: NextResponse;
};

export type UserGuardResult = UserGuardOk | UserGuardFail;

/**
 * Kullanıcı kimlik doğrulaması — settings API route'ları için.
 *
 * Güvenlik modeli (Faz 0):
 *   1. x-user-id zorunlu.
 *   2. x-session-token zorunlu — yalnızca x-user-id'ye GÜVENİLMEZ (spoof edilebilir).
 *   3. Token user_sessions'da aktif olmalı.
 *   4. Token'ın sahibi x-user-id ile aynı olmalı (binding) — başkasının
 *      geçerli token'ı kendi x-user-id'siyle birlikte kullanılamaz.
 */
export async function verifyUserRequest(req: NextRequest): Promise<UserGuardResult> {
  const userId = req.headers.get("x-user-id")?.trim() ?? "";
  const sessionToken = req.headers.get("x-session-token")?.trim() ?? "";

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Yetki gerekli." }, { status: 401 }),
    };
  }

  // x-session-token zorunlu — yalnızca x-user-id ile kimlik kabul edilmez.
  if (!sessionToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Oturum doğrulaması gerekli." }, { status: 401 }),
    };
  }

  let db: SupabaseClient;
  try {
    db = getServerDb();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 }),
    };
  }

  // Token aktif mi + hangi kullanıcıya ait?
  const tokenUserId = await getActiveSessionUserId(db, sessionToken);
  if (!tokenUserId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Oturum geçersiz veya süresi dolmuş." },
        { status: 401 },
      ),
    };
  }

  // Binding: token'ın sahibi, iddia edilen x-user-id ile aynı olmalı.
  if (tokenUserId !== userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Oturum kimliği uyuşmuyor." }, { status: 403 }),
    };
  }

  const { data, error } = await db
    .from("users")
    .select("id, tenant_id, email, active, is_demo_account")
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data || !data.tenant_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Yetki yok." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId,
    tenantId: String(data.tenant_id),
    email: String(data.email ?? ""),
    is_demo_account: data.is_demo_account === true,
    db,
  };
}
