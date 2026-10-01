"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { isGaAllowedPath } from "@/lib/legal/analyticsPolicy";
import { CONSENT_CHANGE_EVENT, CONSENT_OPEN_EVENT } from "@/lib/legal/analyticsConsent";
import { hasAnalyticsDecision, setAnalyticsConsent } from "@/components/analytics/analyticsConsentClient";

/**
 * Çerez tercihi alt çubuğu — Google Analytics onayı (P1-6 §3.4).
 *
 * Görünürlük: YALNIZ GA'ya izinli herkese açık yollarda, oturum açılmamış ziyaretçide ve
 * henüz karar verilmemişken (ya da "Çerez tercihleri" ile yeniden açıldığında).
 * "Kabul et" ve "Reddet" aynı görünüm ve ağırlıktadır. Çubuk sayfa içeriğini kapatmaz:
 * görünürken gövdeye çubuğun yüksekliği kadar alt boşluk eklenir.
 * Kişisel veri saklanmaz; karar lib/legal/analyticsConsent.ts üzerinden kaydedilir.
 */

function hasBrowserSession(): boolean {
  try {
    return Boolean(readSessionToken()) || readYasamUser() !== null;
  } catch {
    return false;
  }
}

/** Karar/oturum değişimlerine abonelik (aynı sekme: CONSENT_CHANGE_EVENT; diğer sekmeler: storage). */
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/** Oturumsuz ve henüz karar vermemiş ziyaretçi mi? (sunucuda false → hidrasyon uyumlu) */
function readUndecidedVisitor(): boolean {
  return !hasBrowserSession() && !hasAnalyticsDecision();
}

export default function AnalyticsConsentBanner() {
  const pathname = usePathname() ?? "/";
  const undecided = useSyncExternalStore(subscribe, readUndecidedVisitor, () => false);
  // "Çerez tercihleri" ile yeniden açıldı (karar sıfırlandı) → oturum durumundan bağımsız göster.
  const [forced, setForced] = useState(false);
  const barRef = useRef<HTMLElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  const open = isGaAllowedPath(pathname) && (forced || undecided);

  // "Çerez tercihleri" bağlantısı → çubuğu yeniden aç; karar verilince zorlamayı bırak.
  useEffect(() => {
    const onOpen = () => {
      if (!isGaAllowedPath(window.location.pathname)) return;
      setForced(true);
      window.setTimeout(() => firstButtonRef.current?.focus(), 0);
    };
    const onChange = () => {
      if (hasAnalyticsDecision()) setForced(false);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    };
  }, []);

  // Çubuk görünürken içeriğin altı kapanmasın: gövdeye çubuk yüksekliği kadar alt boşluk.
  useEffect(() => {
    if (!open) return;
    const el = barRef.current;
    const body = document.body;
    const previous = body.style.paddingBottom;
    const apply = () => {
      if (el) body.style.paddingBottom = `${Math.ceil(el.getBoundingClientRect().height)}px`;
    };
    apply();
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      body.style.paddingBottom = previous;
    };
  }, [open]);

  if (!open) return null;

  const decide = (decision: "granted" | "denied") => {
    setAnalyticsConsent(decision);
    setForced(false);
  };

  return (
    <section
      ref={barRef}
      role="region"
      aria-labelledby="yasam-consent-title"
      aria-describedby="yasam-consent-desc"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id="yasam-consent-title" className="text-sm font-black text-slate-900">
            Çerez tercihleri
          </h2>
          <p id="yasam-consent-desc" className="mt-0.5 text-xs leading-5 text-slate-600">
            Ziyaret istatistikleri için Google Analytics çerezlerini yalnızca onayınızla kullanırız.
            Oturum ve dil tercihi gibi zorunlu kayıtlar bu seçimden etkilenmez. Ayrıntılar:{" "}
            <Link href="/gizlilik-politikasi#cerezler" className="font-semibold text-violet-700 underline">
              Gizlilik Politikası
            </Link>
            .
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <button
            ref={firstButtonRef}
            type="button"
            onClick={() => decide("denied")}
            className="btn-outline min-h-[44px] border-[1.5px] border-slate-400 bg-white px-5 !text-slate-900 hover:bg-slate-50"
          >
            Reddet
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="btn-outline min-h-[44px] border-[1.5px] border-slate-400 bg-white px-5 !text-slate-900 hover:bg-slate-50"
          >
            Kabul et
          </button>
        </div>
      </div>
    </section>
  );
}
