import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserGuardOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  db: SupabaseClient;
};

export type UserGuardFail = {
  ok: false;
  response: NextResponse;
};

export type UserGuardResult = UserGuardOk | UserGuardFail;

/**
 * Kullanıcı kimlik doğrulaması — settings API route'ları için.
 * x-user-id header'ı ile aktif kullanıcı kontrolü yapar.
 */
export async function verifyUserRequest(req: NextRequest): Promise<UserGuardResult> {
  const userId = req.headers.get("x-user-id")?.trim() ?? "";

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Yetki gerekli." }, { status: 401 }),
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

  const { data, error } = await db
    .from("users")
    .select("id, tenant_id, email, active")
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
    db,
  };
}
