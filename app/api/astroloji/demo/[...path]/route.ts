import { NextResponse, type NextRequest } from "next/server";
import { ASTRO_NO_STORE, astrologyNotFoundResponse } from "@/lib/astrology/access/ownerGate";
import { isAstrologyDemoViewer } from "@/lib/astrology/demo/demoGate";
import { handleAstrologyDemoRequest } from "@/lib/astrology/demo/demoService";

export const runtime = "nodejs";

/**
 * Gökyüzü Atlası — DEMO HESABI salt okunur örnek görünümü (D8, owner kararı 2026-11-01).
 *
 * YALNIZ demo hesabı (users.is_demo_account=true, uzman, aktif Premium) geçer; diğer herkes tek tip 404. Gerçek Atlas uçları
 * (/api/astroloji/**) demo hesabına KAPALI kalır — bu uç onların yerine geçmez, onları ÇAĞIRMAZ.
 * Yanıtlar yalnız depodaki önceden hesaplanmış sentetik örnektir (lib/astrology/demo); veritabanı, motor ve ücretli sağlayıcı
 * bu dosyadan ve servisinden ERİŞİLEMEZ (statik test). Yazma / rapor / yeni hesaplama → 403 DEMO_READONLY.
 */
async function handle(req: NextRequest): Promise<Response> {
  if (!(await isAstrologyDemoViewer(req))) return astrologyNotFoundResponse();
  const path = req.nextUrl.pathname.slice("/api/astroloji/demo/".length);
  let body: unknown = null;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: ASTRO_NO_STORE });
    }
  }
  const r = handleAstrologyDemoRequest(req.method, path, req.nextUrl.searchParams, body);
  return NextResponse.json(r.body, { status: r.status, headers: ASTRO_NO_STORE });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
