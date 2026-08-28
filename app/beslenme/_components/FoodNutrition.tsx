"use client";
/**
 * Beslenme FAZ 4 — Besin detayında BESİN DEĞERLERİ / PORSİYONLAR / GELENEKSEL panelleri.
 * SYSTEM food → salt-okunur; CUSTOM food → düzenlenebilir. Nutrient facts ile geleneksel
 * nitelik GÖRSEL OLARAK AYRIDIR. Eksik değer "—" gösterilir (0 DEĞİL).
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FoodNutrientView, FoodPortionView, FoodTraditional, FrameworkRef } from "@/lib/beslenme/beslenmeClient";
import { putFoodNutrients, putFoodPortions, putFoodTraditional } from "@/lib/beslenme/beslenmeClient";
import { calculateFoodForPortion, formatAmount, type Per100g } from "@/lib/beslenme/calc/nutrients";
import { friendlyError } from "./constants";
import { Card, EmptyState, Field, GhostButton, PrimaryButton, SelectInput, StatusMessage, TextInput } from "./primitives";

/** Düzenleme için MVP nutrient sırası + kanonik birim (Class A seed ile uyumlu). */
const MVP_NUTRIENTS: Array<{ code: string; label: string; unit: string }> = [
  { code: "energy", label: "Enerji", unit: "kcal" },
  { code: "protein", label: "Protein", unit: "g" },
  { code: "carbohydrate", label: "Karbonhidrat", unit: "g" },
  { code: "total_fat", label: "Toplam Yağ", unit: "g" },
  { code: "fiber", label: "Lif", unit: "g" },
  { code: "sugar", label: "Şeker", unit: "g" },
  { code: "sodium", label: "Sodyum", unit: "mg" },
  { code: "potassium", label: "Potasyum", unit: "mg" },
];

function per100gFrom(nutrients: FoodNutrientView[]): Per100g[] {
  return nutrients
    .filter((n) => n.nutrient && n.unit)
    .map((n) => ({ nutrient_code: n.nutrient!.code, amount: n.amount, unit_code: n.unit!.code }));
}

// ── BESİN DEĞERLERİ ─────────────────────────────────────────────────────────
export function NutrientsPanel({
  foodId,
  isSystem,
  nutrients,
  onChanged,
}: {
  foodId: string;
  isSystem: boolean;
  nutrients: FoodNutrientView[];
  onChanged: () => void;
}) {
  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of nutrients) if (n.nutrient) m[n.nutrient.code] = String(n.amount);
    return m;
  }, [nutrients]);
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const byCode = useMemo(() => {
    const m: Record<string, FoodNutrientView> = {};
    for (const n of nutrients) if (n.nutrient) m[n.nutrient.code] = n;
    return m;
  }, [nutrients]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const items: Array<{ nutrient_code: string; amount: number; unit_code: string }> = [];
    for (const row of MVP_NUTRIENTS) {
      const raw = (vals[row.code] ?? "").trim().replace(",", ".");
      if (raw === "") continue; // boş = satır yok (0 yazma yok)
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0) {
        setBusy(false);
        setMsg({ type: "error", text: `${row.label}: geçerli bir sayı girin (negatif olamaz).` });
        return;
      }
      items.push({ nutrient_code: row.code, amount, unit_code: row.unit });
    }
    const r = await putFoodNutrients(foodId, items);
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      setMsg({ type: "success", text: "Besin değerleri kaydedildi." });
      onChanged();
    } else setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-black text-slate-700">100 g için</p>
        {!isSystem && !editing ? (
          <GhostButton onClick={() => setEditing(true)}>Düzenle</GhostButton>
        ) : null}
      </div>
      {msg ? <StatusMessage type={msg.type}>{msg.text}</StatusMessage> : null}

      {isSystem && nutrients.length === 0 ? (
        <EmptyState title="Bu besin için değer girilmemiş." description="Sistem besni; değerler USDA kaynağından gelir." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-[13px]">
            <tbody>
              {MVP_NUTRIENTS.map((row) => {
                const existing = byCode[row.code];
                return (
                  <tr key={row.code} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-600">{row.label}</td>
                    <td className="px-3 py-2 text-right">
                      {editing ? (
                        <input
                          inputMode="decimal"
                          value={vals[row.code] ?? ""}
                          onChange={(e) => setVals((p) => ({ ...p, [row.code]: e.target.value }))}
                          placeholder="—"
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-[13px] focus:border-emerald-400 focus:outline-none"
                        />
                      ) : existing ? (
                        <span className="font-black text-slate-800">
                          {formatAmount(existing.amount, existing.unit?.code ?? row.unit)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="w-10 px-2 py-2 text-left text-[11px] text-slate-400">{existing?.unit?.symbol ?? row.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div className="flex gap-2">
          <PrimaryButton loading={busy} onClick={() => void save()}>Kaydet</PrimaryButton>
          <GhostButton onClick={() => { setEditing(false); setVals(initial); setMsg(null); }}>Vazgeç</GhostButton>
        </div>
      ) : null}
    </div>
  );
}

// ── PORSİYONLAR ─────────────────────────────────────────────────────────────
type PortionDraft = { label_tr: string; measure_unit_code: string; gram_weight: string; is_default: boolean };

export function PortionsPanel({
  foodId,
  isSystem,
  portions,
  nutrients,
  onChanged,
}: {
  foodId: string;
  isSystem: boolean;
  portions: FoodPortionView[];
  nutrients: FoodNutrientView[];
  onChanged: () => void;
}) {
  const per100 = useMemo(() => per100gFrom(nutrients), [nutrients]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<PortionDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function startEdit() {
    setDrafts(
      portions.map((p) => ({
        label_tr: p.label_tr,
        measure_unit_code: p.unit?.code ?? "piece",
        gram_weight: String(p.gram_weight),
        is_default: p.is_default,
      })),
    );
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const items = [];
    for (const d of drafts) {
      const g = Number((d.gram_weight ?? "").trim().replace(",", "."));
      if (!d.label_tr.trim() || !Number.isFinite(g) || g <= 0) {
        setBusy(false);
        setMsg({ type: "error", text: "Her porsiyon için ad ve 0'dan büyük gram değeri girin." });
        return;
      }
      items.push({ label_tr: d.label_tr.trim(), measure_unit_code: d.measure_unit_code, gram_weight: g, is_default: d.is_default });
    }
    const r = await putFoodPortions(foodId, items);
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      setMsg({ type: "success", text: "Porsiyonlar kaydedildi." });
      onChanged();
    } else setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        {msg ? <StatusMessage type={msg.type}>{msg.text}</StatusMessage> : null}
        {drafts.map((d, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <TextInput value={d.label_tr} placeholder="1 orta elma" onChange={(e) => setDrafts((p) => p.map((x, j) => (j === i ? { ...x, label_tr: e.target.value } : x)))} />
            <SelectInput value={d.measure_unit_code} onChange={(e) => setDrafts((p) => p.map((x, j) => (j === i ? { ...x, measure_unit_code: e.target.value } : x)))}>
              <option value="piece">adet</option>
              <option value="serving">porsiyon</option>
              <option value="cup">su bardağı</option>
              <option value="tbsp">yemek kaşığı</option>
              <option value="tsp">tatlı kaşığı</option>
            </SelectInput>
            <input inputMode="decimal" value={d.gram_weight} placeholder="g" onChange={(e) => setDrafts((p) => p.map((x, j) => (j === i ? { ...x, gram_weight: e.target.value } : x)))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-[13px]" />
            <button type="button" aria-label="Sil" onClick={() => setDrafts((p) => p.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div>
          <GhostButton icon={<Plus className="h-4 w-4" />} onClick={() => setDrafts((p) => [...p, { label_tr: "", measure_unit_code: "piece", gram_weight: "", is_default: false }])}>
            Porsiyon Ekle
          </GhostButton>
        </div>
        <div className="flex gap-2">
          <PrimaryButton loading={busy} onClick={() => void save()}>Kaydet</PrimaryButton>
          <GhostButton onClick={() => { setEditing(false); setMsg(null); }}>Vazgeç</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-black text-slate-700">Porsiyonlar</p>
        {!isSystem ? <GhostButton onClick={startEdit}>Düzenle</GhostButton> : null}
      </div>
      {msg ? <StatusMessage type={msg.type}>{msg.text}</StatusMessage> : null}
      {portions.length === 0 ? (
        <EmptyState title="Porsiyon eklenmemiş." description="Ev ölçüsü → gram karşılığı (ör. 1 orta = 182 g)." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {portions.map((p) => {
            const calc = per100.length ? calculateFoodForPortion(per100, p.quantity, p.gram_weight) : null;
            const energy = calc?.values.find((v) => v.nutrient_code === "energy");
            const open = openId === p.id;
            return (
              <li key={p.id} className="rounded-xl border border-slate-100 bg-white/70">
                <button type="button" onClick={() => setOpenId(open ? null : p.id)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left">
                  <span className="text-[13px] font-bold text-slate-800">{p.label_tr}</span>
                  <span className="text-[12px] font-medium text-slate-400">
                    {p.gram_weight} g{energy ? ` · ${formatAmount(energy.amount, "kcal")} kcal` : ""}
                  </span>
                </button>
                {open && calc ? (
                  <div className="border-t border-slate-50 px-3.5 py-2 text-[12px] text-slate-500">
                    <span className="font-bold text-slate-600">{p.label_tr} ({calc.grams} g):</span>{" "}
                    {calc.values
                      .filter((v) => ["energy", "protein", "carbohydrate", "total_fat", "fiber"].includes(v.nutrient_code))
                      .map((v) => {
                        const nv = nutrients.find((n) => n.nutrient?.code === v.nutrient_code);
                        return `${nv?.nutrient?.name_tr ?? v.nutrient_code} ${formatAmount(v.amount, v.unit_code)} ${nv?.unit?.symbol ?? ""}`;
                      })
                      .join(" · ")}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── GELENEKSEL / MİZAÇ ──────────────────────────────────────────────────────
const THERMAL = [{ v: "", l: "—" }, { v: "hot", l: "Sıcak" }, { v: "cold", l: "Soğuk" }, { v: "neutral", l: "Ilıman" }];
const MOISTURE = [{ v: "", l: "—" }, { v: "wet", l: "Yaş" }, { v: "dry", l: "Kuru" }, { v: "neutral", l: "Dengeli" }];
const THERMAL_L: Record<string, string> = { hot: "Sıcak", cold: "Soğuk", neutral: "Ilıman" };
const MOISTURE_L: Record<string, string> = { wet: "Yaş", dry: "Kuru", neutral: "Dengeli" };

export function TraditionalPanel({
  foodId,
  isSystem,
  traditional,
  frameworks,
  onChanged,
}: {
  foodId: string;
  isSystem: boolean;
  traditional: FoodTraditional | null;
  frameworks: FrameworkRef[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [thermal, setThermal] = useState(traditional?.thermal_quality ?? "");
  const [moisture, setMoisture] = useState(traditional?.moisture_quality ?? "");
  const [frameworkId, setFrameworkId] = useState(traditional?.framework_id ?? "");
  const [notes, setNotes] = useState(traditional?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await putFoodTraditional(foodId, {
      framework_id: frameworkId || null,
      thermal_quality: thermal || null,
      moisture_quality: moisture || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      setMsg({ type: "success", text: "Geleneksel nitelik kaydedildi." });
      onChanged();
    } else setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="border-amber-100 bg-amber-50/40 p-3">
        <p className="text-[11px] font-medium text-amber-700">
          Geleneksel/bütünsel sınıflandırmadır; besin kompozisyonu veya klinik beslenme değeri değildir.
          Tanı/tedavi amacı taşımaz.
        </p>
      </Card>
      {msg ? <StatusMessage type={msg.type}>{msg.text}</StatusMessage> : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Sıcaklık niteliği">
              <SelectInput value={thermal} onChange={(e) => setThermal(e.target.value)}>
                {THERMAL.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </SelectInput>
            </Field>
            <Field label="Nem niteliği">
              <SelectInput value={moisture} onChange={(e) => setMoisture(e.target.value)}>
                {MOISTURE.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </SelectInput>
            </Field>
            <Field label="Çerçeve (opsiyonel)">
              <SelectInput value={frameworkId} onChange={(e) => setFrameworkId(e.target.value)}>
                <option value="">—</option>
                {frameworks.map((f) => <option key={f.id} value={f.id}>{f.name_tr}</option>)}
              </SelectInput>
            </Field>
          </div>
          <Field label="Not">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Geleneksel kaynak/gözlem notu" />
          </Field>
          <div className="flex gap-2">
            <PrimaryButton loading={busy} onClick={() => void save()}>Kaydet</PrimaryButton>
            <GhostButton onClick={() => setEditing(false)}>Vazgeç</GhostButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {traditional?.thermal_quality ? (
              <span className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-[12px] font-bold text-orange-700">
                {THERMAL_L[traditional.thermal_quality]}
              </span>
            ) : null}
            {traditional?.moisture_quality ? (
              <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[12px] font-bold text-sky-700">
                {MOISTURE_L[traditional.moisture_quality]}
              </span>
            ) : null}
            {!traditional?.thermal_quality && !traditional?.moisture_quality ? (
              <span className="text-[13px] text-slate-400">Geleneksel nitelik girilmemiş.</span>
            ) : null}
          </div>
          {traditional?.notes ? <p className="text-[13px] text-slate-600">{traditional.notes}</p> : null}
          {!isSystem ? <div><GhostButton onClick={() => setEditing(true)}>Düzenle</GhostButton></div> : null}
        </div>
      )}
    </div>
  );
}
