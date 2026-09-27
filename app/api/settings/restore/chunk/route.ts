import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { restoreContextFrom } from "@/lib/backup/guardContext";
import { handleRestoreChunk } from "@/lib/backup/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/restore/chunk  — body: `{ table, rows }` (≤ 400 satır; istemci 200'lük parça gönderir)
 *
 * Tek parça geri yükleme (lib/backup/engine.ts restoreChunk):
 *  - sınıf + lisans + üyelik kontrolü (lisanssız → skipped_unlicensed),
 *  - kolon izin listesi projeksiyonu (generated kolonlar asla yazılmaz),
 *  - tenant_id / kullanıcı kolonları sunucuda zorlanır,
 *  - FK ebeveyni aynı tenant'ta olmalı (parent_missing), storage yolu tenant önekli olmalı,
 *  - toplu `upsert(..., { ignoreDuplicates: true })` — yalnız eksikler eklenir; UPDATE/DELETE YOK.
 * Yanıt: `{ ok, report: { expected, inserted, already_present, skipped_unlicensed, parent_missing, failed[] … } }`
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }
  try {
    const result = await handleRestoreChunk(guard.db, restoreContextFrom(guard), body);
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[settings/restore/chunk]", err);
    return NextResponse.json({ error: "Parça işlenemedi." }, { status: 500 });
  }
}
