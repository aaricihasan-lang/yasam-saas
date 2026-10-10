"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Compass, FolderOpen, ShieldCheck, Sparkles } from "lucide-react";
import { readStoredSessionToken } from "@/lib/auth/yasamUser";

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

/** Paragraf başına renk teması — metinler i18n'den birebir gelir, yalnız görsel ayrıştırma. */
const INFO_ROWS = [
  {
    key: "p1",
    Icon: Compass,
    row: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-indigo-100/60",
    chip: "from-sky-500 to-indigo-500 shadow-[0_6px_16px_rgba(59,130,246,0.30)]",
  },
  {
    key: "p2",
    Icon: FolderOpen,
    row: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-100/60",
    chip: "from-emerald-500 to-teal-500 shadow-[0_6px_16px_rgba(16,185,129,0.30)]",
  },
  {
    key: "p3",
    Icon: ShieldCheck,
    row: "border-violet-200/80 bg-gradient-to-br from-violet-50 to-fuchsia-100/60",
    chip: "from-violet-500 to-fuchsia-500 shadow-[0_6px_16px_rgba(139,92,246,0.32)]",
  },
] as const;

/** Storage erişilemezse (private mod vb.) aynı sekmedeki SPA gezinmesi için yedek. */
let memoryAck: string | null = null;
const listeners = new Set<() => void>();

function sessionFingerprint(): string {
  const token = readStoredSessionToken() ?? "no-session"; // H6a: yerel parmak izi (başlık değil)
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
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-md"
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
        className="flex max-h-full w-full max-w-xl flex-col rounded-[30px] bg-gradient-to-br from-indigo-400 via-fuchsia-400 to-amber-300 p-[1.5px] shadow-[0_30px_90px_rgba(91,33,182,0.38),0_10px_30px_rgba(236,72,153,0.18)]"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28.5px] bg-white">
          {/* Başlık bandı — marka gradyanı + yumuşak ışık küreleri */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-6 sm:px-8 sm:py-7">
            <span
              className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-pink-300/45 blur-3xl"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-sky-300/40 blur-3xl"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
              aria-hidden
            />
            <div className="relative flex items-center gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-white/35 backdrop-blur"
                aria-hidden
              >
                <Sparkles className="h-6 w-6" strokeWidth={2.1} />
              </span>
              <h2
                id={titleId}
                className="text-xl font-black leading-snug tracking-tight text-white drop-shadow-sm sm:text-2xl"
              >
                {t("title")}
              </h2>
            </div>
          </div>

          <div
            id={descId}
            data-intro-body
            className="min-h-0 space-y-3 overflow-y-auto bg-gradient-to-b from-white via-white to-violet-50/50 px-5 py-5 sm:space-y-3.5 sm:px-7 sm:py-6"
          >
            {INFO_ROWS.map(({ key, Icon, row, chip }) => (
              <div
                key={key}
                className={`flex items-start gap-3.5 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${row}`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${chip}`}
                  aria-hidden
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </span>
                <p className="min-w-0 text-[15px] leading-relaxed text-slate-700 sm:text-base">
                  {t(key)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 justify-end border-t border-violet-100 bg-gradient-to-r from-indigo-50/60 via-white to-fuchsia-50/60 px-5 py-4 sm:px-7">
            <button
              ref={closeBtnRef}
              type="button"
              onClick={acknowledge}
              className="btn-secondary w-full min-h-[46px] !rounded-2xl text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:w-auto sm:min-w-[160px]"
            >
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
