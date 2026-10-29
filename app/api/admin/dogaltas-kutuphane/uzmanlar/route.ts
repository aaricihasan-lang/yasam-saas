import type { NextRequest } from "next/server";
import { ownerJson, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string; full_name: string | null; email: string | null; role: string | null; active: boolean | null;
  approval_status: string | null; is_demo_account: boolean | null; module_permissions: Record<string, unknown> | null;
};

/**
 * GET /api/admin/dogaltas-kutuphane/uzmanlar — owner'ın erişim verebileceği uzman listesi (YALNIZ OWNER; owner olmayan herkes 404).
 * Yalnız okuma: aktif uzman hesapları (ad, e-posta, Doğaltaş izni, onay durumu). Erişim VERİLMEZ; yetki POST /yetkiler ile ve
 * uygunluk DB'de (stone_library_grant_access) yeniden doğrulanarak verilir. Varsayılan: hiçbir uzmanın erişimi yok.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db }) => {
    const { data, error } = await db
      .from("users")
      .select("id, full_name, email, role, active, approval_status, is_demo_account, module_permissions")
      .eq("role", "expert")
      .eq("active", true)
      .order("full_name", { ascending: true })
      .limit(1000);
    if (error) return ownerJson({ ok: false, code: "INTERNAL", error: "Uzman listesi okunamadı." }, 500);
    const experts = ((data ?? []) as UserRow[]).map((u) => {
      const stones = !!u.module_permissions && (u.module_permissions as Record<string, unknown>).stones === true;
      const approved = String(u.approval_status ?? "").toLowerCase() === "approved";
      const demo = u.is_demo_account === true;
      return { id: u.id, name: u.full_name ?? "", email: u.email ?? "", stones, approved, demo, eligible: stones && approved && !demo };
    });
    return ownerJson({ ok: true, experts });
  });
}
