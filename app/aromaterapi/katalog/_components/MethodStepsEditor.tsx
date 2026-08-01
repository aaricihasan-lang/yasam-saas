"use client";

/**
 * C3D-B2B — Sıralı üretim adımları editörü (controlled).
 *
 * Adım ekle/sil/yukarı/aşağı; sıra numarası otomatik ve deterministik (görsel sıra =
 * gönderim sırası; order gönderimde 1..N olarak yeniden atanır — bkz. toStepsBody).
 * Erişilebilir (44px hedefler, aria-label). DnD bağımlılığı yok. Boş adımlar gönderimde
 * elenir. Klavye ile tam kullanılabilir.
 */

export type StepDraft = { key: number; text: string };

export const MAX_STEPS = 60;
export const STEP_TEXT_MAX = 4000;

export function MethodStepsEditor({
  steps,
  onChange,
  disabled = false,
}: {
  steps: StepDraft[];
  onChange: (next: StepDraft[]) => void;
  disabled?: boolean;
}) {
  const nextKey = () => (steps.length ? Math.max(...steps.map((s) => s.key)) + 1 : 1);

  const add = () => {
    if (disabled || steps.length >= MAX_STEPS) return;
    onChange([...steps, { key: nextKey(), text: "" }]);
  };
  const remove = (key: number) => onChange(steps.filter((s) => s.key !== key));
  const setText = (key: number, text: string) =>
    onChange(steps.map((s) => (s.key === key ? { ...s, text } : s)));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-black text-slate-800">
            Sıralı Adımlar {steps.length > 0 ? <span className="text-slate-400">({steps.length})</span> : null}
          </h4>
          <p className="text-[11.5px] font-medium text-slate-400">
            İşlem sırası önemliyse her adımı ayrı yazın; sıra otomatik numaralanır.
          </p>
        </div>
        {!disabled ? (
          <button
            type="button"
            onClick={add}
            disabled={steps.length >= MAX_STEPS}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 text-[12.5px] font-black text-emerald-800 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Adım ekle
          </button>
        ) : null}
      </div>

      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-center text-[12px] font-medium italic text-slate-400">
          Adım eklenmedi (opsiyonel).
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.key} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-black text-emerald-800"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`step-${s.key}`}>
                    Adım {i + 1}
                  </label>
                  <textarea
                    id={`step-${s.key}`}
                    value={s.text}
                    rows={2}
                    disabled={disabled}
                    maxLength={STEP_TEXT_MAX}
                    onChange={(e) => setText(s.key, e.target.value)}
                    placeholder={`Adım ${i + 1}…`}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:bg-slate-50"
                  />
                </div>
                {!disabled ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Adım ${i + 1} yukarı`} className="inline-flex h-[38px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-40">
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Adım ${i + 1} aşağı`} className="inline-flex h-[38px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-40">
                      ↓
                    </button>
                    <button type="button" onClick={() => remove(s.key)} aria-label={`Adım ${i + 1} kaldır`} className="inline-flex h-[38px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:border-rose-200 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60">
                      ✕
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---- İçerik state + gövde dönüşümü (series create + append revision ortak) ----

export type MethodContentState = {
  plant_part_used: string;
  material_state: string;
  method_text: string;
  equipment: string;
  amount_ratio: string;
  solvent_carrier: string;
  duration_text: string;
  temperature_text: string;
  filtration: string;
  resting: string;
  storage: string;
  quality_notes: string;
  safety_notes: string;
};

export function emptyMethodContent(): MethodContentState {
  return {
    plant_part_used: "",
    material_state: "",
    method_text: "",
    equipment: "",
    amount_ratio: "",
    solvent_carrier: "",
    duration_text: "",
    temperature_text: "",
    filtration: "",
    resting: "",
    storage: "",
    quality_notes: "",
    safety_notes: "",
  };
}

/** Görsel sıraya göre boş-olmayan adımları 1..N order ile döndürür. */
export function toStepsBody(steps: StepDraft[]): { order: number; text: string }[] | null {
  const clean = steps
    .map((s) => s.text)
    .filter((t) => t.trim() !== "")
    .map((text, i) => ({ order: i + 1, text }));
  return clean.length ? clean : null;
}
