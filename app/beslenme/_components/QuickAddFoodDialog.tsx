"use client";
/**
 * Manuel "Besin Ekle" — hızlı ekleme modalı. Katalogda olmayan besini ad + kalori + elde olan
 * makro/mikro değerlerle ekler. Değerler 100 g esaslıdır. BOŞ ≠ 0: boş bırakılan alan GÖNDERİLMEZ
 * ("bilinmiyor"); açıkça 0 girilen alan kaydedilir. Kaynak: Manuel (sahte FDC/USDA üretilmez).
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useBeslenmeLabels } from "./useBeslenmeLabels";
import { quickCreateFood, type FoodGroupRef, type Food, type QuickAddPayload } from "@/lib/beslenme/beslenmeClient";
import { kcalMacroConsistency } from "@/lib/beslenme/quickAddFood";
import { Field, PrimaryButton, GhostButton, StatusMessage, TextInput, SelectInput, TextArea } from "./primitives";

type NutrientField = { code: string; unit_code: string; label: string; suffix: string };
const PRIMARY: NutrientField[] = [
  { code: "energy", unit_code: "kcal", label: "Kalori", suffix: "kcal" },
  { code: "protein", unit_code: "g", label: "Protein", suffix: "g" },
  { code: "carbohydrate", unit_code: "g", label: "Karbonhidrat", suffix: "g" },
  { code: "total_fat", unit_code: "g", label: "Yağ", suffix: "g" },
];
const MORE: NutrientField[] = [
  { code: "fiber", unit_code: "g", label: "Lif", suffix: "g" },
  { code: "sugar", unit_code: "g", label: "Şeker", suffix: "g" },
  { code: "saturated_fat", unit_code: "g", label: "Doymuş Yağ", suffix: "g" },
  { code: "sodium", unit_code: "mg", label: "Sodyum", suffix: "mg" },
  { code: "potassium", unit_code: "mg", label: "Potasyum", suffix: "mg" },
  { code: "calcium", unit_code: "mg", label: "Kalsiyum", suffix: "mg" },
  { code: "iron", unit_code: "mg", label: "Demir", suffix: "mg" },
  { code: "magnesium", unit_code: "mg", label: "Magnezyum", suffix: "mg" },
  { code: "zinc", unit_code: "mg", label: "Çinko", suffix: "mg" },
  { code: "vitamin_a", unit_code: "mcg", label: "A Vitamini", suffix: "mcg" },
  { code: "vitamin_c", unit_code: "mg", label: "C Vitamini", suffix: "mg" },
  { code: "vitamin_d", unit_code: "mcg", label: "D Vitamini", suffix: "mcg" },
  { code: "vitamin_b12", unit_code: "mcg", label: "B12 Vitamini", suffix: "mcg" },
  { code: "folate", unit_code: "mcg", label: "Folat", suffix: "mcg" },
];

/** "12,5"/"12.5" → sayı; "" → undefined (bilinmiyor); geçersiz/negatif → NaN (hata). */
function parseVal(raw: string): number | undefined | typeof NaN {
  const t = raw.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

export function QuickAddFoodDialog({
  open,
  onClose,
  onCreated,
  groups = [],
  initialName = "",
  title,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (food: Food) => void;
  groups?: FoodGroupRef[];
  initialName?: string;
  title?: string;
}) {
  const tq = useTranslations("beslenme.quickAdd");
  const tf = useTranslations("beslenme.nutrientField");
  const bl = useBeslenmeLabels();
  // Alan etiketi: kanonik kod → ekran dili (TR: bugünkü etiket birebir; "Kalori"/"Yağ" hızlı ekleme adları).
  const fieldLabel = (f: NutrientField) => (f.code === "energy" ? tq("kcal") : f.code === "total_fat" ? tq("fat") : tf.has(f.code) ? tf(f.code) : f.label);
  const [nameTr, setNameTr] = useState(initialName);
  const [groupId, setGroupId] = useState("");
  const [prep, setPrep] = useState("");
  const [description, setDescription] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [portionLabel, setPortionLabel] = useState("");
  const [portionGram, setPortionGram] = useState("");
  const [showPortion, setShowPortion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const setVal = (code: string, v: string) => setVals((p) => ({ ...p, [code]: v }));

  // kalori↔makro tutarlılık uyarısı (yalnız uyarı; otomatik düzeltme yok)
  const kcalWarn = useMemo(() => {
    const num = (c: string) => { const p = parseVal(vals[c] ?? ""); return typeof p === "number" ? p : null; };
    return kcalMacroConsistency({ energy: num("energy"), protein: num("protein"), carbohydrate: num("carbohydrate"), total_fat: num("total_fat") });
  }, [vals]);

  if (!open) return null;

  async function save() {
    setMsg(null);
    if (!nameTr.trim()) { setMsg({ type: "error", text: tq("nameRequired") }); return; }
    // nutrients: yalnız DOLU alanlar (boş = gönderilmez). Geçersiz/negatif → hata.
    const nutrients: QuickAddPayload["nutrients"] = [];
    for (const f of [...PRIMARY, ...MORE]) {
      const raw = vals[f.code];
      if (raw == null || raw.trim() === "") continue; // BOŞ ≠ 0 → atla
      const p = parseVal(raw);
      if (Number.isNaN(p as number)) { setMsg({ type: "error", text: tq("valueInvalid", { label: fieldLabel(f) }) }); return; }
      nutrients!.push({ nutrient_code: f.code, amount: p as number, unit_code: f.unit_code });
    }
    // porsiyon: yalnız hem ad hem gram varsa (gram bilinmiyorsa TAHMİN YOK)
    let portion: QuickAddPayload["portion"] = null;
    if (portionLabel.trim() || portionGram.trim()) {
      const g = parseVal(portionGram);
      if (!portionLabel.trim()) { setMsg({ type: "error", text: tq("portionNameRequired") }); return; }
      if (typeof g !== "number" || g <= 0) { setMsg({ type: "error", text: tq("portionGramRequired") }); return; }
      portion = { label_tr: portionLabel.trim(), gram_weight: g, measure_unit_code: "serving", quantity: 1 };
    }
    setSaving(true);
    const r = await quickCreateFood({
      name_tr: nameTr.trim(),
      food_group_id: groupId || null,
      prep_state: prep || null,
      description: description.trim() || null,
      nutrients,
      portion,
    });
    setSaving(false);
    if (r.ok && r.data?.food) { onCreated(r.data.food); }
    else if (r.code === "DUPLICATE_NAME") setMsg({ type: "error", text: tq("duplicateName") });
    else setMsg({ type: "error", text: bl.error(r.code, r.status) });
  }

  // Portal: plan besin seçici (Modal) içinden açıldığında da viewport'u kaplar; üst kapsayıcının
  // backdrop-filter/overflow kutusuna sıkışmaz. z-[70] > ortak Modal z-[60].
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mt-6 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-900">{title ?? tq("title")}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={tq("close")}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-[12px] font-medium text-slate-400">{tq("intro")}</p>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={tq("nameLabel")} required>
              <TextInput value={nameTr} onChange={(e) => setNameTr(e.target.value)} placeholder={tq("namePlaceholder")} autoFocus />
            </Field>
            <Field label={tq("groupLabel")}>
              <SelectInput value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">{tq("noGroup")}</option>
                {groups.map((g) => (<option key={g.id} value={g.id}>{g.name_tr}</option>))}
              </SelectInput>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRIMARY.map((f) => (
              <Field key={f.code} label={`${fieldLabel(f)} (${f.suffix})`}>
                <TextInput inputMode="decimal" value={vals[f.code] ?? ""} onChange={(e) => setVal(f.code, e.target.value)} placeholder="—" />
              </Field>
            ))}
          </div>

          {kcalWarn.hasWarning ? (
            <StatusMessage type="info">
              {tq("kcalWarn", { given: kcalWarn.givenKcal ?? "", computed: kcalWarn.computedKcal ?? "", pct: kcalWarn.diffPct ?? "" })}
            </StatusMessage>
          ) : null}

          <button type="button" onClick={() => setShowMore((s) => !s)} className="w-fit text-[12px] font-bold text-emerald-700 hover:underline">
            {showMore ? tq("hideMore") : tq("showMore")}
          </button>
          {showMore ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
              {MORE.map((f) => (
                <Field key={f.code} label={`${fieldLabel(f)} (${f.suffix})`}>
                  <TextInput inputMode="decimal" value={vals[f.code] ?? ""} onChange={(e) => setVal(f.code, e.target.value)} placeholder="—" />
                </Field>
              ))}
            </div>
          ) : null}

          <button type="button" onClick={() => setShowPortion((s) => !s)} className="w-fit text-[12px] font-bold text-emerald-700 hover:underline">
            {showPortion ? tq("hidePortion") : tq("showPortion")}
          </button>
          {showPortion ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
              <Field label={tq("portionNameLabel")}>
                <TextInput value={portionLabel} onChange={(e) => setPortionLabel(e.target.value)} placeholder={tq("portionNamePlaceholder")} />
              </Field>
              <Field label={tq("portionGramLabel")} hint={tq("portionGramHint")}>
                <TextInput inputMode="decimal" value={portionGram} onChange={(e) => setPortionGram(e.target.value)} placeholder={tq("portionGramPlaceholder")} />
              </Field>
            </div>
          ) : null}

          <Field label={tq("descLabel")} hint={tq("descHint")}>
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tq("descPlaceholder")} />
          </Field>

          {prep ? null : null}
          <Field label={tq("prepLabel")}>
            <SelectInput value={prep} onChange={(e) => setPrep(e.target.value)}>
              <option value="">{tq("prepNone")}</option>
              {bl.prepStateOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </SelectInput>
          </Field>

          {msg ? <StatusMessage type={msg.type}>{msg.text}</StatusMessage> : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <GhostButton onClick={onClose}>{tq("cancel")}</GhostButton>
            <PrimaryButton icon={<Plus className="h-4 w-4" />} loading={saving} onClick={() => void save()}>
              {tq("save")}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
