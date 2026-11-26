"use client";

/**
 * ÜYE PASİFLEŞTİRME F7 — kişiye özel üyelik uyarısı editörü (Pasif Yap penceresi + sonradan düzenleme ortak).
 * Hazır mesaj seç → metin alanına gelir (düzenlenebilir) · "Tamamen özel mesaj" → boş alan · karakter sayacı (≤500) ·
 * canlı önizleme uzmanın ana sayfa kırmızı bandıyla AYNI görünümde. Metin DÜZ METİN olarak gösterilir (HTML işlenmez).
 */
import { Lock } from "lucide-react";
import { ACCESS_MESSAGE_MAX, ACCESS_MESSAGE_PRESETS, accessMessageLength, normalizeAccessMessage } from "@/lib/auth/accessRestrictionMessage";

export type AccessMessageDraft = { choice: string; text: string };
export const CUSTOM_CHOICE = "custom" as const;

export function draftFromMessage(message: string | null): AccessMessageDraft {
  if (!message) return { choice: ACCESS_MESSAGE_PRESETS[0].id, text: ACCESS_MESSAGE_PRESETS[0].text };
  const preset = ACCESS_MESSAGE_PRESETS.find((p) => p.text === message);
  return preset ? { choice: preset.id, text: preset.text } : { choice: CUSTOM_CHOICE, text: message };
}

/** Gönderilecek normalleştirilmiş metin; geçersizse hata. */
export function draftResult(draft: AccessMessageDraft) {
  return normalizeAccessMessage(draft.text);
}

export default function AccessMessageEditor({
  draft,
  onChange,
  disabled,
  idPrefix,
}: {
  draft: AccessMessageDraft;
  onChange: (d: AccessMessageDraft) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const len = accessMessageLength(draft.text);
  const over = len > ACCESS_MESSAGE_MAX;
  const result = normalizeAccessMessage(draft.text);
  const preview = result.ok ? result.value : null;
  return (
    <div className="mt-3 space-y-3" data-access-message-editor>
      <fieldset className="space-y-1.5" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wide text-slate-500">Mesaj</legend>
        {ACCESS_MESSAGE_PRESETS.map((p, i) => (
          <label key={p.id} className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-800">
            <input
              type="radio"
              name={`${idPrefix}-choice`}
              value={p.id}
              checked={draft.choice === p.id}
              onChange={() => onChange({ choice: p.id, text: p.text })}
              className="mt-1"
              data-msg-preset={i + 1}
            />
            <span>
              <span className="font-black">Hazır mesaj {i + 1}:</span> {p.label}
            </span>
          </label>
        ))}
        <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-800">
          <input
            type="radio"
            name={`${idPrefix}-choice`}
            value={CUSTOM_CHOICE}
            checked={draft.choice === CUSTOM_CHOICE}
            onChange={() => onChange({ choice: CUSTOM_CHOICE, text: draft.choice === CUSTOM_CHOICE ? draft.text : "" })}
            className="mt-1"
            data-msg-custom
          />
          <span className="font-black">Tamamen özel mesaj</span>
        </label>
      </fieldset>
      <div>
        <label htmlFor={`${idPrefix}-text`} className="text-xs font-black uppercase tracking-wide text-slate-500">
          Mesaj metni (düzenlenebilir)
        </label>
        <textarea
          id={`${idPrefix}-text`}
          value={draft.text}
          onChange={(e) => onChange({ choice: ACCESS_MESSAGE_PRESETS.some((p) => p.text === e.target.value) ? draft.choice : CUSTOM_CHOICE, text: e.target.value })}
          disabled={disabled}
          rows={4}
          maxLength={ACCESS_MESSAGE_MAX * 2}
          className="mt-1 w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-rose-300 focus:outline-none"
          data-msg-text
        />
        <p className={`mt-1 text-right text-xs font-bold ${over ? "text-rose-700" : "text-slate-500"}`} data-msg-counter aria-live="polite">
          {len} / {ACCESS_MESSAGE_MAX}
          {over ? " — en fazla 500 karakter" : ""}
        </p>
        {!result.ok && !over ? <p className="text-xs font-bold text-rose-700">{result.error}</p> : null}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Uzmanın ana sayfasında görünecek</p>
        <div
          className="mt-1 flex items-start gap-3 rounded-[18px] border-2 border-rose-300 bg-rose-50 px-4 py-3 text-rose-900"
          data-msg-preview
        >
          <Lock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="whitespace-pre-line break-words text-[15px] font-bold leading-relaxed">
            {preview ?? <span className="font-semibold italic text-rose-700/70">Mesaj boş — standart uyarı gösterilir.</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
