import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/auth/session/pending — OTURUM MODELİ v2.
 *
 * Onay bekleyen admin web girişinin cihazı YALNIZ KENDİ durumunu sorgular (x-session-token).
 * Döner: { state: "pending" | "approved" | "denied" | "expired" | "invalid", pendingExpiresAt? }
 * Onaylandığında, istemcinin standart giriş akışını tamamlayabilmesi için login yanıtıyla AYNI
 * gating satırı (id,email,name,role,status,tenant_id,active,approval_status) döner. Pending iken
 * hiçbir kullanıcı/modül verisi dönmez; token hiçbir korumalı uçta geçerli değildir.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-session-token")?.trim() ?? "";
  if (!token) return NextResponse.json({ state: "invalid" }, { status: 400, headers: NO_STORE });
  try {
    const db = getServerDb();
    const { data, error } = await db.rpc("session_pending_status", { p_token: token });
    if (error) return NextResponse.json({ state: "error" }, { status: 500, headers: NO_STORE });
    const res = (data ?? {}) as { state?: string; user_id?: string; pending_expires_at?: string };
    const state = ["pending", "approved", "denied", "expired"].includes(String(res.state)) ? String(res.state) : "invalid";
    if (state === "approved" && res.user_id) {
      const { data: u } = await db
        .from("users")
        .select("id, email, name, role, status, tenant_id, active, approval_status")
        .eq("id", res.user_id)
        .eq("active", true)
        .maybeSingle();
      if (!u) return NextResponse.json({ state: "invalid" }, { status: 200, headers: NO_STORE });
      return NextResponse.json({ state, user: u }, { status: 200, headers: NO_STORE });
    }
    return NextResponse.json(
      state === "pending" ? { state, pendingExpiresAt: res.pending_expires_at ?? null } : { state },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ state: "error" }, { status: 500, headers: NO_STORE });
  }
}
