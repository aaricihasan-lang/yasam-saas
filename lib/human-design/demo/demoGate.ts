import "server-only";
import type { NextRequest } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { requireModuleAccess } from "@/lib/auth/userGuard";

assertServerOnly("lib/human-design/demo/demoGate");

/**
 * Human Design DEMO GÖRÜNÜMÜ kapısı (D3, owner kararı 2026-11-02).
 *
 * Gerçek HD uçlarının kapısı DEĞİŞMEDİ. Bu kapı YALNIZ demo örnek görünümü (/api/hd/demo/**) içindir. Sırayla:
 *   1) yol /api/hd/demo/ altında;
 *   2) gerçek HD modül kapısı (requireModuleAccess "human_design": oturum↔kullanıcı bağı, aktif + onaylı, üyelik, modül izni);
 *   3) users.is_demo_account === true (sunucuda, her istekte DB'den);
 *   4) rol uzman (admin / başka rol geçmez).
 * Geçen istek yalnız depodaki sentetik örneği görür (lib/human-design/demo/demoService) — tenant verisi OKUNMAZ.
 * Red dallarının hepsi çağıranın tek tip 404'ünü kullanır (demo görünümünün varlığı / red nedeni sızmaz).
 */
export type HdDemoViewerDeps = {
  guard?: (req: NextRequest) => ReturnType<typeof requireModuleAccess>;
};

export async function isHdDemoViewer(req: NextRequest, deps: HdDemoViewerDeps = {}): Promise<boolean> {
  if (!req.nextUrl.pathname.startsWith("/api/hd/demo/")) return false;
  let guard: Awaited<ReturnType<typeof requireModuleAccess>>;
  try {
    guard = await (deps.guard ?? ((r) => requireModuleAccess(r, "human_design")))(req);
  } catch {
    return false;
  }
  if (!guard.ok || guard.is_demo_account !== true) return false;
  return String(guard.profile?.role ?? "").trim().toLowerCase() === "expert";
}
