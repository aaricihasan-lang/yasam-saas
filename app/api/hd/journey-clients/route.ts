import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { searchJourneyClients } from "@/lib/human-design/api/journeyLink";

export const runtime = "nodejs";

/**
 * GET /api/hd/journey-clients?search= — Human Design çalışma alanı için merkezî danışan seçici.
 *
 *   - human_design izni YETERLİ (Danışan Yolculuğu modül izni gerekmez — ürün kararı 3).
 *   - tenant SUNUCUDA oturumdan; istemciden tenant kabul edilmez → başka tenant listelenemez.
 *   - Yanıt yalnız id / ad / soyad / dogum (+ bağlı HD profil kimliği). Telefon/not vb. YOK.
 *   - Salt okuma (demo hesap da okuyabilir; yazma uçları demoda kapalı).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").slice(0, 100);
  const { rows, error } = await searchJourneyClients(guard.db, guard.tenantId, search);
  if (error) return NextResponse.json({ ok: false, code: "DB_ERROR", error: "Danışanlar yüklenemedi." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
}
