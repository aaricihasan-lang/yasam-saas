import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { EduControlError, getControlOverview, setCatalogOpen, setSubjectScope } from "@/lib/human-design/education/educationControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string, code?: string) => NextResponse.json({ ok: false, error, code }, { status, headers: EDU_NO_STORE });
const text = (v: unknown, min: number, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length >= min && t.length <= max ? t : null;
};

/**
 * Owner kararı 31.10.2026 — Eğitim Merkezi açılış / yayın yönetimi. YALNIZ platform owner (diğer herkes tek tip 404).
 *   GET  → açılış özeti (aktif kişi, hukuk, teknik doğrulama, yayın, biyografi, yetkili uzman, katalog anahtarı, kapsam dışı)
 *   POST { action: "catalog", open: boolean, reason }                      → global uzman kataloğu aç / kapat
 *   POST { action: "scope", subjectId, archived: boolean, reason }         → kişiyi kapsam dışı bırak / geri al (silme yok)
 * Aktör = oturum token'ıyla doğrulanmış owner (gövdeden aktör ALINMAZ). DB RPC aktörü yeniden doğrular.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json({ ok: true, data: await getControlOverview(gate.ctx.db, gate.ctx.ownerId) }, { headers: EDU_NO_STORE });
  } catch {
    return fail(500, "Açılış durumu okunamadı.");
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  let b: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return fail(413, "İstek çok büyük.");
    const j = JSON.parse(raw) as unknown;
    b = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  } catch {
    return fail(400, "Geçerli JSON gövdesi gerekli.");
  }
  const reason = text(b.reason, 5, 2000);
  if (!reason) return fail(400, "Gerekçe zorunlu (en az 5 karakter).", "ED010");
  try {
    if (b.action === "catalog" && typeof b.open === "boolean") await setCatalogOpen(gate.ctx.db, gate.ctx.ownerId, b.open, reason);
    else if (b.action === "scope" && typeof b.subjectId === "string" && typeof b.archived === "boolean") await setSubjectScope(gate.ctx.db, gate.ctx.ownerId, b.subjectId, b.archived, reason);
    else return fail(400, "Geçersiz işlem.");
    return NextResponse.json({ ok: true }, { headers: EDU_NO_STORE });
  } catch (e) {
    return e instanceof EduControlError ? fail(e.status, e.message, e.code) : fail(500, "İşlem tamamlanamadı.");
  }
}
