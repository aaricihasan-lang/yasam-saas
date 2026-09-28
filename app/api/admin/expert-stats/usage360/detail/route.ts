/**
 * GET /api/admin/expert-stats/usage360/detail?userId=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Uzman 360 dönem detayı: özet, günlük, modül, platform/cihaz, saat yoğunluğu, yaklaşık
 * konum, teknik hatalar + hesap/erişim meta verisi. Tek RPC (usage360_expert_detail) +
 * hesap meta sorguları. Tarihler TR takvim günü; en fazla 366 gün.
 *
 * GİZLİLİK: yalnız telemetri rollup'ları ve hesap meta verisi okunur; uzmanın iş tabloları
 * (danışan, anamnez, not, rapor, protokol …) bu uçta HİÇ sorgulanmaz.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isUuid, resolveTargetExpert } from "@/lib/admin/stats/statsRequest";
import { allowedExpertModules, buildModuleRows, mapCounts, moduleLabel } from "@/lib/admin/stats/usage360Api";
import { DETAIL_MAX_DAYS, parseYmdRange, trDayOf, usage360Coverage } from "@/lib/admin/stats/usage360Period";
import type { Usage360DetailData } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

type RpcDetail = {
  from: string; to: string; measurementStart: string | null; lastActivityEver: string | null;
  totals: Record<string, unknown>; modulesUsed: number; modulesWithActions: number;
  daily: Record<string, unknown>[]; modules: Record<string, unknown>[]; modulesEverOpened: string[];
  channels: Record<string, unknown>[]; devices: Record<string, unknown>[]; locations: Record<string, unknown>[];
  heatmap: Record<string, unknown>[]; failures: Record<string, unknown>[];
};

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const s = (v: unknown) => (v == null ? null : String(v));

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId")?.trim() ?? "";
  if (!isUuid(userId)) return NextResponse.json({ ok: false, error: "Geçerli userId gerekli." }, { status: 400, headers: NO_STORE });
  const range = parseYmdRange(sp.get("from"), sp.get("to"), DETAIL_MAX_DAYS);
  if (!range.ok) return NextResponse.json({ ok: false, error: range.error }, { status: 400, headers: NO_STORE });

  const target = await resolveTargetExpert(db, userId);
  if (!target) return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404, headers: NO_STORE });

  const [detailRes, sessRes, activeRes, approvedRes] = await Promise.all([
    db.rpc("usage360_expert_detail", { p_user_id: userId, p_from: range.from, p_to: range.to }),
    db.from("user_sessions").select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
    db.from("user_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true),
    db.from("users").select("approved_at").eq("id", userId).maybeSingle(),
  ]);
  if (detailRes.error || !detailRes.data) {
    console.error("[usage360-admin] detail failed", { code: (detailRes.error as { code?: string } | null)?.code ?? null });
    return NextResponse.json({ ok: false, error: "Kullanım detayı okunamadı." }, { status: 500, headers: NO_STORE });
  }
  const d = detailRes.data as RpcDetail;
  const allowed = allowedExpertModules(target.role, target.modulePermissions);
  const measurementStart = d.measurementStart ?? null;
  const totals = d.totals ?? {};

  const data: Usage360DetailData = {
    userId,
    from: d.from,
    to: d.to,
    today: trDayOf(Date.now()),
    measurementStart,
    coverage: usage360Coverage(measurementStart, d.from, d.to),
    account: {
      active: target.active,
      approvalStatus: target.approvalStatus,
      createdAt: target.createdAt,
      // approved_at kolonu eski şemada yoksa hata → null (Ölçülemiyor), sayfa kırılmaz.
      approvedAt: approvedRes.error ? null : s((approvedRes.data as { approved_at?: unknown } | null)?.approved_at),
      lastLoginAt: sessRes.error ? null : s((sessRes.data?.[0] as { created_at?: unknown } | undefined)?.created_at),
      lastActivityAt: s(d.lastActivityEver),
      activeAuthSessions: activeRes.error ? null : activeRes.count ?? 0,
      allowedModules: allowed,
    },
    totals: { ...mapCounts(totals), firstAt: s(totals.firstAt), lastAt: s(totals.lastAt), activeUsageDays: num(totals.activeUsageDays), actionDays: num(totals.actionDays) },
    modulesUsed: num(d.modulesUsed),
    modulesWithActions: num(d.modulesWithActions),
    daily: (d.daily ?? []).map((r) => ({ ...mapCounts(r), day: String(r.day), modulesUsed: num(r.modulesUsed), firstAt: s(r.firstAt), lastAt: s(r.lastAt) })),
    modules: buildModuleRows({ rpcModules: d.modules ?? [], everOpened: d.modulesEverOpened ?? [], allowed, measurementStart }),
    channels: (d.channels ?? []).map((c) => ({ channel: String(c.channel), visits: num(c.visits), activeSeconds: num(c.activeSeconds), moduleOpens: num(c.moduleOpens), actions: num(c.actions), lastAt: s(c.lastAt) })),
    devices: (d.devices ?? []).map((x) => ({ channel: String(x.channel), osFamily: String(x.osFamily), browserFamily: String(x.browserFamily), appVersion: s(x.appVersion), visits: num(x.visits), lastAt: s(x.lastAt) })),
    locations: (d.locations ?? []).map((l) => ({ country: s(l.country), city: s(l.city), visits: num(l.visits), lastAt: s(l.lastAt) })),
    heatmap: (d.heatmap ?? []).map((h) => ({ dow: num(h.dow), hour: num(h.hour), days: num(h.days) })),
    failures: (d.failures ?? []).map((f) => ({ module: String(f.module), label: moduleLabel(String(f.module)), errorClass: String(f.errorClass), count: num(f.count), lastAt: s(f.lastAt) })),
  };
  return NextResponse.json({ ok: true, contractVersion: 1, data }, { headers: NO_STORE });
}
