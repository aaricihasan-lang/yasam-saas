/**
 * GİRİŞ GÜVENLİĞİ F2-C — güvenilir cihaz sunucu yardımcıları (yalnız API route).
 * İmzalı cihaz isteği: cihaz kaydını (yalnız owner_approved/active) DB'den okur, açık anahtarla
 * imzayı doğrular. Doğrulanmamış hiçbir istek cihaz RPC'lerine ulaşmaz.
 */
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFreshTimestamp, parseDevicePublicKey, verifyDeviceSignature } from "@/lib/auth/deviceSignature";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

export type DeviceRecord = { userId: string; state: "owner_approved" | "active" };

export async function loadDeviceRecordWithKey(
  db: SupabaseClient,
  deviceId: string,
): Promise<{ record: DeviceRecord; verify: (message: string, signature: unknown) => boolean } | null> {
  if (!isMfaChallengeId(deviceId)) return null;
  const { data, error } = await db.rpc("auth_device_public_key", { p_device_id: deviceId });
  if (error || !data || typeof data !== "object") return null;
  const r = data as { public_key_spki?: unknown; state?: unknown; user_id?: unknown };
  const key = parseDevicePublicKey(r.public_key_spki);
  if (!key || (r.state !== "owner_approved" && r.state !== "active") || !isMfaChallengeId(r.user_id)) return null;
  return {
    record: { userId: String(r.user_id), state: r.state },
    verify: (message, signature) => verifyDeviceSignature(key.key, message, signature),
  };
}

/** Cihaz uçları için IP başına ortak sınır (imza doğrulaması CPU'su + kaba kuvvet). */
export async function deviceRateLimited(db: SupabaseClient, req: NextRequest, scope: string, limit: number, windowSec: number) {
  const hit = await hitDbRateLimit(db, rateLimitBucket(scope, extractClientIp(req.headers)), limit, windowSec);
  return hit.allowed ? null : Math.max(1, hit.retryAfterSec);
}

export { isFreshTimestamp };
