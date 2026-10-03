import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { restoreContextFrom } from "@/lib/backup/guardContext";
import { commitHdRestoreFile, planHdFileRestore, storeHdRestorePart } from "@/lib/backup/hdFiles";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/settings/restore/files
 *   { mode:"plan",   files:[{bucket,path,size,sha256}] } → her dosya için upload | exists | skip
 *   { mode:"part",   path, upload_id, index, data_base64 } → parçayı geçici yola yaz
 *   { mode:"commit", path, upload_id, parts, size, sha256 } → birleştir + doğrula + nihai yola yaz
 *
 * P2-11: HD dosyalarının geri yüklenmesi. Yol tenant önekli olmalı (başka tenant → skip),
 * modül lisansı (human_design) gerekli, mevcut dosyanın üzerine YAZILMAZ, boyut + SHA-256
 * doğrulanmadan nihai dosya oluşmaz.
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }
  const ctx = restoreContextFrom(guard);
  try {
    if (body.mode === "plan") {
      const files = Array.isArray(body.files) ? (body.files as Record<string, unknown>[]) : [];
      const decisions = await planHdFileRestore(guard.db, ctx, files);
      return NextResponse.json({ ok: true, decisions }, { status: 200, headers: NO_STORE });
    }
    if (body.mode === "part") {
      const r = await storeHdRestorePart(guard.db, ctx, body);
      return NextResponse.json({ ok: r.ok, error: r.error }, { status: r.status, headers: NO_STORE });
    }
    if (body.mode === "commit") {
      const r = await commitHdRestoreFile(guard.db, ctx, body);
      return NextResponse.json({ ok: r.ok, result: r.result, error: r.error }, { status: r.status, headers: NO_STORE });
    }
    return NextResponse.json({ ok: false, error: "Geçersiz mod." }, { status: 400 });
  } catch (err) {
    console.error("[settings/restore/files]", err);
    return NextResponse.json({ ok: false, error: "Dosya işlenemedi." }, { status: 500 });
  }
}
