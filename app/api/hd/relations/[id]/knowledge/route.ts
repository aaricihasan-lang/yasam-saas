import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { getRelationAnalysis } from "@/lib/human-design/relations/relationService";
import { relationCentralKnowledge, relationKnowledge } from "@/lib/human-design/relations/relationExtras";
import { connectionExplanations, pentaExplanations } from "@/lib/human-design/relations/explanations";
import type { HdConnectionResult } from "@/lib/human-design/relations/connection";
import type { HdPentaResult } from "@/lib/human-design/relations/penta";

export const runtime = "nodejs";

/**
 * GET /api/hd/relations/:id/knowledge — analiz yorum kaynakları (salt-okuma; Roxy çağrısı YOK):
 *   analysis : Yaşam Sistemi Analiz Açıklamaları (kayıtlı, doğrulanmış sonuçtan)
 *   expert   : uzmanın KENDİ Bilgi Bankası eşleşmeleri (genel / kişiye ait bireysel ayrımıyla; tenant-scoped)
 *   central  : YALNIZ admin rolü — Merkezi Bilgi Bankası (yayınlanmış canonical). Normal uzmanda null.
 * Bu analiz türleri için hesaplama servisi metin yorumu döndürmez → "Sistem Yorumu" kaynağı yoktur (null).
 */
type RouteContext = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const rctx = { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account };
  const g = await getRelationAnalysis(rctx, id);
  if (!g.body.ok) return NextResponse.json(g.body, { status: g.status, headers: NO_STORE });
  const a = g.body.analysis;
  const names = a.participants.map((p) => p.name);
  const analysis = a.kind === "connection" ? connectionExplanations(a.result as HdConnectionResult, names[0], names[1]) : pentaExplanations(a.result as HdPentaResult, names);
  const k = await relationKnowledge(rctx, a, { forReport: false });
  if (!k.ok) return NextResponse.json({ ok: false, code: "KNOWLEDGE_READ_FAILED", error: "Bilgi Bankası okunamadı." }, { status: 500, headers: NO_STORE });
  const isAdmin = String(guard.profile?.role ?? "").trim().toLowerCase() === "admin";
  const central = isAdmin ? await relationCentralKnowledge(rctx, a) : null;
  return NextResponse.json(
    { ok: true, analysis, expert: k.groups, central: isAdmin ? (central && central.ok ? central.entries : []) : null, systemReading: null },
    { status: 200, headers: NO_STORE },
  );
}
