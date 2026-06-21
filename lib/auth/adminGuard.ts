import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
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

  if (!adminId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Yetki gerekli." },
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

  const { data, error } = await db
    .from("users")
    .select("id, role, active")
    .eq("id", adminId)
    .maybeSingle();

  if (error || !data || data.role !== "admin" || data.active !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Yetki yok." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, adminId, db };
}
