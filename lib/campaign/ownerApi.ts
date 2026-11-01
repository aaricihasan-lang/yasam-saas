/**
 * KAMPANYA MERKEZİ — Owner API kapısı (YALNIZ SUNUCU).
 *
 * Sıra: verifyAdminRequest (admin oturumu + token bağı + CSRF çerez denetimi) → katı owner denetimi (is_super_admin + admin +
 * aktif + demo değil; e-posta fallback YOK) → yazmalarda ek aynı-köken denetimi. Owner olmayan HER istek, mevcut owner yüzeyleri
 * gibi aynı 404 gövdesini alır (yüzeyin varlığı açığa çıkmaz). Admin olmak tek başına yeterli DEĞİLDİR.
 * actorId yalnız doğrulanmış admin kimliğinden gelir; istemci gövdesinden asla alınmaz. DB her RPC'de aynı denetimi yineler.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyAdminRequest, type AdminGuardResult } from "@/lib/auth/adminGuard";
import { checkSameOriginRequest } from "@/lib/security/csrf";
import { isCampaignOwner } from "./adminService";

assertServerOnly("lib/campaign/ownerApi");

export const CAMPAIGN_NO_STORE = { "Cache-Control": "no-store, private" } as const;
export const CAMPAIGN_BODY_MAX = 64 * 1024;

export type CampaignOwnerDeps = { verifyAdmin?: (req: NextRequest) => Promise<AdminGuardResult> };
export type CampaignOwnerCtx = { db: SupabaseClient; actorId: string };

export function campaignJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CAMPAIGN_NO_STORE });
}
export const campaignNotFound = () => campaignJson({ ok: false, error: "Bulunamadı." }, 404);

/** Owner değilse null (çağıran campaignNotFound döner). */
export async function requireCampaignOwner(req: NextRequest, deps: CampaignOwnerDeps = {}): Promise<CampaignOwnerCtx | null> {
  let guard: AdminGuardResult;
  try {
    guard = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
  } catch {
    return null;
  }
  if (!guard.ok) return null;
  const db = guard.db as SupabaseClient;
  if (!(await isCampaignOwner(db, guard.adminId))) return null;
  return { db, actorId: guard.adminId };
}

/** Yazma isteği gövdesi: aynı köken, application/json, ≤ 64 KB, nesne. Hata → { error, status }. */
export async function readCampaignBody(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const origin = checkSameOriginRequest(req.headers);
  if (!origin.ok) return { ok: false, status: 404, error: "Bulunamadı." };
  if (!String(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return { ok: false, status: 415, error: "JSON gövde gerekli." };
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > CAMPAIGN_BODY_MAX) return { ok: false, status: 413, error: "İstek çok büyük." };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: "Gövde okunamadı." };
  }
  if (Buffer.byteLength(text, "utf8") > CAMPAIGN_BODY_MAX) return { ok: false, status: 413, error: "İstek çok büyük." };
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, status: 400, error: "Geçersiz gövde." };
    return { ok: true, body: v as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Geçersiz JSON." };
  }
}
