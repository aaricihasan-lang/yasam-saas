import "server-only";
import type { NextRequest } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyUserRequest, type UserGuardResult } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { isAstrologyModuleEnabled } from "../config";

assertServerOnly("lib/astrology/demo/demoGate");

/**
 * Gökyüzü Atlası DEMO GÖRÜNÜMÜ kapısı (D8, owner kararı 2026-11-01).
 *
 * Gerçek Atlas uçlarının kapısı (requireAstrologyAccess) DEĞİŞMEDİ: demo hesabı orada DEMO_DENIED ile tek tip 404 alır.
 * Bu kapı YALNIZ demo örnek görünümü (/api/astroloji/demo/**) ve erişim yoklamasındaki demo dalı içindir. Sırayla:
 *   1) yol uzman yüzeyi (/api/astroloji/…); admin kabuğu yolu hiç geçmez;
 *   2) kill switch açık (ASTROLOGY_MODULE_ENABLED);
 *   3) oturum↔kullanıcı bağı doğrulanmış (verifyUserRequest; HttpOnly taşıma dahil, pasif/onaysız hesap reddedilir);
 *   4) users.is_demo_account === true (sunucuda, her istekte DB'den);
 *   5) rol uzman (admin / başka rol geçmez) + üyelik kapısı (aktif + onaylı + Premium).
 * Geçen istek yalnız depodaki sentetik örneği görür (lib/astrology/demo/demoService) — tenant verisi OKUNMAZ.
 * Tüm red dalları çağıranın tek tip 404'ünü kullanır (modülün varlığı / red nedeni sızmaz).
 */
export type AstrologyDemoViewerDeps = {
  env?: NodeJS.ProcessEnv;
  verify?: (req: NextRequest) => Promise<UserGuardResult>;
};

export async function isAstrologyDemoViewer(req: NextRequest, deps: AstrologyDemoViewerDeps = {}): Promise<boolean> {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/astroloji/")) return false;
  if (!isAstrologyModuleEnabled(deps.env)) return false;
  let guard: UserGuardResult;
  try {
    guard = await (deps.verify ?? ((r) => verifyUserRequest(r, { includeProfile: true })))(req);
  } catch {
    return false;
  }
  if (!guard.ok || guard.is_demo_account !== true) return false;
  const profile = guard.profile ?? {};
  if (String(profile.role ?? "").trim().toLowerCase() !== "expert") return false;
  return hasMembershipAccessForRow(profile);
}
