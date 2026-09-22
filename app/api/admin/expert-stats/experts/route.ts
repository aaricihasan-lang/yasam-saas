import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { MODULE_USAGE_KEYS } from "@/lib/admin/stats/moduleUsageRegistry";
import type { ExpertListRow, ExpertsData } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";

const STATUS_ALLOW = new Set(["all", "active", "passive", "archive", "pending"]);
const SORT_ALLOW = new Set(["last_login", "created_at", "name"]);

/**
 * GET /api/admin/expert-stats/experts
 *   ?search=&status=all|active|passive|archive|pending&sort=last_login|created_at|name
 *   &page=1&pageSize=25&includeDemo=false
 *
 * FAZ 2 — SAYFALI uzman listesi + TOPLU oturum özeti. `expert_list` RPC ile tek DB
 * round-trip (uzman başına AYRI activity çağrısı YOK). Demo default HARİÇ. lastSeenAt
 * heartbeat tabanlı (~yaklaşık — UI'da belirtilir).
 *
 * GİZLİLİK: ad/e-posta yönetici ekranı için GEREKLİ kişisel alanlardır (admin bunları
 * zaten görür) → "yanıtta hiç kişisel veri yok" DENMEZ. Ancak token/oturum sırrı/analiz
 * içeriği/dosya adı/parola gibi GEREKSİZ veya hassas alanlar yanıt/log'a GİRMEZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;
  const search = (sp.get("search") ?? "").trim().slice(0, 120) || null;
  const status = STATUS_ALLOW.has(sp.get("status") ?? "") ? (sp.get("status") as string) : "all";
  const sort = SORT_ALLOW.has(sp.get("sort") ?? "") ? (sp.get("sort") as string) : "last_login";
  const includeDemo = sp.get("includeDemo") === "true";
  const pageRaw = Number(sp.get("page") ?? 1);
  const sizeRaw = Number(sp.get("pageSize") ?? 25);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw >= 1 && sizeRaw <= 100 ? Math.floor(sizeRaw) : 25;
  const offset = (page - 1) * pageSize;

  const { data, error } = await db.rpc("expert_list", {
    p_search: search,
    p_status: status,
    p_sort: sort,
    p_limit: pageSize,
    p_offset: offset,
    p_include_demo: includeDemo,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Uzman listesi okunamadı." }, { status: 500 });
  }
  const raw = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const total = raw.length > 0 ? Number(raw[0].total_count ?? 0) : 0;

  const rows: ExpertListRow[] = raw.map((r) => {
    const perms = r.module_permissions;
    // "Erişilebilir modül sayısı" = module_permissions'tan JSON anahtar sayısı DEĞİL;
    // resolveModuleAccess ile gerçek erişim (always-on + hub dahil) üzerinden hesaplanır.
    const accessibleModuleCount = MODULE_USAGE_KEYS.filter((k) =>
      resolveModuleAccess("expert", perms, k),
    ).length;
    const active = r.active === true;
    const approval = String(r.approval_status ?? "");
    return {
      userId: String(r.user_id),
      tenantId: r.tenant_id != null ? String(r.tenant_id) : "",
      fullName: String(r.full_name ?? "").trim(),
      email: String(r.email ?? "").trim(),
      active,
      approvalStatus: approval,
      isDemo: r.is_demo_account === true,
      isArchived: !active && approval.trim().toLowerCase() === "approved",
      accountCreatedAt: r.created_at != null ? String(r.created_at) : null,
      lastLoginAt: r.last_login != null ? String(r.last_login) : null,
      lastSeenAt: r.last_seen != null ? String(r.last_seen) : null,
      sessionCount: Number(r.session_count ?? 0),
      accessibleModuleCount,
    };
  });

  const payload: { ok: true; contractVersion: 1; data: ExpertsData } = {
    ok: true,
    contractVersion: 1,
    data: {
      rows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      status,
      sort,
      includeDemo,
      note: includeDemo
        ? "Demo hesaplar DAHİL. lastSeenAt heartbeat tabanlı (~yaklaşık). last_login = son başarılı giriş."
        : "Demo hesaplar HARİÇ. lastSeenAt heartbeat tabanlı (~yaklaşık). last_login = son başarılı giriş.",
    },
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
