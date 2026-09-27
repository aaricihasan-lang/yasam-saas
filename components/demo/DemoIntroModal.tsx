"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { readSessionToken } from "@/lib/auth/yasamUser";

/**
 * Demo / test hesabı açılış bilgilendirmesi (yalnız ana sayfa).
 *
 * Görünürlük kararı ÇAĞIRANDA verilir (`enabled`): canonical `is_demo_account`
 * bayrağı + profil sync'i tamamlanmış + admin değil. Bu bileşen yetki kararı
 * VERMEZ; tuttuğu tek durum "bu oturumda bilgilendirme kapatıldı mı?" görsel
 * bilgisidir.
 *
 * Oturum bağı: kapatma kaydı, aktif oturum token'ının parmak izine (FNV-1a,
 * token'ın kendisi SAKLANMAZ) bağlanır. Aynı oturumda modüller arası gezinip
 * ana sayfaya dönünce tekrar açılmaz; yeni girişte token değiştiği için
 * yeniden gösterilir.
 *
 * Kapanış yalnız "Kapat" butonuyla: X yok, dış tıklama ve Esc kapatmaz.
 */

const ACK_STORAGE_KEY = "yasam_demo_intro_ack";

/** Storage erişilemezse (private mod vb.) aynı sekmedeki SPA gezinmesi için yedek. */
let memoryAck: string | null = null;
const listeners = new Set<() => void>();

function sessionFingerprint(): string {
  const token = readSessionToken() ?? "no-session";
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function isAcknowledged(): boolean {
  const fingerprint = sessionFingerprint();
  if (memoryAck === fingerprint) return true;
  try {
    return localStorage.getItem(ACK_STORAGE_KEY) === fingerprint;
  } catch {
    return false;
  }
}

function acknowledge(): void {
  const fingerprint = sessionFingerprint();
  memoryAck = fingerprint;
  try {
    localStorage.setItem(ACK_STORAGE_KEY, fingerprint);
  } catch {
    // Görsel durum; yazılamazsa bellek yedeği yeterli.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export default function DemoIntroModal({ enabled }: { enabled: boolean }) {
  const t = useTranslations("home.demo.introModal");
  // Server snapshot = "kapatılmış" → SSR/hydration sırasında modal basılmaz.
  const acknowledged = useSyncExternalStore(subscribe, isAcknowledged, () => true);
  const open = enabled && !acknowledged;

  const titleId = useId();
  const descId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Arka planı erişilebilirlik ağacından ve etkileşimden çıkar.
    const inerted: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === container || !(el instanceof HTMLElement) || el.inert) continue;
      el.inert = true;
      inerted.push(el);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Bilinçli: Esc modalı kapatmaz.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === "Tab") {
        // Tek odaklanabilir öğe: odak Kapat butonunda kalır.
        e.preventDefault();
        closeBtnRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      inerted.forEach((el) => {
        el.inert = false;
      });
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="demo-intro-modal"
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[0_24px_70px_rgba(76,29,149,0.22)]"
      >
        <div className="flex items-center gap-3 border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-sky-50 px-6 py-5 sm:px-7">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-sm"
            aria-hidden
          >
            <Info className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <h2
            id={titleId}
            className="text-lg font-black leading-snug text-slate-900 sm:text-xl"
          >
            {t("title")}
          </h2>
        </div>

        <div
          id={descId}
          className="min-h-0 space-y-4 overflow-y-auto px-6 py-6 text-[15px] leading-relaxed text-slate-700 sm:px-7 sm:text-base"
        >
          <p>{t("p1")}</p>
          <p>{t("p2")}</p>
          <p>{t("p3")}</p>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:px-7">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={acknowledge}
            className="btn-secondary w-full min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:w-auto sm:min-w-[140px]"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
