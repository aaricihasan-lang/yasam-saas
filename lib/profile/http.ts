/**
 * UZMAN PROFİLİ (F1) — uç yardımcıları (YALNIZ SUNUCU).
 * Kimlik: verifyUserRequest (x-user-id + oturum belirteci; onaysız / pasif hesap reddedilir). tenant / user YALNIZ oturumdan.
 * Yazma: TRIAL7 kısıtı + demo hesap / demo tenant → 403 (DB'ye hiçbir şey yazılmaz).
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { trialWriteDenied, verifyUserRequest } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { isDemoTenantId } from "@/lib/auth/demoServerGuard";
import { PROFILE_BODY_MAX_BYTES } from "./schema";
import type { Owner } from "./service";

assertServerOnly("lib/profile/http");

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export type Account = { fullName: string | null; email: string | null };
export type ProfileGuard =
  | { ok: true; owner: Owner; db: SupabaseClient; account: Account; readOnly: boolean }
  | { ok: false; response: Response };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function guardProfile(req: NextRequest, mode: "read" | "write"): Promise<ProfileGuard> {
  // includeProfile: ad soyad + e-posta aynı (mevcut, değişmeyen) users sorgusundan gelir; ek users sorgusu yok.
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return { ok: false, response: guard.response };
  const { userId, tenantId, db } = guard;
  if (!userId || !tenantId) return { ok: false, response: json({ ok: false, error: "Hesap bilgisi eksik." }, 403) };
  const p = guard.profile ?? {};
  const account: Account = { fullName: str(p.full_name) ?? str(p.name), email: str(p.email) ?? str(guard.email) };
  const demo = guard.is_demo_account || (await isDemoTenantId(tenantId, db));
  if (mode === "write") {
    const trialDenied = trialWriteDenied(guard.profile);
    if (trialDenied) return { ok: false, response: trialDenied };
    if (demo) return { ok: false, response: demoReadOnlyResponse() };
  }
  return { ok: true, owner: { tenantId, userId }, db, account, readOnly: demo };
}

/** Boyut sınırlı JSON nesne gövdesi. */
export async function readJsonObject(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > PROFILE_BODY_MAX_BYTES) return { ok: false, response: json({ ok: false, error: "İstek gövdesi çok büyük." }, 413) };
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, response: json({ ok: false, error: "Geçersiz istek gövdesi." }, 400) };
  }
  if (Buffer.byteLength(raw, "utf8") > PROFILE_BODY_MAX_BYTES) return { ok: false, response: json({ ok: false, error: "İstek gövdesi çok büyük." }, 413) };
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("not-object");
    return { ok: true, body: v as Record<string, unknown> };
  } catch {
    return { ok: false, response: json({ ok: false, error: "Geçersiz istek gövdesi." }, 400) };
  }
}
