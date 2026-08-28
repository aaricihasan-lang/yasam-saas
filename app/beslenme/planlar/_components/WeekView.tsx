"use client";
/**
 * Haftalık genel bakış — günleri 7'li bloklara ayırır. Yalnız özet veriyi (days)
 * kullanır; item ağacı çekilmez. Masaüstü: hafta içinde grid; mobil: dikey yığın.
 * "Haftayı Kopyala": kaynak/hedef hafta başlangıcı + gün aralığı → weekCopy.
 */
import { useMemo, useState } from "react";
import { CalendarRange, CopyPlus } from "lucide-react";
import { weekCopy, type Plan, type PlanDaySummary } from "@/lib/beslenme/planClient";
import { effectiveDailyTarget } from "@/lib/beslenme/planContracts";
import { Field, GhostButton, PrimaryButton, StatusMessage, TextInput } from "../../_components/primitives";
import { Modal } from "./planUi";
import { formatDateShort, formatEnergy, friendlyPlanError } from "./planFormat";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function WeekView({
  plan,
  days,
  selectedDayId,
  onOpenDay,
  readOnly,
  onChanged,
}: {
  plan: Plan;
  days: PlanDaySummary[];
  selectedDayId: string | null;
  onOpenDay: (dayId: string) => void;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const weeks = useMemo(() => chunk(days, 7), [days]);

  return (
    <div className="flex flex-col gap-4">
      {!readOnly ? (
        <div className="flex justify-end">
          <GhostButton icon={<CopyPlus className="h-4 w-4" />} onClick={() => setCopyOpen(true)}>
            Haftayı Kopyala
          </GhostButton>
        </div>
      ) : null}

      {weeks.map((week, wi) => (
        <div key={wi} className="rounded-2xl border border-emerald-100/70 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <CalendarRange className="h-4 w-4 text-emerald-500" aria-hidden />
            <span className="text-[12px] font-black text-slate-600">{wi + 1}. Hafta</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {week.map((d) => {
              const target = effectiveDailyTarget(d.energy_target_override, plan.daily_energy_target);
              const isSel = d.id === selectedDayId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpenDay(d.id)}
                  className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left shadow-sm transition ${
                    isSel
                      ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
                      : "border-slate-200 bg-white hover:bg-emerald-50/50"
                  }`}
                >
                  <span className="text-[12px] font-black text-slate-800">{formatDateShort(d.plan_date)}</span>
                  <span className="text-[13px] font-black text-emerald-700">
                    {formatEnergy(d.energy_total)}
                    {target ? <span className="font-bold text-slate-400"> / {formatEnergy(target)}</span> : null}
                    <span className="ml-0.5 text-[10px] font-bold text-slate-400"> kcal</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">{d.meal_count} öğün</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {copyOpen ? (
        <WeekCopyDialog
          onClose={() => setCopyOpen(false)}
          planId={plan.id}
          days={days}
          onDone={() => {
            setCopyOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function WeekCopyDialog({
  onClose,
  planId,
  days,
  onDone,
}: {
  onClose: () => void;
  planId: string;
  days: PlanDaySummary[];
  onDone: () => void;
}) {
  const [sourceStart, setSourceStart] = useState(days[0]?.plan_date ?? "");
  const [targetStart, setTargetStart] = useState(days[7]?.plan_date ?? days[0]?.plan_date ?? "");
  const [span, setSpan] = useState("7");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function doCopy() {
    setErr("");
    if (!sourceStart || !targetStart) {
      setErr("Kaynak ve hedef hafta başlangıcını seçin.");
      return;
    }
    const n = Number(span.trim());
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Gün aralığı geçerli bir sayı olmalı.");
      return;
    }
    setSaving(true);
    const r = await weekCopy(planId, { source_start: sourceStart, target_start: targetStart, span_days: Math.round(n) });
    setSaving(false);
    if (r.ok) onDone();
    else setErr(friendlyPlanError(r.code, r.status));
  }

  return (
    <Modal open onClose={onClose} title="Haftayı Kopyala" subtitle="Bir bloğun öğünlerini boş hedef güne kopyalar" maxWidthClass="max-w-md">
      <div className="flex flex-col gap-3">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <Field label="Kaynak Başlangıç">
          <select
            value={sourceStart}
            onChange={(e) => setSourceStart(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/60"
          >
            {days.map((d) => (
              <option key={d.id} value={d.plan_date}>
                {formatDateShort(d.plan_date)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hedef Başlangıç">
          <select
            value={targetStart}
            onChange={(e) => setTargetStart(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/60"
          >
            {days.map((d) => (
              <option key={d.id} value={d.plan_date}>
                {formatDateShort(d.plan_date)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gün Aralığı" hint="varsayılan 7; mevcut günlere göre kırpılır">
          <TextInput inputMode="numeric" value={span} onChange={(e) => setSpan(e.target.value)} />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Vazgeç</GhostButton>
          <PrimaryButton loading={saving} onClick={() => void doCopy()}>
            Kopyala
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
