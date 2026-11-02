import { NextResponse, type NextRequest } from "next/server";
import { isHdDemoViewer } from "@/lib/human-design/demo/demoGate";
import { handleHdDemoRequest } from "@/lib/human-design/demo/demoService";

export const runtime = "nodejs";

/**
 * Human Design — DEMO HESABI salt okunur örnek görünümü (D3, owner kararı 2026-11-02).
 *
 * YALNIZ demo hesabı (users.is_demo_account=true, uzman, HD modülü + aktif üyelik) geçer; diğer herkes tek tip 404.
 * Gerçek HD uçları (/api/hd/**) DEĞİŞMEDİ — bu uç onların yerine geçmez, onları ÇAĞIRMAZ.
 * Yanıtlar yalnız depodaki önceden hazırlanmış sentetik örnektir (lib/human-design/demo); veritabanı, HD motoru ve ücretli
 * sağlayıcı bu dosyadan ve servisinden ERİŞİLEMEZ (statik test). Yazma / rapor / yeni hesaplama → 403 DEMO_READONLY.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;
const notFound = () => NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Bulunamadı." }, { status: 404, headers: NO_STORE });

async function handle(req: NextRequest): Promise<Response> {
  if (!(await isHdDemoViewer(req))) return notFound();
  const path = req.nextUrl.pathname.slice("/api/hd/demo/".length);
  let body: unknown = null;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
    }
  }
  const r = handleHdDemoRequest(req.method, path, req.nextUrl.searchParams, body);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
