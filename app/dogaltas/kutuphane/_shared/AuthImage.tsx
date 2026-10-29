"use client";

/**
 * Oturumlu görsel: kütüphane görsel uçları kimlik başlığı ister (düz <img src> başlık gönderemez). Bayt fetch ile alınır,
 * yalnız tarayıcı belleğinde blob: adresiyle gösterilir (CSP img-src blob: izinli) ve bileşen kalkınca serbest bırakılır.
 * `lazy` iken görsel ekrana yaklaşınca yüklenir. Görsel yoksa / yüklenemezse nötr yer tutucu gösterilir.
 */

import { useEffect, useRef, useState } from "react";
import { authHeaders, type AuthKind } from "./api";

type Props = {
  src: string;
  alt: string;
  kind?: AuthKind;
  lazy?: boolean;
  className?: string;
  placeholderClassName?: string;
  placeholder?: string;
};

export function AuthImage({ src, alt, kind = "viewer", lazy = false, className, placeholderClassName, placeholder = "" }: Props) {
  const holder = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<{ src: string; url: string | null }>({ src: "", url: null });

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    let observer: IntersectionObserver | null = null;
    const load = async () => {
      try {
        const res = await fetch(src, { headers: authHeaders(kind), credentials: "same-origin", cache: "no-store", signal: ctrl.signal });
        if (!res.ok) return;
        const type = res.headers.get("content-type") ?? "";
        if (!type.startsWith("image/")) return;
        const blob = await res.blob();
        if (ctrl.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src, url: objectUrl });
      } catch {
        /* yer tutucu kalır */
      }
    };
    const el = holder.current;
    if (lazy && el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            void load();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(el);
    } else {
      void load();
    }
    return () => {
      ctrl.abort();
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, kind, lazy]);

  const url = state.src === src ? state.url : null;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- blob: adresi (oturumlu bayt); next/image kullanılamaz
    return <img src={url} alt={alt} className={className} />;
  }
  return (
    <span ref={holder} className={placeholderClassName} aria-hidden={placeholder ? undefined : true}>
      {placeholder}
    </span>
  );
}
