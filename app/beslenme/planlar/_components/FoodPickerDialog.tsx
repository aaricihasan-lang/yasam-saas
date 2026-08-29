"use client";
/**
 * Besin seçici modal — hem "ekle" hem "değiştir" için (aynı payload şekli).
 * Arama → listFoods; seçimde getFood ile porsiyon/nutrient; GRAM veya PORSİYON
 * miktarı; canlı toplam önizleme (sumNutrients). TR ondalık ("12,5") kabul edilir.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, Search } from "lucide-react";
import {
  getFood,
  listFoods,
  type Food,
  type FoodNutrientView,
  type FoodPortionView,
} from "@/lib/beslenme/beslenmeClient";
import { sumNutrients } from "@/lib/beslenme/planContracts";
import { formatAmount } from "@/lib/beslenme/calc/nutrients";
import { Field, GhostButton, PrimaryButton, StatusMessage, TextInput } from "../../_components/primitives";
import { Modal, MacroChips, EnergyTargetLine } from "./planUi";
import { friendlyPlanError } from "./planFormat";

export type FoodPickPayload = {
  food_id: string;
  grams?: number;
  portion_id?: string;
  quantity?: number;
};

/** "12,5" → 12.5; geçersiz/0/negatif → null. */
function parsePositive(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type Mode = "gram" | "portion";

export function FoodPickerDialog({
  open,
  onClose,
  onPick,
  title = "Besin Ekle",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (payload: FoodPickPayload) => void | Promise<void>;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(true);
  const [listErr, setListErr] = useState("");

  const [selected, setSelected] = useState<Food | null>(null);
  const [nutrients, setNutrients] = useState<FoodNutrientView[]>([]);
  const [portions, setPortions] = useState<FoodPortionView[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [mode, setMode] = useState<Mode>("gram");
  const [grams, setGrams] = useState("100");
  const [portionId, setPortionId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  // Arama debounce. (Modal koşullu mount edildiği için "açılışta sıfırla" gerekmez.)
  useEffect(() => {
    if (selected) return;
    const term = q.trim();
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        const r = await listFoods({ q: term || undefined });
        setSearching(false);
        if (r.ok && r.data) {
          setResults(r.data.foods ?? []);
          setListErr("");
        } else {
          setResults([]);
          setListErr(friendlyPlanError(r.code, r.status));
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [q, selected]);

  async function pickFood(food: Food) {
    setSelected(food);
    setDetailLoading(true);
    setErr("");
    const r = await getFood(food.id);
    setDetailLoading(false);
    if (r.ok && r.data) {
      setNutrients(r.data.nutrients ?? []);
      const ps = r.data.portions ?? [];
      setPortions(ps);
      const def = ps.find((p) => p.is_default) ?? ps[0];
      if (def) {
        setMode("portion");
        setPortionId(def.id);
        setQuantity("1");
      } else {
        setMode("gram");
        setGrams("100");
      }
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  // Snapshot: food nutrient (per-100 g) → {nutrient_code, amount, unit_code}.
  const snapshot = useMemo(
    () =>
      nutrients
        .filter((n) => n.nutrient && n.unit)
        .map((n) => ({
          nutrient_code: n.nutrient!.code,
          amount: n.amount,
          unit_code: n.unit!.code,
        })),
    [nutrients],
  );

  const activePortion = portions.find((p) => p.id === portionId) ?? null;

  // Efektif gram: gram modu → doğrudan; porsiyon → quantity × gram_weight.
  const effectiveGrams = useMemo((): number | null => {
    if (mode === "gram") return parsePositive(grams);
    const qn = parsePositive(quantity);
    if (qn == null || !activePortion) return null;
    return qn * activePortion.gram_weight;
  }, [mode, grams, quantity, activePortion]);

  const previewTotals = useMemo(() => {
    if (effectiveGrams == null || snapshot.length === 0) return [];
    return sumNutrients([{ grams: effectiveGrams, nutrients: snapshot }]);
  }, [effectiveGrams, snapshot]);

  const previewEnergy = previewTotals.find((t) => t.nutrient_code === "energy")?.amount ?? 0;

  async function confirm() {
    setErr("");
    if (!selected) return;
    if (mode === "gram") {
      const g = parsePositive(grams);
      if (g == null) {
        setErr("Geçerli bir gram değeri girin.");
        return;
      }
      setSubmitting(true);
      await onPick({ food_id: selected.id, grams: g });
      setSubmitting(false);
    } else {
      const qn = parsePositive(quantity);
      if (qn == null || !activePortion) {
        setErr("Geçerli bir porsiyon ve miktar seçin.");
        return;
      }
      setSubmitting(true);
      await onPick({ food_id: selected.id, portion_id: activePortion.id, quantity: qn });
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={selected ? selected.name_tr : "Aramak için yazın"}
      maxWidthClass="max-w-xl"
    >
      {!selected ? (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Besin ara…"
              className="pl-9"
              autoFocus
            />
          </div>

          {listErr ? <StatusMessage type="error">{listErr}</StatusMessage> : null}

          <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-slate-100">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[13px] font-bold text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Aranıyor…
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-[13px] font-bold text-slate-400">
                {q.trim() ? "Sonuç bulunamadı." : "Besin aramaya başlayın."}
              </div>
            ) : (
              <ul className="flex flex-col">
                {results.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => void pickFood(f)}
                      className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-emerald-50/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-black text-slate-800">{f.name_tr}</span>
                        {f.name_en ? (
                          <span className="block truncate text-[11px] font-medium text-slate-400">{f.name_en}</span>
                        ) : null}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                          f.is_system
                            ? "bg-sky-50 text-sky-700 ring-1 ring-sky-100"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        }`}
                      >
                        {f.is_system ? "Sistem" : "Özel"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            ← Başka besin seç
          </button>

          {detailLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[13px] font-bold text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…
            </div>
          ) : (
            <>
              {/* Miktar modu seçimi */}
              <div className="inline-flex w-fit gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
                <ModeBtn active={mode === "gram"} onClick={() => setMode("gram")}>
                  Gram
                </ModeBtn>
                <ModeBtn
                  active={mode === "portion"}
                  disabled={portions.length === 0}
                  onClick={() => portions.length > 0 && setMode("portion")}
                >
                  Porsiyon
                </ModeBtn>
              </div>

              {mode === "gram" ? (
                <Field label="Miktar (gram)">
                  <TextInput
                    inputMode="decimal"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    placeholder="Örn: 150"
                  />
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
              ) : (
                <div className="flex flex-col gap-3">
                  <Field label="Porsiyon">
                    <div className="flex flex-col gap-1.5">
                      {portions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPortionId(p.id)}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-bold shadow-sm transition ${
                            portionId === p.id
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="truncate">{p.label_tr}</span>
                          <span className="shrink-0 text-[11px] font-bold text-slate-400">
                            {formatAmount(p.gram_weight, "g")} g
                          </span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Adet">
                    <TextInput
                      inputMode="decimal"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="Örn: 1"
                    />
                  </Field>
                </div>
              )}

              {/* Canlı önizleme */}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Önizleme</span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {effectiveGrams != null ? `${formatAmount(effectiveGrams, "g")} g` : "—"}
                  </span>
                </div>
                <div className="mt-1.5">
                  <EnergyTargetLine energyRaw={previewEnergy} target={null} className="text-lg" />
                </div>
                <div className="mt-2">
                  <MacroChips totals={previewTotals} />
                </div>
              </div>

              {err ? <StatusMessage type="error">{err}</StatusMessage> : null}

              <div className="flex items-center justify-end gap-2">
                <GhostButton onClick={onClose}>Vazgeç</GhostButton>
                <PrimaryButton icon={<Check className="h-4 w-4" />} loading={submitting} onClick={() => void confirm()}>
                  Ekle
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ModeBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-[12px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
