"use client";

import type { ReactNode } from "react";

type DemoBlurProps = {
  /** true olduğunda içerik blur uygulanır (kilit kartı yok) */
  isProtected: boolean;
  children: ReactNode;
  /** Blur yoğunluğu px cinsinden. Varsayılan: 5 */
  intensity?: number;
  /** Wrapper için ek className */
  className?: string;
};

/**
 * Kilit kartı gerektirmeyen küçük alanlar için sadece blur wrapper.
 * isProtected=false → children doğrudan render edilir.
 * isProtected=true  → children blur edilir, pointer-events ve select kapatılır.
 */
export function DemoBlur({ isProtected, children, intensity = 5, className = "" }: DemoBlurProps) {
  if (!isProtected) return <>{children}</>;

  return (
    <div
      className={`pointer-events-none select-none overflow-hidden rounded-xl ${className}`}
      style={{ filter: `blur(${intensity}px)`, userSelect: "none" }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
