"use client";

import type { ReactNode } from "react";

type DemoGateProps = {
  /** true olduğunda içerik blur/overlay ile korunur */
  isProtected: boolean;
  children: ReactNode;
  /** Kilit kartındaki alt mesaj. Varsayılan standart demo metni */
  message?: string;
  /** Wrapper için ek className */
  className?: string;
};

/**
 * Demo hesapta içerik koruması.
 * isProtected=false → children doğrudan render edilir (normal kullanıcı etkilenmez).
 * isProtected=true  → children blur edilir, üstüne amber kilit kartı gösterilir.
 */
export function DemoGate({ isProtected, children, message, className = "" }: DemoGateProps) {
  if (!isProtected) return <>{children}</>;

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      {/* Blurlu arka plan — pointer-events ve select kapalı */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: "blur(5px)", userSelect: "none" }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/20 via-white/55 to-white/88" />

      {/* Kilit kartı */}
      <div className="absolute inset-0 flex items-center justify-center px-3">
        <div className="w-full max-w-[340px] rounded-2xl border border-amber-300/80 bg-amber-50/97 px-4 py-3 text-center shadow-md backdrop-blur-sm">
          <span className="text-lg leading-none">🔒</span>
          <p className="mt-1 text-[13px] font-black text-amber-900">Demo Ön İzleme</p>
          <p className="mt-1 text-[11px] leading-[1.55] text-amber-800">
            {message ?? (
              <>
                Bu içerik demo hesabında sınırlı gösterilir.
                <br />
                Tam sürümde tüm detaylar açık olarak kullanılabilir.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
