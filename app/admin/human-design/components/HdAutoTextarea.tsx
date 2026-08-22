"use client";

import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * Otomatik büyüyen textarea — edit mode'da iç içe scrollbar cehennemi olmasın diye
 * içeriğe göre yükseklik ayarlar; sayfa kendi scroll'unu kullanır. Bağımlılıksız.
 * overflow-hidden + scrollHeight ile yükseklik senkronu. `value` kontrollüdür.
 */
type HdAutoTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  value: string;
  minRows?: number;
};

// SSR'da useLayoutEffect uyarısını önle (ilk ölçüm client'ta yapılır).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function HdAutoTextarea({ value, minRows = 3, className = "", ...rest }: HdAutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const min = minRows * 24; // ~satır yüksekliği
    el.style.height = `${Math.max(min, el.scrollHeight)}px`;
  };

  useIsoLayoutEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={resize}
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}
