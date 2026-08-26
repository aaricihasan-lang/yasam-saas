"use client";

import { useState } from "react";
import { kupaInput } from "@/app/kupa/components/KupaShell";
import { BigNoteEditorDialog } from "@/app/kupa/components/BigNoteEditorDialog";

/**
 * Uzun serbest metin alanı — <1024px'te TAM EKRAN editör (BigNoteEditorDialog),
 * >=1024px'te inline textarea (aynı state). Mobil/tablet de tam düzenleme (read-only DEĞİL).
 */
export function InlineLongText({
  label,
  value,
  placeholder,
  rows = 4,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (v: string) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const preview = value.trim();

  return (
    <div>
      {/* Mobil/tablet: tıklanabilir kart → tam ekran editör */}
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 lg:hidden"
      >
        <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
        <span className={`mt-1 block text-sm ${preview ? "text-slate-700" : "text-slate-400"} line-clamp-3 whitespace-pre-wrap`}>
          {preview || (placeholder ?? "Eklemek için dokunun")}
        </span>
      </button>

      {/* Desktop: inline textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-label={label}
        className={`hidden lg:block ${kupaInput}`}
      />

      <BigNoteEditorDialog
        open={editorOpen}
        title={label}
        value={value}
        placeholder={placeholder}
        onSave={(text) => {
          onChange(text);
          setEditorOpen(false);
        }}
        onCancel={() => setEditorOpen(false)}
      />
    </div>
  );
}
