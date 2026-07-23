"use client";

/**
 * NKB-V2-D1 — Ana Kulvar + Yan Kulvar ortak dört bölüm editörü.
 * Yalnız body metinleri düzenlenir; key/label/order sabittir (KULVAR_SECTION_TEMPLATE).
 * Ana Kulvar ve Yan Kulvar AYNI bileşeni, aynı sırayı ve aynı etiketleri kullanır.
 */
import { KULVAR_SECTION_TEMPLATE, type KulvarSectionKey } from "../helpers/knowledgeSections";
import type { KulvarBodies } from "../helpers/kulvarFormLogic";

const fieldBase =
  "w-full rounded-xl border border-violet-200/90 bg-white px-3 font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200/60 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40";
const sectionTextareaClass = `${fieldBase} min-h-[110px] resize-y py-2 text-sm leading-relaxed placeholder:text-slate-400`;
const sectionLabelClass = "mb-1 block text-xs font-bold text-violet-800";

export function KulvarSectionEditor({
  bodies,
  onChange,
  disabled = false,
  errors,
  idPrefix = "kulvar",
}: {
  bodies: KulvarBodies;
  onChange: (key: KulvarSectionKey, value: string) => void;
  disabled?: boolean;
  errors?: Partial<Record<KulvarSectionKey, string>>;
  idPrefix?: string;
}) {
  return (
    <div className="grid gap-3">
      {KULVAR_SECTION_TEMPLATE.map((t) => {
        const fieldId = `${idPrefix}-${t.key}`;
        const err = errors?.[t.key];
        return (
          <div key={t.key} className="min-w-0">
            <label htmlFor={fieldId} className={sectionLabelClass}>
              {t.label}
            </label>
            <textarea
              id={fieldId}
              value={bodies[t.key] ?? ""}
              onChange={(e) => onChange(t.key, e.target.value)}
              disabled={disabled}
              rows={4}
              placeholder={`${t.label} metnini buraya yazın…`}
              className={sectionTextareaClass}
            />
            {err ? <p className="mt-1 text-xs font-semibold text-rose-600">{err}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
