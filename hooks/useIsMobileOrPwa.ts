"use client";
import { useEffect, useState } from "react";

/**
 * Mobil görünüm veya PWA standalone modunu tespit eder.
 * Sunucu tarafında her zaman false döner; client hydration sonrası güncellenir.
 */
export function useIsMobileOrPwa(): boolean {
  const [is, setIs] = useState(false);

  useEffect(() => {
    function check() {
      const pwa =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      setIs(pwa || window.innerWidth < 768);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return is;
}
