"use client";
/**
 * Beslenme modülü — ortak sayfa kabuğu + modül erişim koruma kancası.
 *
 * `useBeslenmeModuleGuard()`: her beslenme sayfasında mount'ta checkBeslenmeAccess()
 * (server-authoritative modül probe) çağırır; "loading" | "ok" | "denied" döner. denied ise
 * "/"'a yönlendirir. İçerik erişim doğrulanmadan ASLA render edilmez (defense-in-depth; API
 * zaten server-side module-gated — admin + module_permissions.beslenme uzman).
 *
 * `BeslenmeGate`: guard durumuna göre yükleniyor/erişim-yok ekranını çizer.
 * `BeslenmeShell`: emerald pastel zemin + cam hero + container (alt sayfalarda ortak).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Loader2, Lock, RefreshCw } from "lucide-react";
import { probeBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";

/**
 * "unavailable" (Final-A3): erişim probe'u geçici hata verdi (ağ / 5xx / bozuk yanıt). İçerik
 * AÇILMAZ (fail-closed) ama kullanıcı yetkisizmiş gibi "/"'a da yönlendirilmez → tekrar dene.
 */
export type GuardState = "loading" | "ok" | "denied" | "unavailable";

export function useBeslenmeModuleGuard(): GuardState {
  const router = useRouter();
  const [state, setState] = useState<GuardState>("loading");

  useEffect(() => {
    let alive = true;
    void (async () => {
      let result: "ok" | "denied" | "unavailable" = "unavailable";
      try {
        result = await probeBeslenmeAccess();
      } catch {
        result = "unavailable";
      }
      if (!alive) return;
      if (result === "ok") {
        setState("ok");
      } else if (result === "denied") {
        setState("denied");
        router.replace("/");
      } else {
        setState("unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  return state;
}

// NOT: useBeslenmeFoodContributorGuard (ayrı "Besinlerim" manuel-besin guard'ı) KALDIRILDI.
// CUSTOM besin yönetimi tam Beslenme modülüne taşındı → /beslenme/besinler useBeslenmeModuleGuard
// ile korunur; ayrı dar besin-katkı yeteneği yok.

/**
 * emerald pastel zemin — hero ve guard ekranı ortak kullanır.
 *
 * BUG-017 (AŞAMA 2 / B1): `overflow-hidden` kaydırma KONTEYNERİ oluşturur; taşan dekor blob'u
 * (-right-24 = 96 px) yüzünden odak/scrollIntoView (ör. Besin Ekle diyaloğu aç/kapat) `main`i
 * programatik olarak yatay kaydırıp içeriği sola 96 px kaydırıyordu. `overflow-x-clip` taşmayı
 * keser ama kaydırılabilir alan oluşturmaz; blob'lar ayrıca kendi kırpma katmanında.
 */
const PAGE_BG =
  "relative min-h-screen overflow-x-clip bg-[radial-gradient(ellipse_at_top_left,#f2fbf6_0%,#eefaf3_46%,#f4f9ff_100%)] text-slate-950";

function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-emerald-200/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-teal-200/16 blur-3xl"
      />
    </div>
  );
}

/**
 * Guard durumunu tam-ekran gösterir. state !== "ok" iken sayfa BUNU render
 * etmeli (asla gerçek içeriği değil). loading → spinner; denied → yönlendiriliyor.
 */
export function BeslenmeGate({ state }: { state: GuardState }) {
  return (
    <main className={PAGE_BG}>
      <Blobs />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {state === "denied" ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-slate-400 shadow-sm">
                <Lock className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-[13px] font-bold text-slate-500">Yönlendiriliyorsunuz…</p>
            </>
          ) : state === "unavailable" ? (
            <div data-testid="access-unverified" className="flex flex-col items-center gap-3">
              <p className="text-[13px] font-bold text-slate-600" role="status" aria-live="polite">
                Erişim şu an doğrulanamadı. Oturumunuz açık; lütfen tekrar deneyin.
              </p>
              <button
                type="button"
                data-testid="access-retry"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-200 bg-white/90 px-4 text-[13px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Tekrar Dene
              </button>
            </div>
          ) : (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-hidden />
              <p className="text-[13px] font-bold text-slate-500">Erişim doğrulanıyor…</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export type BeslenmeShellProps = {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Hero sağında soluk dev dekor ikon. */
  icon?: ReactNode;
  /** Hero sağ üst aksiyon/istatistik alanı. */
  actions?: ReactNode;
  /** "Beslenme Merkezi"ne dön bağlantısı gösterilsin mi? (hub'da gizli) */
  backHref?: string;
  backLabel?: string;
  maxWidthClass?: string;
  children: ReactNode;
};

export function BeslenmeShell({
  eyebrow = "Beslenme & Metabolik Yaşam",
  title,
  subtitle,
  icon,
  actions,
  backHref,
  backLabel = "Beslenme Merkezi",
  maxWidthClass = "max-w-[1600px]",
  children,
}: BeslenmeShellProps) {
  return (
    <main className={PAGE_BG}>
      <Blobs />

      {/*
        Mobil tam genişlik (owner kararı 22.10.2026): telefonda (< 640 px) dış yatay padding 0 —
        dış kartlar BES_CARD_BLEED ile kenara dayanır, kart dışı satırlar BES_GUTTER ile içeri alınır.
        viewportFit=cover → çentik/gezinme çubuğu güvenli alanları korunur. sm+ eski boşluklar.
      */}
      <div
        className={`relative z-10 mx-auto w-full min-w-0 ${maxWidthClass} pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-8 xl:px-10`}
      >
        {backHref ? (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1.5 max-sm:ml-4 rounded-lg border border-emerald-100 bg-white/80 px-3 py-1.5 text-[12px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        ) : null}

        <header className="relative overflow-hidden rounded-2xl border border-white/80 max-sm:rounded-none max-sm:border-x-0 bg-white/85 px-5 py-5 shadow-[0_10px_34px_-16px_rgba(15,23,42,0.20)] ring-1 ring-white/90 backdrop-blur-md sm:px-7 sm:py-6">
          {icon ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 select-none text-emerald-500/[0.07] sm:block"
            >
              {icon}
            </div>
          ) : null}

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 sm:flex-1">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {eyebrow}
              </div>

              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                {title}
              </h1>

              {subtitle ? (
                <p className="mt-1.5 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                  {subtitle}
                </p>
              ) : null}
            </div>

            {actions ? (
              // BUG-017: eskiden `shrink-0` → çok eylemli sayfalarda (plan detayı) eylemler tek satırda
              // genişleyip başlığı sıfıra indiriyor ve kartın dışına taşıp kesiliyordu (1024/1366 px).
              // Artık en fazla %60 genişlikte sarılır; başlık sütunu esner.
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:max-w-[60%] sm:justify-end">{actions}</div>
            ) : null}
          </div>
        </header>

        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}
