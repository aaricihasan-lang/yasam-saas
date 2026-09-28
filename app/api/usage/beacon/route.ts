import type { NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { handleUsageBeacon } from "@/lib/usage/beaconHandler";

/**
 * POST /api/usage/beacon — Usage360 istemci sinyali (ping / modül açılışı / istemci-içi
 * export / istemci hatası). Sözleşme ve güvenlik: lib/usage/beaconHandler.ts.
 * USAGE360_ENABLED kapalıyken her istek gövdesiz 204 (no-op).
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  return handleUsageBeacon(req, (r) => verifyUserRequest(r, { includeProfile: true }));
}
