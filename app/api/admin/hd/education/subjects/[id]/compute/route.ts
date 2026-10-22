import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { EDU_NO_STORE, requireEducationOwner } from "@/lib/human-design/education/educationAccess";
import { computeEducationChart } from "@/lib/human-design/education/educationCompute";
import { callRoxyBodygraph } from "@/lib/human-design/providers/roxy/client";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { strictUtf8 } from "@/lib/human-design/education/canonicalJson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/hd/education/subjects/[id]/compute — YALNIZ platform owner, açık eylem.
 * Ücretli çağrı kapısı (HD_EDUCATION_PROVIDER_CALLS_ENABLED) KAPALIYSA dış istek YOK (409 PROVIDER_DISABLED).
 * Aynı istek için kayıtlı snapshot varsa yeniden kullanılır (çağrı yok). Otomatik tekrar YOK.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireEducationOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const r = await computeEducationChart({ db: gate.ctx.db, ownerId: gate.ctx.ownerId }, String(id ?? ""), {
    config: readRoxyServerConfig(),
    // Gövde, mevcut istemcinin fetchImpl kancasıyla parse ÖNCESİ bayt olarak yakalanır (istemci kodu değişmez).
    callRoxy: async (c, b, o) => {
      let bodyText: string | null = null;
      const r = await callRoxyBodygraph(c, b, {
        ...o,
        fetchImpl: async (u, init) => {
          const res = await fetch(u, init);
          bodyText = strictUtf8(new Uint8Array(await res.clone().arrayBuffer()));
          return res;
        },
      });
      return r.ok ? { ...r, bodyText } : r;
    },
    rateLimit: async (scope, limit, win, key) => hitDbRateLimit(gate.ctx.db, rateLimitBucket(scope, key ?? "platform"), limit, win),
  });
  return NextResponse.json(r.body, { status: r.status, headers: EDU_NO_STORE });
}
