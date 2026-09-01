"use client";
/**
 * Bir öğün kartı: başlık + öğün toplamı + item listesi + "Besin Ekle" + öğün menüsü
 * (adını değiştir / hedef / kopyala / sil) + sıralama okları. Item satırı kendi
 * aksiyon menüsünü (miktar / besini değiştir / çoğalt / sil) yönetir.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, LayoutTemplate, PenLine, Plus, Repeat, Sparkles, Trash2, Utensils } from "lucide-react";
import {
  addItem,
  copyItem,
  copyMeal,
  deleteItem,
  deleteMeal,
  patchItem,
  patchMeal,
  replaceItemFood,
  type PlanDaySummary,
  type PlanItem,
  type PlanMeal,
} from "@/lib/beslenme/planClient";
import { useTranslations } from "next-intl";
import { MEAL_TYPE_LABELS, type MealType } from "@/lib/beslenme/planContracts";
import { formatAmount } from "@/lib/beslenme/calc/nutrients";
import { isAvoidedFood } from "@/lib/beslenme/avoidedMatch";
import { useAvoidedFoodIds } from "./avoidedFoods";
import { Field, GhostButton, PrimaryButton, DangerButton, StatusMessage, TextInput } from "../../_components/primitives";
import { ActionMenu, EnergyTargetLine, MacroChips, Modal, energyValue, type MenuItem } from "./planUi";
import { FoodPickerDialog, type FoodPickPayload } from "./FoodPickerDialog";
import { mealTotals, formatDateShort, friendlyPlanError } from "./planFormat";
import { SaveMealTemplateModal, ItemAlternativesModal } from "./Faz6ItemActions";

function mealTypeLabel(t: string | null): string | null {
  if (!t) return null;
  return MEAL_TYPE_LABELS[t as MealType] ?? null;
}

export function MealCard({
  planId,
  meal,
  days,
  readOnly,
  isFirst,
  isLast,
  onMove,
  onMutated,
}: {
  planId: string;
  meal: PlanMeal;
  days: PlanDaySummary[];
  readOnly: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (mealId: string, dir: -1 | 1) => void;
  onMutated: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tplSaveOpen, setTplSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const totals = mealTotals(meal.items);
  const typeLabel = mealTypeLabel(meal.meal_type);

  async function onAddFood(payload: FoodPickPayload) {
    setErr("");
    const r = await addItem(planId, meal.id, payload);
    if (r.ok) {
      setPickerOpen(false);
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  const menuItems: MenuItem[] = readOnly
    ? []
    : [
        { label: "Ayarlar / Adını Değiştir", icon: <PenLine className="h-4 w-4" />, onClick: () => setSettingsOpen(true) },
        { label: "Öğünü Şablonla", icon: <LayoutTemplate className="h-4 w-4" />, onClick: () => setTplSaveOpen(true) },
      ];

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-100/70 bg-white shadow-sm">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-emerald-50/40 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-black text-slate-900">
              <Utensils className="h-4 w-4 text-emerald-500" aria-hidden />
              <span className="truncate">{meal.label}</span>
            </span>
            {typeLabel && typeLabel !== meal.label ? (
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-black text-emerald-600">
                {typeLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <EnergyTargetLine energyRaw={energyValue(totals)} target={meal.energy_target} className="text-[13px]" />
          </div>
          {meal.items.length > 0 ? (
            <div className="mt-1.5">
              <MacroChips totals={totals} compact />
            </div>
          ) : null}
        </div>

        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={isFirst}
                onClick={() => onMove(meal.id, -1)}
                className="rounded-md p-0.5 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                aria-label="Yukarı taşı"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={isLast}
                onClick={() => onMove(meal.id, 1)}
                className="rounded-md p-0.5 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                aria-label="Aşağı taşı"
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <ActionMenu items={menuItems} label="Öğün işlemleri" />
          </div>
        ) : null}
      </div>

      {/* Item listesi */}
      <div className="flex flex-col divide-y divide-slate-50">
        {meal.items.length === 0 ? (
          <p className="px-4 py-4 text-center text-[12px] font-bold text-slate-400">
            Bu öğünde henüz besin yok.
          </p>
        ) : (
          meal.items.map((item) => (
            <ItemRow key={item.id} planId={planId} item={item} readOnly={readOnly} onMutated={onMutated} />
          ))
        )}
      </div>

      {err ? (
        <div className="px-4 pt-2">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}

      {/* Besin ekle */}
      {!readOnly ? (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[12px] font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            <Plus className="h-4 w-4" aria-hidden /> Besin Ekle
          </button>
        </div>
      ) : null}

      {pickerOpen ? (
        <FoodPickerDialog open onClose={() => setPickerOpen(false)} onPick={onAddFood} title="Besin Ekle" />
      ) : null}

      {settingsOpen ? (
        <MealSettingsDialog
          open
          onClose={() => setSettingsOpen(false)}
          planId={planId}
          meal={meal}
          days={days}
          busy={busy}
          setBusy={setBusy}
          onMutated={onMutated}
        />
      ) : null}

      {tplSaveOpen ? (
        <SaveMealTemplateModal
          mealId={meal.id}
          mealLabel={meal.label}
          onClose={() => setTplSaveOpen(false)}
          onSaved={() => setTplSaveOpen(false)}
        />
      ) : null}
    </div>
  );
}

/* ── Item satırı ── */
function ItemRow({
  planId,
  item,
  readOnly,
  onMutated,
}: {
  planId: string;
  item: PlanItem;
  readOnly: boolean;
  onMutated: () => void;
}) {
  const [amountOpen, setAmountOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [altOpen, setAltOpen] = useState(false);
  const [err, setErr] = useState("");
  const tp = useTranslations("beslenme.plan");
  const avoidedFoodIds = useAvoidedFoodIds();
  const isAvoided = isAvoidedFood(item.food_id, avoidedFoodIds);

  const totals = mealTotals([item]);
  const energy = totals.find((t) => t.nutrient_code === "energy");
  const protein = totals.find((t) => t.nutrient_code === "protein");
  const carb = totals.find((t) => t.nutrient_code === "carbohydrate");
  const fat = totals.find((t) => t.nutrient_code === "total_fat");

  const amountText = item.portion_label_snapshot
    ? `${item.quantity && item.quantity !== 1 ? `${formatAmount(item.quantity, "g")} × ` : ""}${item.portion_label_snapshot} · ${formatAmount(item.grams, "g")} g`
    : `${formatAmount(item.grams, "g")} g`;

  async function onDuplicate() {
    setErr("");
    const r = await copyItem(planId, item.id, item.meal_id);
    if (r.ok) onMutated();
    else setErr(friendlyPlanError(r.code, r.status));
  }
  async function onDelete() {
    setErr("");
    const r = await deleteItem(planId, item.id);
    if (r.ok) onMutated();
    else setErr(friendlyPlanError(r.code, r.status));
  }
  async function onReplace(payload: FoodPickPayload) {
    setErr("");
    const r = await replaceItemFood(planId, item.id, payload);
    if (r.ok) {
      setReplaceOpen(false);
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  const menuItems: MenuItem[] = readOnly
    ? []
    : [
        { label: "Miktar / Porsiyon", icon: <PenLine className="h-4 w-4" />, onClick: () => setAmountOpen(true) },
        { label: "Besini Değiştir", icon: <Repeat className="h-4 w-4" />, onClick: () => setReplaceOpen(true) },
        { label: "Alternatif Bul", icon: <Sparkles className="h-4 w-4" />, onClick: () => setAltOpen(true) },
        { label: "Çoğalt", icon: <Copy className="h-4 w-4" />, onClick: () => void onDuplicate() },
        { label: "Sil", icon: <Trash2 className="h-4 w-4" />, onClick: () => void onDelete(), danger: true },
      ];

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black text-slate-800">{item.food_name_snapshot}</p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-400">{amountText}</p>
          {item.food_id === null ? (
            <p className="mt-0.5 text-[10px] font-bold text-amber-600">Kaynak besin katalogda yok</p>
          ) : null}
          {isAvoided ? (
            <p className="mt-0.5 text-[10px] font-bold text-rose-600">⚠ {tp("avoidedItem")}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold text-slate-400">
            {protein ? <span>P {formatAmount(protein.amount, protein.unit_code)}</span> : null}
            {carb ? <span>K {formatAmount(carb.amount, carb.unit_code)}</span> : null}
            {fat ? <span>Y {formatAmount(fat.amount, fat.unit_code)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="whitespace-nowrap text-[13px] font-black text-slate-700">
            {energy ? formatAmount(energy.amount, energy.unit_code) : "0"}
            <span className="ml-0.5 text-[10px] font-bold text-slate-400">kcal</span>
          </span>
          {!readOnly ? <ActionMenu items={menuItems} label="Besin işlemleri" /> : null}
        </div>
      </div>

      {err ? (
        <div className="mt-2">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}

      {amountOpen ? (
        <ItemAmountDialog
          open
          onClose={() => setAmountOpen(false)}
          planId={planId}
          item={item}
          onMutated={onMutated}
        />
      ) : null}

      {replaceOpen ? (
        <FoodPickerDialog open onClose={() => setReplaceOpen(false)} onPick={onReplace} title="Besini Değiştir" />
      ) : null}

      {altOpen ? (
        <ItemAlternativesModal
          planId={planId}
          itemId={item.id}
          itemName={item.food_name_snapshot}
          readOnly={readOnly}
          onClose={() => setAltOpen(false)}
          onReplaced={() => {
            setAltOpen(false);
            onMutated();
          }}
        />
      ) : null}
    </div>
  );
}

/* ── Item miktar düzenleyici (grams) ── */
function ItemAmountDialog({
  open,
  onClose,
  planId,
  item,
  onMutated,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  item: PlanItem;
  onMutated: () => void;
}) {
  const [grams, setGrams] = useState(String(item.grams));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    const n = Number(grams.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Geçerli bir gram değeri girin.");
      return;
    }
    setSaving(true);
    const r = await patchItem(planId, item.id, { grams: n, portion_id: null, quantity: null });
    setSaving(false);
    if (r.ok) {
      onClose();
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Miktar" subtitle={item.food_name_snapshot} maxWidthClass="max-w-sm">
      <div className="flex flex-col gap-3">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <Field label="Miktar (gram)">
          <TextInput inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["50", "100", "150", "200"].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrams(g)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-bold text-slate-600 shadow-sm transition hover:bg-emerald-50 hover:text-emerald-700"
              >
                {g} g
              </button>
            ))}
          </div>
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

/* ── Öğün ayarları: ad / hedef / kopyala / sil ── */
function MealSettingsDialog({
  open,
  onClose,
  planId,
  meal,
  days,
  busy,
  setBusy,
  onMutated,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  meal: PlanMeal;
  days: PlanDaySummary[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onMutated: () => void;
}) {
  const [label, setLabel] = useState(meal.label);
  const [target, setTarget] = useState(meal.energy_target != null ? String(meal.energy_target) : "");
  const [copyDayId, setCopyDayId] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const otherDays = days.filter((d) => d.id !== meal.plan_day_id);

  async function saveMeta() {
    setErr("");
    setOk("");
    const l = label.trim();
    if (!l) {
      setErr("Öğün adı boş olamaz.");
      return;
    }
    let energyTarget: number | null = null;
    const raw = target.trim().replace(",", ".");
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setErr("Hedef geçerli bir sayı olmalı.");
        return;
      }
      energyTarget = Math.round(n);
    }
    setBusy(true);
    const r = await patchMeal(planId, meal.id, { label: l, energy_target: energyTarget });
    setBusy(false);
    if (r.ok) {
      setOk("Kaydedildi.");
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  async function doCopy() {
    setErr("");
    setOk("");
    if (!copyDayId) {
      setErr("Kopyalanacak günü seçin.");
      return;
    }
    setBusy(true);
    const r = await copyMeal(planId, meal.id, copyDayId);
    setBusy(false);
    if (r.ok) {
      setOk("Öğün kopyalandı.");
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  async function doDelete() {
    setErr("");
    setBusy(true);
    const r = await deleteMeal(planId, meal.id);
    setBusy(false);
    if (r.ok) {
      onClose();
      onMutated();
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Öğün Ayarları" subtitle={meal.label} maxWidthClass="max-w-md">
      <div className="flex flex-col gap-4">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        {ok ? <StatusMessage type="success">{ok}</StatusMessage> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Öğün Adı" required>
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Kalori Hedefi" hint="opsiyonel">
            <TextInput inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Örn: 500" />
          </Field>
        </div>
        <div className="flex justify-end">
          <PrimaryButton loading={busy} onClick={() => void saveMeta()}>
            Kaydet
          </PrimaryButton>
        </div>

        {otherDays.length > 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <p className="mb-2 text-[12px] font-black text-slate-600">Başka Güne Kopyala</p>
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <select
                  value={copyDayId}
                  onChange={(e) => setCopyDayId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/60"
                >
                  <option value="">Gün seçin…</option>
                  {otherDays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatDateShort(d.plan_date)}
                    </option>
                  ))}
                </select>
              </label>
              <GhostButton icon={<Copy className="h-4 w-4" />} loading={busy} onClick={() => void doCopy()}>
                Kopyala
              </GhostButton>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-rose-600">Silinsin mi?</span>
              <DangerButton loading={busy} onClick={() => void doDelete()}>
                Evet, Sil
              </DangerButton>
              <GhostButton onClick={() => setConfirmDel(false)}>Vazgeç</GhostButton>
            </div>
          ) : (
            <DangerButton icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDel(true)}>
              Öğünü Sil
            </DangerButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
