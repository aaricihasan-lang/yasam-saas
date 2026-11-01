/**
 * KİŞİSEL DİJİTAL OFİS — uçların ortak HTTP yardımcıları (YALNIZ SUNUCU).
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { isDemoTenantId } from "@/lib/auth/demoServerGuard";
import { BODY_MAX_BYTES } from "./catalog";
import { workspaceAccess } from "./access";
import { isWorkspaceDesignEnabled } from "./flags";
import type { Owner } from "./service";

assertServerOnly("lib/workspace/http");

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Bayrak kapalıyken uç YOK gibi davranır (özelliğin varlığı sızdırılmaz). */
export function disabledResponse(): NextResponse {
  return json({ ok: false, error: "Bulunamadı." }, 404);
}

export type WorkspaceGuard =
  | { ok: true; owner: Owner; db: SupabaseClient }
  | { ok: false; response: Response };

/**
 * Bayrak + kimlik + kullanıcı bazlı açılış + (yazmada) demo kontrolü. tenant/user YALNIZ oturumdan gelir.
 * Açılış listesinde olmayan kullanıcı bayrak kapalıymış gibi 404 alır (özelliğin varlığı sızdırılmaz).
 * Demo: hesap bayrağı VEYA demo tenant → yazma 403 (DB'ye hiçbir şey yazılmaz).
 */
export async function guardWorkspace(req: NextRequest, mode: "read" | "write"): Promise<WorkspaceGuard> {
  if (!isWorkspaceDesignEnabled()) return { ok: false, response: disabledResponse() };
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return { ok: false, response: guard.response };
  const { userId, tenantId, db, is_demo_account } = guard;
  if (!userId || !tenantId) return { ok: false, response: json({ ok: false, error: "Hesap bilgisi eksik." }, 403) };
  const access = await workspaceAccess(db, userId, tenantId);
  if (!access.allowed) return { ok: false, response: access.reason === "error" ? json({ ok: false, error: "Erişim doğrulanamadı." }, 503) : disabledResponse() };
  if (mode === "write" && (is_demo_account || (await isDemoTenantId(tenantId, db)))) return { ok: false, response: demoReadOnlyResponse() };
  return { ok: true, owner: { tenantId, userId }, db };
}

/** Boyut sınırlı JSON gövdesi. */
export async function readJson(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > BODY_MAX_BYTES) return { ok: false, response: json({ ok: false, error: "İstek gövdesi çok büyük." }, 413) };
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, response: json({ ok: false, error: "Geçersiz istek gövdesi." }, 400) };
  }
  if (Buffer.byteLength(raw, "utf8") > BODY_MAX_BYTES) return { ok: false, response: json({ ok: false, error: "İstek gövdesi çok büyük." }, 413) };
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("not-object");
    return { ok: true, body: v as Record<string, unknown> };
  } catch {
    return { ok: false, response: json({ ok: false, error: "Geçersiz istek gövdesi." }, 400) };
  }
}

export function onlyKeys(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const k of Object.keys(body)) if (!allowed.includes(k)) return k;
  return null;
}
