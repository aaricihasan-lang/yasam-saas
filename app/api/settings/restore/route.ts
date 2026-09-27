import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { restoreContextFrom } from "@/lib/backup/guardContext";
import { handleFullRestore, handleRestorePlan } from "@/lib/backup/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/restore
 *
 * İki biçim:
 *  1. `{ mode: "plan", version, source_tenant_id, tables: { <tablo>: <satır sayısı> } }`
 *     → tablo kararları (topolojik sıra; lisanssız / bilinmeyen / dışlanan tablolar gerekçeyle atlanır).
 *     Ayarlar sayfası bunu alıp satırları `POST /api/settings/restore/chunk` ile parça parça gönderir.
 *  2. `{ backup }` (eski istemci / küçük dosya) → aynı motorla sunucuda parça parça işlenir.
 *
 * Kabul edilen sürümler: 1.0, 2.0, 2.1, 3.0. Bilinmeyen tablo (ör. 2.1'deki support_messages
 * yalnız-dışa-aktarım) 400 DEĞİL → uyarı + atla.
 * Anlam: yalnız EKSİK kayıt eklenir; mevcut kayıt değiştirilmez/silinmez; tekrar çalıştırılabilir.
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

  const ctx = restoreContextFrom(guard);
  try {
    const result =
      body.mode === "plan" ? handleRestorePlan(ctx, body) : await handleFullRestore(guard.db, ctx, body.backup);
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[settings/restore]", err);
    return NextResponse.json({ error: "Geri yükleme işlenemedi." }, { status: 500 });
  }
}
