"use client";
/**
 * Beslenme FAZ 6 — plan editörü ek modalleri:
 *   SaveMealTemplateModal — öğünü şablon olarak kaydet (server snapshot verbatim).
 *   ItemAlternativesModal — "Kaloriye Göre Besin Değiştir" (deterministik; AI YOK; tıbbi iddia YOK).
 *     Yalnız kalori-eşleşmeli miktar; besinsel eşdeğerlik İMA ETMEZ (UI dili netleştirildi).
 * MealCard'a additive; kilitli plan-motoru mantığını değiştirmez.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePlanFormat } from "./usePlanFormat";
import { createTemplate, getItemAlternatives, type AlternativeRow } from "@/lib/beslenme/faz6Client";
import { replaceItemFood } from "@/lib/beslenme/planClient";
import { Modal } from "./planUi";
import { GhostButton, PrimaryButton, StatusMessage, TextInput, InlineSpinner, EmptyState } from "../../_components/primitives";
import { runInEffect } from "@/lib/runInEffect";

export function SaveMealTemplateModal({
  mealId,
  mealLabel,
  onClose,
  onSaved,
}: {
  mealId: string;
  mealLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ta = useTranslations("beslenme.alt");
  const [title, setTitle] = useState(mealLabel);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setErr("");
    const r = await createTemplate({ from: "meal", source_id: mealId, title: t });
    setSaving(false);
    if (r.ok) onSaved();
    else setErr(ta("tplSaveFailed"));
  };

  return (
    <Modal open onClose={onClose} title={ta("tplTitle")} subtitle={mealLabel} maxWidthClass="max-w-md">
      <div className="flex flex-col gap-3">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ta("tplPlaceholder")} autoFocus />
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <div className="flex justify-end gap-2">
          <GhostButton onClick={onClose}>{ta("cancel")}</GhostButton>
          <PrimaryButton loading={saving} disabled={!title.trim()} onClick={() => void save()}>
            {ta("save")}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

export function ItemAlternativesModal({
  planId,
  itemId,
  itemName,
  readOnly,
  onClose,
  onReplaced,
}: {
  planId: string;
  itemId: string;
  itemName: string;
  readOnly: boolean;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const ta = useTranslations("beslenme.alt");
  const pf = usePlanFormat();
  const [sameGroupOnly, setSameGroupOnly] = useState(true);
  const [alts, setAlts] = useState<AlternativeRow[]>([]);
  const [target, setTarget] = useState<{ name: string; grams: number; energyTotal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const r = await getItemAlternatives(planId, itemId, { sameGroupOnly });
    if (r.ok && r.data) {
      setAlts(r.data.alternatives ?? []);
      setTarget(r.data.target ?? null);
    } else setErr(ta("loadFailed"));
    setLoading(false);
  }, [planId, itemId, sameGroupOnly, ta]);

  useEffect(() => {
    runInEffect(() => void load());
  }, [load]);

  const replace = async (a: AlternativeRow) => {
    setBusyId(a.food_id);
    setErr("");
    const r = await replaceItemFood(planId, itemId, { food_id: a.food_id, grams: a.grams });
    setBusyId(null);
    if (r.ok) onReplaced();
    else setErr(ta("replaceFailed"));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={ta("title")}
      subtitle={itemName}
      maxWidthClass="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium leading-relaxed text-slate-400">
          {ta("disclaimer")}
        </p>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[12px] font-bold text-slate-600">
          <input type="checkbox" checked={sameGroupOnly} onChange={(e) => setSameGroupOnly(e.target.checked)} />
          {ta("sameGroupOnly")}
        </label>

        {loading ? (
          <InlineSpinner />
        ) : err ? (
          <StatusMessage type="error">{err}</StatusMessage>
        ) : alts.length === 0 ? (
          <EmptyState title={ta("emptyTitle")} description={ta("emptyDesc")} />
        ) : (
          <div className="flex flex-col gap-2">
            {target ? (
              <p className="text-[12px] font-bold text-slate-500">
                {ta("target", { name: target.name, kcal: Math.round(target.energyTotal).toLocaleString(pf.numTag) })}
              </p>
            ) : null}
            {alts.map((a) => (
              <div key={a.food_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-black text-slate-700">{a.name_tr}</p>
                  <p className="text-[11px] font-bold text-slate-400">
                    ~{Math.round(a.grams).toLocaleString(pf.numTag)} g · {Math.round(a.energyPer100)} kcal/100g
                    {a.ownership === "system" ? ta("ownSystem") : ta("ownCustom")}
                  </p>
                </div>
                {!readOnly ? (
                  <PrimaryButton loading={busyId === a.food_id} onClick={() => void replace(a)}>
                    {ta("replaceWith")}
                  </PrimaryButton>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
