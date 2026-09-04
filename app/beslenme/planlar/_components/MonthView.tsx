"use client";
/**
 * Aylık genel bakış — takvim ızgarası (yalnız özet: gün no + enerji + öğün sayısı).
 * Pazartesi-öncelikli hafta. Mobilde kendi overflow-x-auto kabında yatay kayar;
 * sayfa gövdesi asla taşmaz.
 */
import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { type Plan, type PlanDaySummary } from "@/lib/beslenme/planClient";
import { formatEnergy } from "./planFormat";

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

type MonthGroup = { key: string; year: number; month: number; days: PlanDaySummary[] };

function groupByMonth(days: PlanDaySummary[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const d of days) {
    const m = /^(\d{4})-(\d{2})/.exec(d.plan_date);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    let g = map.get(key);
    if (!g) {
      g = { key, year: Number(m[1]), month: Number(m[2]) - 1, days: [] };
      map.set(key, g);
    }
    g.days.push(d);
  }
  return [...map.values()];
}

/** Pazartesi-öncelikli hafta indeksi (0 = Pzt … 6 = Paz). */
function mondayIndex(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function MonthView({
  plan,
  days,
  onOpenDay,
}: {
  plan: Plan;
  days: PlanDaySummary[];
  onOpenDay: (dayId: string) => void;
}) {
  const groups = useMemo(() => groupByMonth(days), [days]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center text-[13px] font-bold text-slate-400">
        Görüntülenecek gün yok.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const byDate = new Map(g.days.map((d) => [Number(d.plan_date.slice(8, 10)), d]));
        const first = g.days[0];
        const firstDayNum = Number(first.plan_date.slice(8, 10));
        // Izgara ilk gerçek günden başlar → önündeki boşluk = o günün hafta indeksi.
        const startPad = mondayIndex(first.plan_date);
        const lastDayNum = Number(g.days[g.days.length - 1].plan_date.slice(8, 10));
        const cells: Array<number | null> = [];
        for (let i = 0; i < startPad; i++) cells.push(null);
        for (let n = firstDayNum; n <= lastDayNum; n++) cells.push(n);

        return (
          <div key={g.key} className="rounded-2xl border border-emerald-100/70 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <CalendarDays className="h-4 w-4 text-emerald-500" aria-hidden />
              <span className="text-[13px] font-black text-slate-700">
                {TR_MONTHS[g.month]} {g.year}
              </span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="mb-1 grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="py-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((n, i) => {
                    if (n === null) return <div key={`pad-${i}`} className="min-h-[68px] rounded-xl bg-slate-50/40" />;
                    const d = byDate.get(n);
                    if (!d) {
                      return (
                        <div key={`empty-${n}`} className="flex min-h-[68px] flex-col rounded-xl border border-slate-100 bg-slate-50/40 p-1.5">
                          <span className="text-[11px] font-black text-slate-300">{n}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onOpenDay(d.id)}
                        className="flex min-h-[68px] flex-col rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/60"
                      >
                        <span className="text-[11px] font-black text-slate-700">{n}</span>
                        {d.meal_count > 0 ? (
                          <span className="mt-auto flex flex-col">
                            <span className="text-[11px] font-black text-emerald-700">{formatEnergy(d.energy_total)}</span>
                            <span className="text-[9px] font-bold text-slate-400">{d.meal_count} öğün</span>
                          </span>
                        ) : (
                          <span className="mt-auto text-[9px] font-bold text-slate-300">boş</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <p className="px-1 text-[11px] font-medium text-slate-400">
        {plan.daily_energy_target
          ? `Plan günlük hedefi: ${formatEnergy(plan.daily_energy_target)} kcal.`
          : "Plan için günlük hedef tanımlanmamış."}
      </p>
    </div>
  );
}
