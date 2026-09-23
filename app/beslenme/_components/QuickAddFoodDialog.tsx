"use client";
/**
 * Manuel "Besin Ekle" — hızlı ekleme modalı. Katalogda olmayan besini ad + kalori + elde olan
 * makro/mikro değerlerle ekler. Değerler 100 g esaslıdır. BOŞ ≠ 0: boş bırakılan alan GÖNDERİLMEZ
 * ("bilinmiyor"); açıkça 0 girilen alan kaydedilir. Kaynak: Manuel (sahte FDC/USDA üretilmez).
 */
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { quickCreateFood, type FoodGroupRef, type Food, type QuickAddPayload } from "@/lib/beslenme/beslenmeClient";
import { kcalMacroConsistency } from "@/lib/beslenme/quickAddFood";
import { Field, PrimaryButton, GhostButton, StatusMessage, TextInput, SelectInput, TextArea } from "./primitives";
import { PREP_STATE_OPTIONS, friendlyError } from "./constants";

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
  title = "Besin Ekle",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (food: Food) => void;
  groups?: FoodGroupRef[];
  initialName?: string;
  title?: string;
}) {
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
    if (!nameTr.trim()) { setMsg({ type: "error", text: "Besin adı zorunludur." }); return; }
    // nutrients: yalnız DOLU alanlar (boş = gönderilmez). Geçersiz/negatif → hata.
    const nutrients: QuickAddPayload["nutrients"] = [];
    for (const f of [...PRIMARY, ...MORE]) {
      const raw = vals[f.code];
      if (raw == null || raw.trim() === "") continue; // BOŞ ≠ 0 → atla
      const p = parseVal(raw);
      if (Number.isNaN(p as number)) { setMsg({ type: "error", text: `${f.label} için geçerli, negatif olmayan bir sayı girin.` }); return; }
      nutrients!.push({ nutrient_code: f.code, amount: p as number, unit_code: f.unit_code });
    }
    // porsiyon: yalnız hem ad hem gram varsa (gram bilinmiyorsa TAHMİN YOK)
    let portion: QuickAddPayload["portion"] = null;
    if (portionLabel.trim() || portionGram.trim()) {
      const g = parseVal(portionGram);
      if (!portionLabel.trim()) { setMsg({ type: "error", text: "Porsiyon için ad girin veya porsiyonu boş bırakın." }); return; }
      if (typeof g !== "number" || g <= 0) { setMsg({ type: "error", text: "Porsiyonun gram karşılığını girin (bilinmiyorsa porsiyonu boş bırakın)." }); return; }
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
    else if (r.code === "DUPLICATE_NAME") setMsg({ type: "error", text: "Bu adda bir besin zaten var. Farklı bir ad deneyin veya mevcut besni kullanın." });
    else setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mt-6 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Kapat">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-[12px] font-medium text-slate-400">Değerler 100 g içindir. Yalnız bildiğiniz değerleri girin; boş bıraktıklarınız sonradan tamamlanabilir.</p>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Besin Adı (Türkçe)" required>
              <TextInput value={nameTr} onChange={(e) => setNameTr(e.target.value)} placeholder="Örn: Ev yapımı tarhana" autoFocus />
            </Field>
            <Field label="Besin Grubu">
              <SelectInput value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Grupsuz</option>
                {groups.map((g) => (<option key={g.id} value={g.id}>{g.name_tr}</option>))}
              </SelectInput>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRIMARY.map((f) => (
              <Field key={f.code} label={`${f.label} (${f.suffix})`}>
                <TextInput inputMode="decimal" value={vals[f.code] ?? ""} onChange={(e) => setVal(f.code, e.target.value)} placeholder="—" />
              </Field>
            ))}
          </div>

          {kcalWarn.hasWarning ? (
            <StatusMessage type="info">
              Girdiğiniz kalori ({kcalWarn.givenKcal} kcal) makrolardan hesaplanandan (~{kcalWarn.computedKcal} kcal, %{kcalWarn.diffPct} fark) belirgin farklı. Değerleri kontrol edin — otomatik düzeltme yapılmaz.
            </StatusMessage>
          ) : null}

          <button type="button" onClick={() => setShowMore((s) => !s)} className="w-fit text-[12px] font-bold text-emerald-700 hover:underline">
            {showMore ? "− Diğer değerleri gizle" : "+ Diğer değerler (lif, şeker, mineral, vitamin)"}
          </button>
          {showMore ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
              {MORE.map((f) => (
                <Field key={f.code} label={`${f.label} (${f.suffix})`}>
                  <TextInput inputMode="decimal" value={vals[f.code] ?? ""} onChange={(e) => setVal(f.code, e.target.value)} placeholder="—" />
                </Field>
              ))}
            </div>
          ) : null}

          <button type="button" onClick={() => setShowPortion((s) => !s)} className="w-fit text-[12px] font-bold text-emerald-700 hover:underline">
            {showPortion ? "− Porsiyonu gizle" : "+ Porsiyon ekle (isteğe bağlı)"}
          </button>
          {showPortion ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
              <Field label="Porsiyon Adı">
                <TextInput value={portionLabel} onChange={(e) => setPortionLabel(e.target.value)} placeholder="Örn: 1 kase" />
              </Field>
              <Field label="Gram Karşılığı (g)" hint="Bilinmiyorsa boş bırakın; tahmin edilmez.">
                <TextInput inputMode="decimal" value={portionGram} onChange={(e) => setPortionGram(e.target.value)} placeholder="Örn: 200" />
              </Field>
            </div>
          ) : null}

          <Field label="Kaynak / Açıklama (isteğe bağlı)" hint="Örn: ürün etiketi, üretici bilgisi.">
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bu besin manuel eklenmiştir; kaynak notu ekleyebilirsiniz." />
          </Field>

          {prep ? null : null}
          <Field label="Hazırlık Durumu">
            <SelectInput value={prep} onChange={(e) => setPrep(e.target.value)}>
              <option value="">Belirtilmemiş</option>
              {PREP_STATE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </SelectInput>
          </Field>

          {msg ? <StatusMessage type={msg.type}>{msg.text}</StatusMessage> : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <GhostButton onClick={onClose}>Vazgeç</GhostButton>
            <PrimaryButton icon={<Plus className="h-4 w-4" />} loading={saving} onClick={() => void save()}>
              Kaydet
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
