import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { HD_FILE_PART_BYTES, listHdBackupFiles, readHdBackupFilePart } from "@/lib/backup/hdFiles";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/settings/backup/files                 → yedeğe girecek HD dosyalarının listesi
 * GET /api/settings/backup/files?path=…&part=N   → dosyanın N. parçası (base64) + boyut + SHA-256
 *
 * P2-11: Human Design harita görselleri + profesyonel rapor görsel snapshot'ları yedeğe dahil.
 * Tenant oturumdan; yalnız bu tenant'ın DB satırlarının referans verdiği yollar okunur. Parça
 * boyutu Vercel yanıt sınırının altında tutulur. Üyelik kapısı YOK (kendi verisini dışa aktarma).
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  const path = params.get("path");
  try {
    if (!path) {
      const list = await listHdBackupFiles(guard.db, guard.tenantId);
      if (list.error) return NextResponse.json({ ok: false, error: "Dosya listesi okunamadı." }, { status: 500, headers: NO_STORE });
      return NextResponse.json({ ok: true, part_bytes: HD_FILE_PART_BYTES, files: list.files }, { status: 200, headers: NO_STORE });
    }
    const part = Number(params.get("part") ?? "0");
    const res = await readHdBackupFilePart(guard.db, guard.tenantId, path, part);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status, headers: NO_STORE });
    return NextResponse.json(res, { status: 200, headers: NO_STORE });
  } catch (err) {
    console.error("[settings/backup/files]", err);
    return NextResponse.json({ ok: false, error: "Dosya okunamadı." }, { status: 500, headers: NO_STORE });
  }
}
