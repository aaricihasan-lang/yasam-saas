"use client";

import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Parola alanı + göster/gizle ("göz") kontrolü — TÜM kullanıcıya açık parola alanlarında ortak.
 *
 * Davranış (owner kararı, 2026-10):
 *   - Varsayılan GİZLİ (type="password"); göz → type="text"; tekrar → type="password".
 *   - Yalnız yerel görünürlük durumu: değer loglanmaz, analitiğe/isteğe/DB'ye/panoya GİTMEZ.
 *     Aynı <input> elemanı korunur (yalnız `type` değişir) → değer ve imleç kaybolmaz,
 *     form state'i değişmez.
 *   - Buton type="button" (submit tetiklemez), klavyeyle erişilebilir, aria-label
 *     "Parolayı göster"/"Parolayı gizle" + aria-pressed; mobilde ≥40px dokunma alanı.
 *   - Input sağ iç boşluğu butona yer açar (metin butonun altına girmez).
 *   - Tarayıcı parola yöneticisi: `autoComplete` çağıran tarafından verilir
 *     ("current-password" / "new-password"); bileşen değiştirmez.
 *   - Edge'in yerleşik göz düğmesi (::-ms-reveal) çift ikon olmasın diye gizlenir (globals.css).
 */
type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  /** Dış sarmalayıcı sınıfları (yerleşim; ör. "mt-1.5"). */
  wrapperClassName?: string;
};

export default function PasswordInput({ wrapperClassName, className, id, disabled, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? `pw-${autoId}`;
  const label = visible ? "Parolayı gizle" : "Parolayı göster";

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <input
        {...rest}
        id={inputId}
        disabled={disabled}
        type={visible ? "text" : "password"}
        // Görünür modda otomatik büyük harf / düzeltme parolayı değiştirmesin (mobil klavye).
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`yasam-password-input ${className ?? ""} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Fare tıklamasında odak input'ta kalsın (imleç kaybolmaz); klavye odağı yine butona gelebilir.
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-pressed={visible}
        aria-controls={inputId}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
      </button>
    </div>
  );
}
