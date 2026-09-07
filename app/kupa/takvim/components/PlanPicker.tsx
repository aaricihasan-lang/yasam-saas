"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  kupaBtnGhost,
  kupaBtnPrimary,
  kupaBtnSuccess,
  kupaInput,
} from "@/app/kupa/components/KupaShell";
import { CUPPING_PLAN_YEAR_MIN, CUPPING_PLAN_YEAR_MAX } from "@/lib/cupping/calendarTypes";
import { createCalendarPlan, updateCalendarPlan, type CuppingCalendarPlan } from "@/app/kupa/lib/api";

/**
 * FAZ 5 / AŞAMA 3 — Plan kontrolü: aktif plan seçimi + Yeni Takvim + düzenle/sil.
 * Düşük sürtünme: mobilde üstte plan seçici. Yıl invariantı korunur — seçili günleri olan
 * planın yılı DEĞİŞTİRİLEMEZ (sessiz gün taşıma/silme YOK).
 */
function defaultYear(): number {
  // İstemci tarafı; plan yılı için makul varsayılan. (Harici bağımlılık yok.)
  return new Date().getFullYear();
}

export function PlanPicker({
  plans,
  activePlanId,
  currentDayCount,
  onSelect,
  onPlansChanged,
  onDelete,
}: {
  plans: CuppingCalendarPlan[];
  activePlanId: string | null;
  currentDayCount: number;
  onSelect: (planId: string) => void;
  onPlansChanged: (selectId?: string) => Promise<void> | void;
  onDelete: (plan: CuppingCalendarPlan) => void;
}) {
  const { showToast } = useToast();
  const active = plans.find((p) => p.id === activePlanId) ?? null;
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [name, setName] = useState("");
  const [year, setYear] = useState<number>(defaultYear());
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const yearLocked = mode === "edit" && currentDayCount > 0;

  function openNew() {
    const y = defaultYear();
    setName(`${y} Hacamat Takvimi`);
    setYear(y);
    setDescription("");
    setMode("new");
  }
  function openEdit() {
    if (!active) return;
    setName(active.name);
    setYear(active.year);
    setDescription(active.description ?? "");
    setMode("edit");
  }

  async function save() {
    if (!name.trim()) {
      showToast({ message: "Takvim adı gerekli.", type: "warning" });
      return;
    }
    if (!Number.isInteger(year) || year < CUPPING_PLAN_YEAR_MIN || year > CUPPING_PLAN_YEAR_MAX) {
      showToast({ message: `Yıl ${CUPPING_PLAN_YEAR_MIN}–${CUPPING_PLAN_YEAR_MAX} aralığında olmalı.`, type: "warning" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "new") {
        const plan = await createCalendarPlan({ name: name.trim(), year, description: description.trim() || null });
        await onPlansChanged(plan.id);
        showToast({ message: "Takvim oluşturuldu.", type: "success" });
      } else if (mode === "edit" && active) {
        // Yıl yalnız gün yoksa gönderilir (invariant); ad/açıklama her zaman.
        const body: Parameters<typeof updateCalendarPlan>[1] = {
          name: name.trim(),
          description: description.trim() || null,
        };
        if (!yearLocked && year !== active.year) body.year = year;
        await updateCalendarPlan(active.id, body);
        await onPlansChanged(active.id);
        showToast({ message: "Takvim güncellendi.", type: "success" });
      }
      setMode("none");
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "İşlem başarısız.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Aktif Takvim</span>
          <select
            className={kupaInput}
            value={activePlanId ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.year})
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className={`${kupaBtnPrimary} min-h-[40px]`} onClick={openNew}>
            + Yeni Takvim
          </button>
          {active ? (
            <>
              <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={openEdit}>
                Düzenle
              </button>
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                onClick={() => onDelete(active)}
              >
                Sil
              </button>
            </>
          ) : null}
        </div>
      </div>

      {active && mode === "none" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="font-bold text-slate-800">{active.name}</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{active.year}</span>
          {active.description ? <span className="text-slate-500">{active.description}</span> : null}
        </div>
      ) : null}

      {mode !== "none" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">{mode === "new" ? "Yeni Takvim" : "Takvimi Düzenle"}</h3>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Takvim adı</span>
              <input className={kupaInput} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Yıl</span>
              {yearLocked ? (
                <>
                  <input className={`${kupaInput} bg-slate-50 text-slate-500`} value={year} readOnly aria-readonly />
                  <span className="text-xs text-slate-400">Seçili günleri olan takvimin yılı değiştirilemez.</span>
                </>
              ) : (
                <input
                  type="number"
                  className={kupaInput}
                  value={year}
                  min={CUPPING_PLAN_YEAR_MIN}
                  max={CUPPING_PLAN_YEAR_MAX}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Açıklama (opsiyonel)</span>
              <input className={kupaInput} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={() => setMode("none")} disabled={busy}>
                Vazgeç
              </button>
              <button type="button" className={`${kupaBtnSuccess} min-h-[40px]`} onClick={save} disabled={busy}>
                {busy ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
