import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { parseRange } from "@/lib/admin/stats/statsRequest";
import { makeMetric, unavailableMetric, type MetricValue, type StatsEnvelope } from "@/lib/admin/stats/contract";

export const runtime = "nodejs";

/**
 * GET /api/admin/expert-stats/overview?from=<iso>&to=<iso>&activeSinceDays=30
 *
 * FAZ 1 / İP-E + §10 — SİSTEM (scope=system) büyüme/kapasite. Kaynak: users (head-count,
 * demo hariç) + expert_active_used_count RPC. KARAR: "aktif hesap" (users.active) ile
 * "son N günde GERÇEKTEN kullanım sinyali" AYRI metriklerdir. Maliyet: yalnız fatura
 * verisi olmadığından TL maliyet HESAPLANMAZ (kapsam dışı).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const parsed = parseRange(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const range = parsed.range;
  const sinceDaysRaw = Number(req.nextUrl.searchParams.get("activeSinceDays") ?? 30);
  const sinceDays = Number.isFinite(sinceDaysRaw) && sinceDaysRaw > 0 && sinceDaysRaw <= 365 ? Math.floor(sinceDaysRaw) : 30;
  const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const measuredAt = new Date().toISOString();

  // Demo hariç expert head-count'ları (paralel; RLS bypass service_role).
  const expertBase = () => db.from("users").select("*", { count: "exact", head: true }).eq("role", "expert").eq("is_demo_account", false);

  // ÜYE PASİFLEŞTİRME F4-R1: dört AYRIK hesap durumu (toplamları = Toplam Uzman; null active hariç, önceki gibi).
  //   Aktif = active & kısıt yok · Pasif = active & kısıtlı (giriş açık, modüller kilitli) ·
  //   Giriş kapalı = !active & arşivde değil · Arşivde = archived_at dolu (4a; daima !active).
  // Yalnız head-count; kısıtlı/arşivli sayılar çıkarma ile bulunur (ek RPC yok). Kolon yoksa (migration öncesi)
  // ilgili ayrım yapılmaz: kısıt yok sayılır / arşiv sayısı okunamadı.
  const [totalRes, activeAllRes, inactiveAllRes, pendingRes, activeFreeRes, inactiveOpenRes] = await Promise.all([
    expertBase(),
    expertBase().eq("active", true),
    expertBase().eq("active", false),
    expertBase().eq("approval_status", "pending"),
    expertBase().eq("active", true).is("access_restricted_at", null),
    expertBase().eq("active", false).is("archived_at", null),
  ]);
  type CountRes = { count: number | null; error: unknown };
  const diff = (a: CountRes, b: CountRes): CountRes =>
    a.error || b.error ? { count: null, error: a.error ?? b.error } : { count: Math.max(0, (a.count ?? 0) - (b.count ?? 0)), error: null };
  const restrictionKnown = !activeFreeRes.error;
  const activeRes: CountRes = restrictionKnown ? activeFreeRes : activeAllRes;
  const passiveRes: CountRes = restrictionKnown ? diff(activeAllRes, activeFreeRes) : { count: 0, error: null };
  const loginClosedRes: CountRes = inactiveOpenRes.error ? inactiveAllRes : inactiveOpenRes;
  const archivedRes: CountRes = diff(inactiveAllRes, inactiveOpenRes);

  // Yeni uzman: aralık verilmişse aralıkta, yoksa son sinceDays'te (created_at).
  const newExpertsRes = await (range.from || range.to
    ? (() => {
        let q = expertBase();
        if (range.from) q = q.gte("created_at", range.from);
        if (range.to) q = q.lt("created_at", range.to);
        return q;
      })()
    : expertBase().gte("created_at", sinceIso));

  const { data: usedData, error: usedErr } = await db.rpc("expert_active_used_count", { p_since: sinceIso });
  const activeUsed = usedErr ? null : Number(usedData ?? 0);

  const countMetric = (
    res: { count: number | null; error: unknown },
    note: string,
    scope: "system" = "system",
  ): MetricValue<number> =>
    res.error
      ? unavailableMetric<number>(scope, "user", note)
      : makeMetric<number>(res.count ?? 0, scope, "measured", "user", { measuredAt, note });

  const payload: StatsEnvelope<{
    activeSinceDays: number;
    range: typeof range;
    totalExperts: MetricValue<number>;
    activeExperts: MetricValue<number>;
    passiveExperts: MetricValue<number>;
    loginClosedExperts: MetricValue<number>;
    pendingExperts: MetricValue<number>;
    archivedExperts: MetricValue<number>;
    newExperts: MetricValue<number>;
    activeUsedExperts: MetricValue<number>;
  }> = {
    ok: true,
    contractVersion: 1,
    data: {
      activeSinceDays: sinceDays,
      range,
      totalExperts: countMetric(totalRes, "role=expert (demo hariç)"),
      activeExperts: countMetric(activeRes, "aktif hesap (active ve erişim kısıtı yok) — kullanım sinyali DEĞİL"),
      passiveExperts: countMetric(passiveRes, "pasif: giriş açık, modüller kilitli (access_restricted_at)"),
      loginClosedExperts: countMetric(loginClosedRes, "giriş kapalı (active=false, arşivde değil)"),
      pendingExperts: countMetric(pendingRes, "onay bekleyen"),
      archivedExperts: countMetric(archivedRes, "arşivde (archived_at dolu; giriş kapalı)"),
      newExperts: countMetric(newExpertsRes, range.from || range.to ? "aralıkta yeni uzman" : `son ${sinceDays} günde yeni uzman`),
      activeUsedExperts:
        activeUsed == null
          ? unavailableMetric<number>("system", "user", "distinct kullanım sinyali okunamadı")
          : makeMetric<number>(activeUsed, "system", "measured", "user", {
              measuredAt,
              note: `son ${sinceDays} günde teknik temas (last_seen) sinyali olan DISTINCT expert — kullanım kanıtı DEĞİL; 27.09.2026 backfill artefaktı aktif oturumu olan herkesi içerir`,
            }),
    },
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
