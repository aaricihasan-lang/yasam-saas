"use client";
/**
 * Günlük plan editörü (ana yüzey, mobil-öncelikli). Gün gezinme + günlük toplamlar +
 * öğün kartları + öğün ekleme. Seçili gün değişince getDay ile detay yüklenir;
 * her mutasyondan sonra yeniden yüklenir (+ onChanged ile özetler tazelenir).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CopyPlus, Eraser, PenLine, Plus } from "lucide-react";
import {
  clearDay,
  copyDay,
  createMeal,
  getDay,
  patchDay,
  reorderMeals,
  type Plan,
  type PlanDayDetail,
  type PlanDaySummary,
} from "@/lib/beslenme/planClient";
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  NUTRIENT_LABELS,
  effectiveDailyTarget,
  type MealType,
} from "@/lib/beslenme/planContracts";
import { formatAmount } from "@/lib/beslenme/calc/nutrients";
import { DangerButton, Field, GhostButton, InlineSpinner, PrimaryButton, StatusMessage, TextArea, TextInput } from "../../_components/primitives";
import { EnergyTargetLine, Modal, energyValue } from "./planUi";
import { buildTotals, formatDateShort, friendlyPlanError } from "./planFormat";
import { MealCard } from "./MealCard";

export function DayEditor({
  plan,
  days,
  selectedDayId,
  setSelectedDayId,
  readOnly,
  onChanged,
}: {
  plan: Plan;
  days: PlanDaySummary[];
  selectedDayId: string | null;
  setSelectedDayId: (id: string) => void;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [dayDetail, setDayDetail] = useState<PlanDayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const index = days.findIndex((d) => d.id === selectedDayId);
  const summary = index >= 0 ? days[index] : null;

  const reloadDay = useCallback(async () => {
    if (!selectedDayId) return;
    setLoading(true);
    setErr("");
    const r = await getDay(plan.id, selectedDayId);
    setLoading(false);
    if (r.ok && r.data?.day) setDayDetail(r.data.day);
    else setErr(friendlyPlanError(r.code, r.status));
  }, [plan.id, selectedDayId]);

  // Seçili gün değişince (parent DayEditor'ı selectedDayId ile key'ler → remount)
  // detay yüklenir. setState nested async içinde olduğundan effect-body sync değildir.
  useEffect(() => {
    void (async () => {
      await reloadDay();
    })();
  }, [reloadDay]);

  const onMutated = useCallback(async () => {
    await reloadDay();
    onChanged();
  }, [reloadDay, onChanged]);

  const meals = useMemo(
    () => (dayDetail ? [...dayDetail.meals].sort((a, b) => a.sort_order - b.sort_order) : []),
    [dayDetail],
  );

  const totals = useMemo(() => buildTotals(meals), [meals]);
  const effectiveTarget = effectiveDailyTarget(
    dayDetail?.energy_target_override ?? summary?.energy_target_override,
    plan.daily_energy_target,
  );

  async function onMove(mealId: string, dir: -1 | 1) {
    if (!selectedDayId) return;
    const order = meals.map((m) => m.id);
    const i = order.indexOf(mealId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const r = await reorderMeals(plan.id, selectedDayId, order);
    if (r.ok) await onMutated();
    else setErr(friendlyPlanError(r.code, r.status));
  }

  async function quickCreateMeal(type: MealType) {
    if (!selectedDayId) return;
    setBusy(true);
    const r = await createMeal(plan.id, { plan_day_id: selectedDayId, meal_type: type, label: MEAL_TYPE_LABELS[type] });
    setBusy(false);
    if (r.ok) await onMutated();
    else setErr(friendlyPlanError(r.code, r.status));
  }

  async function createCustomMeal() {
    if (!selectedDayId) return;
    const l = customLabel.trim();
    if (!l) return;
    setBusy(true);
    const r = await createMeal(plan.id, { plan_day_id: selectedDayId, meal_type: null, label: l });
    setBusy(false);
    if (r.ok) {
      setCustomLabel("");
      setShowCustom(false);
      await onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  async function doClear() {
    if (!selectedDayId) return;
    setBusy(true);
    const r = await clearDay(plan.id, selectedDayId);
    setBusy(false);
    setConfirmClear(false);
    if (r.ok) await onMutated();
    else setErr(friendlyPlanError(r.code, r.status));
  }

  if (days.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center text-[13px] font-bold text-slate-400">
        Bu planda gün bulunmuyor.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Gün gezinme */}
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-100/70 bg-white px-3 py-2.5 shadow-sm">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => index > 0 && setSelectedDayId(days[index - 1].id)}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-30"
          aria-label="Önceki gün"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Gün seç</span>
          <select
            value={selectedDayId ?? ""}
            onChange={(e) => setSelectedDayId(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[13px] font-black text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/60"
          >
            {days.map((d, i) => (
              <option key={d.id} value={d.id}>
                {i + 1}. Gün · {formatDateShort(d.plan_date)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={index >= days.length - 1}
          onClick={() => index < days.length - 1 && setSelectedDayId(days[index + 1].id)}
          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-30"
          aria-label="Sonraki gün"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Günlük toplam */}
      <div className="rounded-2xl border border-emerald-100/70 bg-gradient-to-br from-emerald-50/70 to-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Günlük Toplam</span>
          {dayDetail?.note ? (
            <span className="max-w-full truncate text-[11px] font-bold text-slate-400">{dayDetail.note}</span>
          ) : null}
        </div>
        <div className="mt-1.5">
          <EnergyTargetLine energyRaw={energyValue(totals)} target={effectiveTarget} className="text-2xl" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["protein", "carbohydrate", "total_fat", "fiber"].map((code) => {
            const t = totals.find((x) => x.nutrient_code === code);
            return (
              <div key={code} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-sm">
                <div className="text-[13px] font-black text-slate-800">
                  {t ? formatAmount(t.amount, t.unit_code) : "0"}
                  <span className="ml-0.5 text-[10px] font-bold text-slate-400">{t?.unit_code ?? "g"}</span>
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">{NUTRIENT_LABELS[code]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gün kontrolleri */}
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton icon={<PenLine className="h-4 w-4" />} onClick={() => setNoteOpen(true)}>
            Günlük Not / Hedef
          </GhostButton>
          <GhostButton icon={<CopyPlus className="h-4 w-4" />} onClick={() => setCopyOpen(true)}>
            Günü Kopyala
          </GhostButton>
          {confirmClear ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-[12px] font-bold text-rose-600">Tüm öğünler silinsin mi?</span>
              <DangerButton loading={busy} onClick={() => void doClear()}>
                Evet, Temizle
              </DangerButton>
              <GhostButton onClick={() => setConfirmClear(false)}>Vazgeç</GhostButton>
            </span>
          ) : (
            <DangerButton icon={<Eraser className="h-4 w-4" />} onClick={() => setConfirmClear(true)}>
              Günü Temizle
            </DangerButton>
          )}
        </div>
      ) : null}

      {err ? <StatusMessage type="error">{err}</StatusMessage> : null}

      {/* Öğünler */}
      {loading && !dayDetail ? (
        <InlineSpinner label="Gün yükleniyor…" />
      ) : meals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-8 text-center">
          <p className="text-[14px] font-black text-slate-600">Bu güne henüz öğün eklenmedi.</p>
          <p className="mt-1 text-[12px] font-medium text-slate-400">Aşağıdan bir öğün ekleyerek başlayın.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {meals.map((m, i) => (
            <MealCard
              key={m.id}
              planId={plan.id}
              meal={m}
              days={days}
              readOnly={readOnly}
              isFirst={i === 0}
              isLast={i === meals.length - 1}
              onMove={onMove}
              onMutated={() => void onMutated()}
            />
          ))}
        </div>
      )}

      {/* Öğün ekle */}
      {!readOnly ? (
        <div className="rounded-2xl border border-emerald-100/70 bg-white px-4 py-3 shadow-sm">
          <p className="mb-2 text-[12px] font-black text-slate-600">+ Öğün Ekle</p>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={busy}
                onClick={() => void quickCreateMeal(t)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[12px] font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> {MEAL_TYPE_LABELS[t]}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowCustom((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Özel Öğün
            </button>
          </div>
          {showCustom ? (
            <div className="mt-2 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <TextInput
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Öğün adı…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createCustomMeal();
                    }
                  }}
                  autoFocus
                />
              </label>
              <PrimaryButton loading={busy} onClick={() => void createCustomMeal()}>
                Ekle
              </PrimaryButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Günlük not / hedef modalı */}
      {noteOpen ? (
        <DayNoteDialog
          onClose={() => setNoteOpen(false)}
          planId={plan.id}
          dayId={selectedDayId}
          initialNote={dayDetail?.note ?? ""}
          initialOverride={dayDetail?.energy_target_override ?? null}
          onMutated={() => void onMutated()}
        />
      ) : null}

      {/* Günü kopyala modalı */}
      {copyOpen ? (
        <CopyDayDialog
          onClose={() => setCopyOpen(false)}
          planId={plan.id}
          sourceDayId={selectedDayId}
          days={days}
          onMutated={() => void onMutated()}
        />
      ) : null}
    </div>
  );
}

/* ── Günlük not / hedef ── (koşullu mount edilir; başlangıç değerleri props'tan) */
function DayNoteDialog({
  onClose,
  planId,
  dayId,
  initialNote,
  initialOverride,
  onMutated,
}: {
  onClose: () => void;
  planId: string;
  dayId: string | null;
  initialNote: string;
  initialOverride: number | null;
  onMutated: () => void;
}) {
  const [note, setNote] = useState(initialNote);
  const [override, setOverride] = useState(initialOverride != null ? String(initialOverride) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!dayId) return;
    setErr("");
    let ov: number | null = null;
    const raw = override.trim().replace(",", ".");
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setErr("Hedef geçerli bir sayı olmalı.");
        return;
      }
      ov = Math.round(n);
    }
    setSaving(true);
    const r = await patchDay(planId, dayId, { note: note.trim() || null, energy_target_override: ov });
    setSaving(false);
    if (r.ok) {
      onClose();
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  return (
    <Modal open onClose={onClose} title="Günlük Not / Hedef" maxWidthClass="max-w-md">
      <div className="flex flex-col gap-3">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <Field label="Günlük Kalori Hedefi" hint="opsiyonel — plan hedefini bu gün için geçersiz kılar">
          <TextInput inputMode="numeric" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Örn: 1800" />
        </Field>
        <Field label="Not">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Bu güne dair not…" />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Vazgeç</GhostButton>
          <PrimaryButton loading={saving} onClick={() => void save()}>
            Kaydet
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

/* ── Günü kopyala (boş hedef gün) ── (koşullu mount) */
function CopyDayDialog({
  onClose,
  planId,
  sourceDayId,
  days,
  onMutated,
}: {
  onClose: () => void;
  planId: string;
  sourceDayId: string | null;
  days: PlanDaySummary[];
  onMutated: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Yalnız boş (öğünsüz) diğer günler hedef olabilir.
  const targets = days.filter((d) => d.id !== sourceDayId && d.meal_count === 0);

  async function doCopy() {
    if (!sourceDayId) return;
    setErr("");
    if (!targetId) {
      setErr("Hedef günü seçin.");
      return;
    }
    setSaving(true);
    const r = await copyDay(planId, sourceDayId, targetId);
    setSaving(false);
    if (r.ok) {
      onClose();
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  return (
    <Modal open onClose={onClose} title="Günü Kopyala" subtitle="Bu günün tüm öğünlerini boş bir güne kopyalar" maxWidthClass="max-w-md">
      <div className="flex flex-col gap-3">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        {targets.length === 0 ? (
          <StatusMessage type="info">Kopyalanabilecek boş gün yok. Önce bir günü temizleyin.</StatusMessage>
        ) : (
          <Field label="Hedef Gün (boş)">
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/60"
            >
              <option value="">Gün seçin…</option>
              {targets.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDateShort(d.plan_date)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Vazgeç</GhostButton>
          <PrimaryButton loading={saving} disabled={targets.length === 0} onClick={() => void doCopy()}>
            Kopyala
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
