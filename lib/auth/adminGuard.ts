import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminGuardOk = {
  ok: true;
  adminId: string;
  db: SupabaseClient;
};

export type AdminGuardFail = {
  ok: false;
  response: NextResponse;
};

export type AdminGuardResult = AdminGuardOk | AdminGuardFail;

/**
 * Her admin API route'unun ilk satırında çağrılır.
 *
 * İstemci `x-admin-id` header'ında kendi kullanıcı ID'sini gönderir.
 * Bu ID, service-role client üzerinden users tablosundan doğrulanır:
 *   - role = 'admin'
 *   - active = true
 *
 * localStorage manipülasyonu yalnızca UI erişimi sağlar; veri işlemleri
 * bu server-side DB doğrulamasından geçmeden gerçekleşmez.
 */
export async function verifyAdminRequest(req: NextRequest): Promise<AdminGuardResult> {
  const adminId = req.headers.get("x-admin-id")?.trim() ?? "";
  const sessionToken = req.headers.get("x-session-token")?.trim() ?? "";

  if (!adminId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Yetki gerekli." },
        { status: 401 },
      ),
    };
  }

  // x-session-token zorunlu — yalnızca x-admin-id ile kimlik kabul edilmez.
  if (!sessionToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin oturum doğrulaması gerekli." },
        { status: 401 },
      ),
    };
  }

  let db: SupabaseClient;
  try {
    db = getServerDb();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sunucu yapılandırma hatası." },
        { status: 500 },
      ),
    };
  }

  // Token doğrulaması ve admin kaydı bağımsız girdilere (sessionToken / adminId
  // header'ları) dayanır → paralel çalıştırılır. Güvenlik kontrolleri aşağıda aynı
  // sırayla, aynı status ve gövdeyle değerlendirilir (davranış korunur).
  const [tokenUserId, userRes] = await Promise.all([
    getActiveSessionUserId(db, sessionToken),
    db
      .from("users")
      .select("id, role, active")
      .eq("id", adminId)
      .maybeSingle(),
  ]);

  // Token aktif mi + hangi kullanıcıya ait?
  if (!tokenUserId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin oturumu geçersiz." },
        { status: 401 },
      ),
    };
  }

  // Binding: token'ın sahibi, iddia edilen x-admin-id ile aynı olmalı.
  if (tokenUserId !== adminId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin oturum kimliği uyuşmuyor." },
        { status: 403 },
      ),
    };
  }

  const { data, error } = userRes;

  if (error || !data || data.role !== "admin" || data.active !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Admin yetkisi gerekli." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, adminId, db };
}
