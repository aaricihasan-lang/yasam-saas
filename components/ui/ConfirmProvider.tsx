"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Onay penceresi KATMANI. Uygulama modalları/lightbox'ları `z-[9999]`–`z-[10000]`
 * katmanında ve çoğu `document.body`'ye portal ile eklenir. Onay, bir modalın İÇİNDEN
 * açılabildiğinden (ör. Kayıtlı Atlas → Düzenle → Bölge Sil) daima onların ÜSTÜNDE
 * olmalıdır: (1) body'ye portal → hiçbir ata stacking context'ine hapsolmaz,
 * (2) modal katmanının bir üstündeki sabit katman.
 */
const CONFIRM_LAYER_CLASS = "z-[10050]";

/**
 * Onaydan sonra kısa süre tıklama kalkanı: çift tıklamanın İKİNCİ tıklaması (a) çok aşamalı
 * silmede aynı konumdaki bir sonraki aşamanın onay butonuna (ör. "Devam Et" → "Kalıcı Olarak
 * Sil") ya da (b) pencere kapanınca alttaki sayfaya (silinmekte olan satıra) düşmesin.
 */
const CLICK_SHIELD_MS = 450;

type ConfirmTone = "danger" | "info" | "success" | "warning";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  /**
   * Kritik işlemler için yazarak onay: kullanıcı bu metni (büyük/küçük harf ve
   * Türkçe İ/ı farkı gözetmeksizin, baş/son boşluk yok sayılarak) yazmadan onay
   * butonu açılmaz.
   */
  requireText?: string;
  /** requireText alanının üstünde gösterilen yönerge. */
  requireTextLabel?: string;
  /**
   * Özel karşılaştırma (ör. toplu silme ifadesi — lib/ui/bulkDeleteGuard). Verilirse
   * varsayılan normalizeConfirmText eşleşmesinin YERİNE kullanılır.
   */
  requireTextMatcher?: (typed: string) => boolean;
};

/** Yazarak onay karşılaştırması — tr-TR harf katlama + boşluk normalizasyonu. */
export function normalizeConfirmText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [shield, setShield] = useState(false);
  const shieldTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (shieldTimerRef.current !== null) window.clearTimeout(shieldTimerRef.current);
  }, []);

  const modalRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  // SSR güvenli portal hedefi (yalnız istemcide, mount sonrası).
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortalTarget(document.body);
  }, []);

  const confirm = (opts: ConfirmOptions) => {
    setBusy(false);
    setTyped("");
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  };

  const close = (result: boolean) => {
    if (busy && result) return; // silme devam ederken tekrar tetikleme
    if (result) {
      setShield(true);
      if (shieldTimerRef.current !== null) window.clearTimeout(shieldTimerRef.current);
      shieldTimerRef.current = window.setTimeout(() => setShield(false), CLICK_SHIELD_MS);
    }
    resolver?.(result);
    setOptions(null);
    setResolver(null);
    setBusy(false);
    setTyped("");
  };

  const typedOk =
    !options?.requireText ||
    (options.requireTextMatcher
      ? options.requireTextMatcher(typed)
      : normalizeConfirmText(typed) === normalizeConfirmText(options.requireText));

  // Focus yönetimi ve klavye trap
  useEffect(() => {
    if (!options) return;

    // Kapanınca odak, onayı açan elemana (ör. alttaki modaldaki "Bölge Sil") geri döner.
    const previousFocus = document.activeElement as HTMLElement | null;

    // Modal açılınca cancel butonuna odaklan
    const timer = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 30);

    function handleKeyDown(e: KeyboardEvent) {
      if (!modalRef.current) return;

      // Onay EN ÜST katmandır: Escape/Tab alttaki modalın (ör. Atlas Düzenle) klavye
      // işleyicisine ULAŞMAZ — aksi halde Escape iki pencereyi birden kapatır ve alttaki
      // modalın Tab tuzağı odağı onaydan geri çeker. (window capture → ilk çalışan.)
      if (e.key === "Escape" || e.key === "Tab") e.stopPropagation();

      // Escape → iptal et (hiçbir şey silme)
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }

      // Tab tuşunu modal içinde kapat
      if (e.key === "Tab") {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const inside = modalRef.current.contains(document.activeElement);

        if (e.shiftKey) {
          if (!inside || document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!inside || document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearTimeout(timer);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Onay açıkken arka sayfa kaymaz (mobilde dokunmatik kaydırma modalın arkasına geçmesin).
  const dialogOpen = options !== null;
  useEffect(() => {
    if (!dialogOpen || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [dialogOpen]);

  const tone = options?.tone || "info";

  const toneClasses: Record<ConfirmTone, string> = {
    danger: "from-rose-600 to-red-700",
    info: "from-sky-600 to-indigo-700",
    success: "from-emerald-600 to-teal-700",
    warning: "from-amber-500 to-orange-600",
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {shield && portalTarget
        ? createPortal(
            <div className="fixed inset-0 z-[10060]" aria-hidden data-testid="confirm-click-shield" />,
            portalTarget,
          )
        : null}

      {options && portalTarget && createPortal(
        <div
          className={`fixed inset-0 ${CONFIRM_LAYER_CLASS} flex items-center justify-center overscroll-contain bg-black/45 p-3 backdrop-blur-sm sm:p-4`}
          aria-hidden={false}
          onClick={(e) => {
            // Dışarı tıklama → iptal et (silmeyi tetikleme)
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div
            ref={modalRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            // Mobil: kart viewport'a sığar (dvh), başlık + aksiyon çubuğu sabit, yalnız gövde kayar
            // → uzun silme önizlemesinde de "Vazgeç" / onay butonu her zaman erişilebilir.
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`shrink-0 bg-gradient-to-r ${toneClasses[tone]} px-6 py-5 text-white`}
            >
              <div id="confirm-title" className="text-lg font-black">
                {options.title || "Onay gerekiyor"}
              </div>
              <div className="mt-1 text-sm text-white/85">
                Lütfen işlemi onayla
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2 pt-6">
              <p id="confirm-message" className="whitespace-pre-line text-[15px] font-semibold leading-relaxed text-slate-700">
                {options.message}
              </p>

              {options.requireText ? (
                <label className="mt-5 block">
                  <span className="block text-[13px] font-bold text-slate-600">
                    {options.requireTextLabel ??
                      `Onaylamak için “${options.requireText}” yazın:`}
                  </span>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="confirm-require-text"
                    aria-label={options.requireTextLabel ?? "Onay metni"}
                    className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-[16px] font-semibold text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 sm:text-[15px]"
                  />
                </label>
              ) : null}
            </div>

            <div className="shrink-0 px-6 pb-6 pt-5">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  data-testid="confirm-cancel"
                  onClick={() => close(false)}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  {options.cancelText || "Vazgeç"}
                </button>

                <button
                  ref={confirmBtnRef}
                  type="button"
                  data-testid="confirm-ok"
                  disabled={busy || !typedOk}
                  onClick={() => {
                    if (!typedOk) return;
                    setBusy(true);
                    close(true);
                  }}
                  className={`rounded-2xl bg-gradient-to-r ${toneClasses[tone]} px-5 py-2.5 text-sm font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
                >
                  {options.confirmText || "Tamam"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        portalTarget,
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı.");
  }
  return context;
}
