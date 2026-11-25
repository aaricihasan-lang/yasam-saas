import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { buildReadableExport } from "@/lib/backup/readableExport";
import { readableViewFor } from "@/lib/backup/readableView";
import { resolveOutputLocale } from "@/lib/i18n/output";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/settings/export — Okunabilir Word arşivi (FA-32).
 * Body: `{ module: "<registry modül anahtarı>" | "all" }` (eski anahtarlar: dogaltas, bioenerji … kabul edilir)
 *
 * - Kapsam registry'den (JSON yedeğiyle aynı tablolar); keyset sayfalama ile TAM okuma.
 * - Tam metin (kısaltma yok), kayıt başına alan/değer blokları, UUID'ler etiketli.
 * - Okuma hatası / eksik tablo belgede kırmızı bölümde ve `X-Export-Incomplete` başlığında.
 * - Boyut bütçesi aşılırsa 413 + "modül bazlı indirin" (belge sessizce kırpılmaz).
 * - OKUNABİLİR çıktı ekran yetki kuralına uyar (A3 / QA-N-01): Numeroloji "Gelecek Yılları Göster" ve HD Sistem
 *   Yorumu yetkisi sunucuda doğrulanmış profilden okunur; yetkisizse görüntüleme kopyası süzülür (lib/backup/readableView).
 * Üyelik kapısı YOK (kendi verisini dışa aktarma hakkı). İş mantığı: lib/backup/readableExport.
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }
  const { tenantId, db, userId } = guard;

  let body: { module?: unknown };
  try {
    body = (await req.json()) as { module?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const now = new Date();
  // Belge sistem metinleri ekran dilinde (A16; ekranla aynı çerez + yayın kapısı). TR → bugünkü belge bayt-bayt aynı.
  const locale = resolveOutputLocale(req).locale;
  const out = await buildReadableExport({ db, tenantId, userId, module: body?.module, view: readableViewFor(guard.profile, now), now, locale });
  if (out.kind === "json") return NextResponse.json(out.body, { status: out.status });
  return new NextResponse(new Uint8Array(out.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${out.fileName}"`,
      "Cache-Control": "no-store",
      "X-Export-Incomplete": out.incomplete ? "1" : "0",
      "X-Export-Records": String(out.records),
      "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Incomplete, X-Export-Records",
    },
  });
}
