// Doğaltaş Kütüphanesi · OWNER YÖNETİM API YARDIMCISI (YALNIZ SUNUCU).
// Her owner ucu: hazırlık kapısı + verifyAdminRequest + KATI owner (is_super_admin) → ardından owner RPC'si (DB owner'ı
// yeniden doğrular). Owner olmayan herkes (uzman / owner olmayan admin / anonim) tek tip 404 alır. Gövde boyutu sınırlı;
// DB hata kodları (SLxxx) owner'a anlaşılır kodla döner, iç ayrıntı / yığın izi dönmez.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { requireStoneLibraryOwner, STONE_LIBRARY_NO_STORE, type StoneLibraryGateDeps } from "./access";
import { StoneLibraryRpcError } from "./import/ownerRpc";

assertServerOnly("lib/stone-library/ownerApi");

export const OWNER_BODY_MAX = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OwnerCtx = { db: SupabaseClient; ownerId: string };

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function ownerJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: STONE_LIBRARY_NO_STORE });
}

export function ownerBadRequest(code: string, message: string, status = 400): NextResponse {
  return ownerJson({ ok: false, code, error: message }, status);
}

const CODE_STATUS: Record<string, number> = { SL001: 404, SL023: 409, SL026: 409, SL028: 409, SL029: 409, SL050: 409, SL051: 409, SL052: 409,
  SL055: 409, SL065: 409, SL073: 409, SL087: 409, "23505": 409,
  // F3: kaynak verisi koruması / görsel–taş eşleşmesi / yayın hazırlığı / durum geçişi
  SL037: 409, SL038: 409, SL039: 409, SL089: 409, SL090: 409, SL091: 409, SL093: 409, SL094: 409 };

/** Owner ucu sarmalayıcısı. */
export async function withOwner(req: NextRequest, fn: (ctx: OwnerCtx) => Promise<Response>, deps: StoneLibraryGateDeps = {}): Promise<Response> {
  const gate = await requireStoneLibraryOwner(req, deps);
  if (!gate.ok) return gate.response;
  try {
    return await fn({ db: gate.ctx.db, ownerId: gate.ctx.ownerId });
  } catch (e) {
    if (e instanceof StoneLibraryRpcError) {
      return ownerBadRequest(e.code, e.message.replace(/^.*?(stone_library[^:]*: )/, "$1").slice(0, 300), CODE_STATUS[e.code] ?? 400);
    }
    if (e instanceof OwnerInputError) return ownerBadRequest("INPUT", e.message);
    return ownerBadRequest("INTERNAL", "İşlem tamamlanamadı.", 500);
  }
}

export class OwnerInputError extends Error {}

/** JSON gövdesi (en çok 64 KB, nesne olmalı). */
export async function readOwnerBody(req: NextRequest): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > OWNER_BODY_MAX) throw new OwnerInputError("Gövde çok büyük.");
  const text = await req.text();
  if (text.length > OWNER_BODY_MAX) throw new OwnerInputError("Gövde çok büyük.");
  let v: unknown;
  try {
    v = text ? JSON.parse(text) : {};
  } catch {
    throw new OwnerInputError("Geçersiz JSON.");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new OwnerInputError("Gövde nesne olmalı.");
  return v as Record<string, unknown>;
}

export function pickString(o: Record<string, unknown>, k: string, max = 2000): string | null {
  const v = o[k];
  if (v == null) return null;
  if (typeof v !== "string" || v.length > max) throw new OwnerInputError(`${k} geçersiz.`);
  return v;
}

export function pickUuid(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (!isUuid(v)) throw new OwnerInputError(`${k} geçersiz.`);
  return v;
}

export function pickEnum<T extends string>(o: Record<string, unknown>, k: string, allowed: readonly T[]): T {
  const v = o[k];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new OwnerInputError(`${k} geçersiz.`);
  return v as T;
}

export function pickObject(o: Record<string, unknown>, k: string): Record<string, unknown> {
  const v = o[k];
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new OwnerInputError(`${k} nesne olmalı.`);
  return v as Record<string, unknown>;
}
