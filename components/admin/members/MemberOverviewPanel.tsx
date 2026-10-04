"use client";

/**
 * ÜYE YÖNETİMİ 360° — "Yönetim Özeti / Dikkat Gerektirenler".
 *
 * Amaç: "Bugün kimi kontrol etmeliyim?" Kartlar tıklanınca üye listesine ilgili SUNUCU filtresi
 * uygulanır. Grafik yok; sayı + oran + açık not.
 *
 * ÖLÇÜM DÜRÜSTLÜĞÜ: kullanım kartları Usage360 gerçek etkileşim rollup'ından gelir. Ölçüm penceresi
 * kartın süresini doldurmadıysa sayı YERİNE "N günlük ölçüm süresi henüz tamamlanmadı · ölçüm X
 * gündür açık" yazılır ve kart tıklanamaz (sahte 0 YOK). Yeterli süre oluşunca kart kendiliğinden
 * gerçek sayıya döner.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Clock3, Loader2, ShieldAlert, UserCheck, Activity } from "lucide-react";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { activeCard, idleCard, parseMemberOverview, type MemberOverview, type OverviewCardValue } from "@/lib/admin/member360";
import type { MemberListQuery } from "@/lib/admin/memberListQuery";

export type OverviewTarget =
  | "active7" | "active30" | "idle30" | "idle60" | "idle90"
  | "overdue" | "due7" | "due30" | "pending" | "security";

/** Kart → liste filtresi (aktif oran paydası: onaylı + aktif uzman). */
export const OVERVIEW_TARGET_QUERY: Record<OverviewTarget, Partial<MemberListQuery>> = {
  active7: { role: "expert", approval: "approved", active: "active", activity: "d7" },
  active30: { role: "expert", approval: "approved", active: "active", activity: "d30" },
  idle30: { role: "expert", approval: "approved", active: "active", activity: "idle30" },
  idle60: { role: "expert", approval: "approved", active: "active", activity: "idle60" },
  idle90: { role: "expert", approval: "approved", active: "active", activity: "idle90" },
  overdue: { due: "overdue" },
  due7: { due: "d0_7" },
  due30: { due: "due30" },
  pending: { role: "expert", approval: "pending" },
  security: { security: "alert" },
};

/** Liste sorgusu bir kartın filtresiyle birebir mi? (aktif kart vurgusu) */
export function overviewTargetActive(target: OverviewTarget, q: MemberListQuery): boolean {
  const want = OVERVIEW_TARGET_QUERY[target];
  return Object.entries(want).every(([k, v]) => (q as Record<string, unknown>)[k] === v);
}

type State = { kind: "loading" } | { kind: "ready"; data: MemberOverview } | { kind: "error" };

type Tone = "emerald" | "sky" | "amber" | "rose" | "violet" | "slate";
const TONES: Record<Tone, string> = {
  emerald: "border-emerald-200 from-emerald-50/95",
  sky: "border-sky-200 from-sky-50/95",
  amber: "border-amber-200 from-amber-50/95",
  rose: "border-rose-200 from-rose-50/95",
  violet: "border-violet-200 from-violet-50/95",
  slate: "border-slate-200 from-slate-50/95",
};

function Card({
  label, value, tone, icon, active, onClick,
}: {
  label: string;
  value: OverviewCardValue;
  tone: Tone;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const disabled = value.kind === "unavailable";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={value.kind === "unavailable" ? value.note : undefined}
      className={`flex min-w-0 flex-col rounded-2xl border bg-gradient-to-br via-white to-white p-3 text-left shadow-sm transition sm:p-3.5 ${TONES[tone]} ${
        disabled ? "cursor-default opacity-90" : "hover:-translate-y-0.5 hover:shadow-md"
      } ${active ? "ring-2 ring-violet-400" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase leading-tight tracking-wide text-slate-600">
        <span className="shrink-0 text-slate-500" aria-hidden>{icon}</span>
        <span className="min-w-0">{label}</span>
      </span>
      {value.kind === "value" ? (
        <>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black tabular-nums text-slate-950">{value.value}</span>
            {value.ratio ? <span className="text-sm font-black tabular-nums text-slate-500">{value.ratio}</span> : null}
          </span>
          {value.note ? <span className="mt-0.5 text-[10.5px] font-semibold leading-snug text-slate-500">{value.note}</span> : null}
        </>
      ) : (
        <>
          <span className="mt-1 text-lg font-black text-slate-400" aria-hidden>—</span>
          <span className="mt-0.5 text-[10.5px] font-bold leading-snug text-slate-600">{value.note}</span>
        </>
      )}
    </button>
  );
}

const plain = (n: number, note: string | null = null): OverviewCardValue => ({ kind: "value", value: n, ratio: null, note });

export function MemberOverviewPanel({
  adminId,
  reloadKey,
  query,
  onSelect,
}: {
  adminId: string;
  reloadKey: number;
  query: MemberListQuery;
  onSelect: (target: OverviewTarget) => void;
}) {
  const requestKey = `${adminId}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; state: State } | null>(null);
  const state: State = result && result.key === requestKey ? result.state : { kind: "loading" };

  useEffect(() => {
    if (!adminId) return;
    const ctrl = new AbortController();
    const headers: Record<string, string> = { "x-admin-id": adminId };
    const token = readSessionToken();
    if (token) headers["x-session-token"] = token;
    fetch("/api/admin/users/overview", { headers, signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) { setResult({ key: requestKey, state: { kind: "error" } }); return; }
        const json = (await res.json()) as { overview?: unknown };
        setResult({ key: requestKey, state: { kind: "ready", data: parseMemberOverview(json.overview) } });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setResult({ key: requestKey, state: { kind: "error" } });
      });
    return () => ctrl.abort();
  }, [adminId, requestKey]);

  return (
    <section aria-labelledby="member-overview-title" className="mb-5 rounded-2xl border border-white/80 bg-white/85 p-3 shadow-md backdrop-blur-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="member-overview-title" className="flex items-center gap-2 text-base font-black text-slate-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          Yönetim Özeti · Dikkat Gerektirenler
        </h2>
        {state.kind === "ready" ? (
          <p className="text-[11px] font-semibold text-slate-500">
            {state.data.measurement.start
              ? `Kullanım: gerçek etkileşim ölçümü · ${state.data.measurement.measuredDays} gündür açık`
              : "Kullanım ölçümü henüz başlamadı"}
            {" · "}Oran paydası: {state.data.denominator} onaylı aktif uzman (demo hariç)
          </p>
        ) : null}
      </div>
      {state.kind === "loading" ? (
        <div className="flex items-center gap-2 py-6 text-sm font-bold text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Özet yükleniyor…
        </div>
      ) : state.kind === "error" ? (
        <p className="py-3 text-sm font-bold text-rose-800" role="alert">Yönetim özeti şu an alınamadı. Üye listesi etkilenmez.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-2.5">
          {(
            [
              ["active7", "Son 7 günde aktif", activeCard(state.data, 7), "emerald", <Activity key="i" className="h-3.5 w-3.5" />],
              ["active30", "Son 30 günde aktif", activeCard(state.data, 30), "emerald", <Activity key="i" className="h-3.5 w-3.5" />],
              ["idle30", "30+ gün kullanılmayan", idleCard(state.data, 30), "amber", <Clock3 key="i" className="h-3.5 w-3.5" />],
              ["idle60", "60+ gün kullanılmayan", idleCard(state.data, 60), "amber", <Clock3 key="i" className="h-3.5 w-3.5" />],
              ["idle90", "90+ gün kullanılmayan", idleCard(state.data, 90), "rose", <Clock3 key="i" className="h-3.5 w-3.5" />],
              ["overdue", "Ödemesi gecikmiş", plain(state.data.paymentOverdue), "rose", <CalendarClock key="i" className="h-3.5 w-3.5" />],
              ["due7", "7 gün içinde ödeme", plain(state.data.paymentDue7), "amber", <CalendarClock key="i" className="h-3.5 w-3.5" />],
              ["due30", "30 gün içinde ödeme", plain(state.data.paymentDue30), "sky", <CalendarClock key="i" className="h-3.5 w-3.5" />],
              ["pending", "Onay bekleyen", plain(state.data.pending), "violet", <UserCheck key="i" className="h-3.5 w-3.5" />],
              ["security", "Güvenlik uyarısı olan", plain(state.data.securityAlerts, "Orta / yüksek önemli olay"), "slate", <ShieldAlert key="i" className="h-3.5 w-3.5" />],
            ] as [OverviewTarget, string, OverviewCardValue, Tone, React.ReactNode][]
          ).map(([target, label, value, tone, icon]) => (
            <Card key={target} label={label} value={value} tone={tone} icon={icon}
              active={overviewTargetActive(target, query)} onClick={() => onSelect(target)} />
          ))}
        </div>
      )}
    </section>
  );
}
