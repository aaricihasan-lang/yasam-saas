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
  // page üst sınırı: offset (page-1)*pageSize'ın PostgreSQL int4 (~2.1e9) sınırını aşmasını önler.
  if (!Number.isFinite(pageRaw) || pageRaw < 1 || pageRaw > 100000) {
    return NextResponse.json({ ok: false, error: "Geçersiz sayfa numarası." }, { status: 400 });
  }
  const page = Math.floor(pageRaw);
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
  // RPC jsonb döner: { total, rows[] }. total sayfadan BAĞIMSIZ → aralık-dışı/boş sayfada bile doğru.
  const obj = (data ?? {}) as { total?: number; rows?: Record<string, unknown>[] };
  const total = Number(obj.total ?? 0);
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];

  const rows: ExpertListRow[] = rawRows.map((r) => {
    const perms = r.module_permissions;
    // "Erişilebilir modül sayısı" = module_permissions'tan JSON anahtar sayısı DEĞİL;
    // resolveModuleAccess ile gerçek erişim (always-on + hub dahil) üzerinden hesaplanır.
    const accessibleModuleCount = MODULE_USAGE_KEYS.filter((k) =>
      resolveModuleAccess("expert", perms, k),
    ).length;
    // active NULL KORUNUR (üçüncü durum). Arşiv = active IS FALSE ve approved (SQL ile aynı);
    // NULL → arşiv DEĞİL, kesin pasif DEĞİL.
    const active: boolean | null = r.active === true ? true : r.active === false ? false : null;
    const approval = String(r.approval_status ?? "");
    return {
      userId: String(r.user_id),
      tenantId: r.tenant_id != null ? String(r.tenant_id) : "",
      fullName: String(r.full_name ?? "").trim(),
      email: String(r.email ?? "").trim(),
      active,
      approvalStatus: approval,
      isDemo: r.is_demo_account === true,
      isArchived: active === false && approval.trim().toLowerCase() === "approved",
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
