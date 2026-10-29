import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, eduNotFound } from "@/lib/human-design/education/educationAccess";
import { EduStoreError } from "@/lib/human-design/education/educationStore";
import { TRAINING_ACCESS_LABEL, readTrainingAccess, requireTrainingAccessOwner, setTrainingAccess } from "@/lib/human-design/education/educationTrainingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin → Kullanıcı → Modül İzinleri · "Human Design Eğitim Haritaları" TEK anahtarı (FAZ 8).
 * YALNIZ gerçek owner; diğer herkese (normal admin dahil) aynı 404 → anahtar hiç çizilmez.
 *   GET  ?userId=<uuid>                → { enabled, eligible, reason, grantedAt }
 *   POST { userId, enabled: boolean }  → merkezî yetki RPC'leri (tek kaynak); kapatma veri silmez.
 */
const ERR: Record<string, [number, string]> = {
  ED003: [400, "Owner kendine yetki veremez."],
  ED004: [404, "Kullanıcı bulunamadı."],
  ED005: [400, "Bu kullanıcıya verilemez: aktif, onaylı, demo olmayan ve Human Design izni olan uzman olmalı."],
  ED006: [409, "Yetki zaten açık."],
  ED008: [409, "Yetki zaten kapalı."],
};

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  try {
    const st = await readTrainingAccess(gate.db, new URL(req.url).searchParams.get("userId") ?? "");
    if (!st) return eduNotFound();
    return NextResponse.json({ ok: true, label: TRAINING_ACCESS_LABEL, access: st }, { headers: EDU_NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "Yetki durumu okunamadı." }, { status: 500, headers: EDU_NO_STORE });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  let b: { userId?: unknown; enabled?: unknown };
  try { b = (await req.json()) as typeof b; } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: EDU_NO_STORE }); }
  if (typeof b.userId !== "string" || typeof b.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "userId ve enabled zorunlu." }, { status: 400, headers: EDU_NO_STORE });
  }
  try {
    const st = await setTrainingAccess(gate.db, gate.ownerId, b.userId, b.enabled);
    return NextResponse.json({ ok: true, access: st }, { headers: EDU_NO_STORE });
  } catch (e) {
    const code = e instanceof EduStoreError ? e.code : "DB_ERROR";
    if (code === "ED004") return eduNotFound();
    const [status, msg] = ERR[code] ?? [500, "İşlem tamamlanamadı."];
    return NextResponse.json({ ok: false, code, error: msg }, { status, headers: EDU_NO_STORE });
  }
}
