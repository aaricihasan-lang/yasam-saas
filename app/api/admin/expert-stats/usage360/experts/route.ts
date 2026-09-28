/**
 * GET /api/admin/expert-stats/usage360/experts — Admin 360 uzman listesi.
 *
 * verifyAdminRequest (x-admin-id + x-session-token binding + role=admin) → service_role →
 * usage360_expert_list RPC (tek toplu sorgu; N+1 yok). Yalnız hesap meta verisi + telemetri
 * sayıları döner; uzmanın iş içeriği (danışan/not/rapor/form) ASLA okunmaz.
 * "Bugün" TR takvim günüdür (sunucu hesaplar).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { mapExpertRow } from "@/lib/admin/stats/usage360Api";
import { trDayOf } from "@/lib/admin/stats/usage360Period";
import type { Usage360ExpertsData } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";

const STATUS_ALLOW = new Set(["all", "active", "passive", "archive", "pending"]);
const SORT_ALLOW = new Set(["last_activity", "name", "last_login", "today_actions", "d7", "d30", "created_at"]);
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;
  const search = (sp.get("search") ?? "").trim().slice(0, 120) || null;
  const status = STATUS_ALLOW.has(sp.get("status") ?? "") ? (sp.get("status") as string) : "all";
  const sort = SORT_ALLOW.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "last_activity";
  const includeDemo = sp.get("includeDemo") === "true";
  const pageRaw = Number(sp.get("page") ?? 1);
  const sizeRaw = Number(sp.get("pageSize") ?? 25);
  if (!Number.isFinite(pageRaw) || pageRaw < 1 || pageRaw > 100000) {
    return NextResponse.json({ ok: false, error: "Geçersiz sayfa numarası." }, { status: 400, headers: NO_STORE });
  }
  const page = Math.floor(pageRaw);
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw >= 1 && sizeRaw <= 100 ? Math.floor(sizeRaw) : 25;
  const today = trDayOf(Date.now());

  const { data, error } = await db.rpc("usage360_expert_list", {
    p_search: search,
    p_status: status,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_include_demo: includeDemo,
    p_today: today,
  });
  if (error) {
    console.error("[usage360-admin] list failed", { code: (error as { code?: string }).code ?? null });
    return NextResponse.json({ ok: false, error: "Uzman listesi okunamadı." }, { status: 500, headers: NO_STORE });
  }
  const obj = (data ?? {}) as { total?: number; rows?: Record<string, unknown>[]; measurementStart?: string | null };
  const total = Number(obj.total ?? 0);
  const payload: { ok: true; contractVersion: 1; data: Usage360ExpertsData } = {
    ok: true,
    contractVersion: 1,
    data: {
      rows: (Array.isArray(obj.rows) ? obj.rows : []).map(mapExpertRow),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      today,
      measurementStart: obj.measurementStart ?? null,
      sort,
      status,
      includeDemo,
    },
  };
  return NextResponse.json(payload, { headers: NO_STORE });
}
