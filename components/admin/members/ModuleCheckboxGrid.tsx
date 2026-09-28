"use client";

/**
 * Modül seçim ızgarası — Onay modalı ve "Yeni Uzman" formu AYNI kanonik listeyi kullanır
 * (ADMIN_MODULE_UI_KEYS = API whitelist). Teknik anahtar UI'da gösterilmez.
 */
import {
  ADMIN_MODULE_KIND,
  ADMIN_MODULE_UI_DESCRIPTIONS,
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  type AdminModuleUiKey,
} from "@/lib/admin/userManagement";

export function ModuleCheckboxGrid({
  selected,
  onToggle,
  disabled = false,
  idPrefix = "module",
}: {
  selected: ReadonlySet<AdminModuleUiKey>;
  onToggle: (key: AdminModuleUiKey) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ADMIN_MODULE_UI_KEYS.map((key) => {
        const checked = selected.has(key);
        const kind = ADMIN_MODULE_KIND[key];
        const inputId = `${idPrefix}-${key}`;
        const descId = ADMIN_MODULE_UI_DESCRIPTIONS[key] ? `${inputId}-desc` : undefined;
        return (
          <label
            key={key}
            htmlFor={inputId}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 transition ${
              checked ? "border-emerald-300 bg-emerald-50/80" : "border-slate-200 bg-white"
            } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-200"}`}
          >
            <input
              id={inputId}
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              checked={checked}
              disabled={disabled}
              aria-describedby={descId}
              onChange={() => onToggle(key)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">
                {ADMIN_MODULE_UI_LABELS[key]}
                {kind !== "module" ? (
                  <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600">
                    {kind === "hub" ? "kart" : "ek yetenek"}
                  </span>
                ) : null}
              </span>
              {descId ? (
                <span id={descId} className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500">
                  {ADMIN_MODULE_UI_DESCRIPTIONS[key]}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
