import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isUuid, parseRange, resolveTargetExpert } from "@/lib/admin/stats/statsRequest";
import { makeMetric, unavailableMetric, type MetricValue, type StatsEnvelope } from "@/lib/admin/stats/contract";

export const runtime = "nodejs";

/**
 * GET /api/admin/expert-stats/activity?userId=<uuid>&from=<iso>&to=<iso>
 *
 * FAZ 1 / İP-1 — KULLANICI HESABI (scope=user) bazlı giriş/oturum/etkinlik.
 * Kaynak: user_sessions (expert_activity_stats RPC ile DB'de toplulaştırılır — app'e
 * sınırsız satır çekilmez). Metrik semantiği (dürüst etiketleme):
 *   - loginCount        : başarılı giriş sayısı (her giriş = 1 session satırı) — measured
 *   - sessionCount      : toplam oturum satırı — measured
 *   - lastLoginAt       : son giriş (max created_at) — measured
 *   - lastSeenAt        : son görülme (heartbeat; son anlamlı işlem DEĞİL) — approximate
 *   - activeDays        : aktif gün (last_seen DISTINCT, TR günü; heartbeat) — approximate
 *   - channelBreakdown  : kanal dağılımı (NULL = kaydı-öncesi/unrecorded) — measured (ileriye dönük)
 *   - platformBreakdown : UA-parse platform dağılımı — derived
 *   - accountCreatedAt  : users.created_at — measured
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!isUuid(userId)) {
    return NextResponse.json({ ok: false, error: "Geçerli userId gerekli." }, { status: 400 });
  }
  const parsed = parseRange(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const range = parsed.range;

  const target = await resolveTargetExpert(db, userId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const { data, error } = await db.rpc("expert_activity_stats", {
    p_user_id: userId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Etkinlik metrikleri okunamadı." }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const measuredAt = new Date().toISOString();
  const num = (v: unknown): number => (v == null ? 0 : Number(v));

  type ActivityData = {
    userId: string;
    tenantId: string;
    isDemo: boolean;
    range: typeof range;
    accountCreatedAt: MetricValue<string>;
    lastLoginAt: MetricValue<string>;
    lastSeenAt: MetricValue<string>;
    loginCount: MetricValue<number>;
    sessionCount: MetricValue<number>;
    activeDays: MetricValue<number>;
    channelBreakdown: MetricValue<Record<string, number>>;
    platformBreakdown: MetricValue<Record<string, number>>;
  };

  const asMap = (v: unknown): Record<string, number> => {
    if (!v || typeof v !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = Number(val);
    return out;
  };

  const lastLogin = row?.last_login != null ? String(row.last_login) : null;

  const payload: StatsEnvelope<ActivityData> = {
    ok: true,
    contractVersion: 1,
    data: {
      userId,
      tenantId: target.tenantId,
      isDemo: target.isDemo,
      range,
      accountCreatedAt: makeMetric(target.createdAt, "user", target.createdAt ? "measured" : "unavailable", "timestamp", {
        measuredAt,
        note: "users.created_at",
      }),
      lastLoginAt: makeMetric(lastLogin, "user", lastLogin ? "measured" : "unavailable", "timestamp", {
        measuredAt,
        measurementStartDate: lastLogin,
        note: "MAX(user_sessions.created_at) — başarılı giriş anı",
      }),
      lastSeenAt: makeMetric(
        row?.last_seen != null ? String(row.last_seen) : null,
        "user",
        row?.last_seen != null ? "approximate" : "unavailable",
        "timestamp",
        { measuredAt, note: "MAX(last_seen_at) — heartbeat (90sn throttle); son anlamlı işlem değil" },
      ),
      loginCount: makeMetric(num(row?.login_count), "user", "measured", "session", {
        measuredAt,
        note: "COUNT(session created_at ∈ aralık) — başarılı giriş; heartbeat sayılmaz",
      }),
      sessionCount: makeMetric(num(row?.session_count), "user", "measured", "session", { measuredAt, note: "toplam oturum satırı" }),
      activeDays: makeMetric(num(row?.active_days), "user", "approximate", "day", {
        measuredAt,
        note: "DISTINCT(last_seen günü, Europe/Istanbul) — heartbeat tabanlı yaklaşık",
      }),
      channelBreakdown: makeMetric(asMap(row?.channel_breakdown), "user", "measured", "session", {
        measuredAt,
        note: "client_channel dağılımı; 'unrecorded' = kanal ölçümü öncesi oturumlar (geçmiş uydurulmaz)",
      }),
      platformBreakdown: makeMetric(asMap(row?.platform_breakdown), "user", "derived", "session", {
        measuredAt,
        note: "UA-parse platform; WebView mobile'a düşer (kanal ayrımı channelBreakdown'da)",
      }),
    },
  };

  // Boş referans için unavailableMetric kullanımı (tree-shake edilmesin) — hiç oturum yoksa.
  if (num(row?.session_count) === 0 && lastLogin === null) {
    payload.data.lastLoginAt = unavailableMetric<string>("user", "timestamp", "Hiç oturum kaydı yok");
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
