"use client";
/**
 * Beslenme modülü — ortak sayfa kabuğu + owner-only koruma kancası.
 *
 * `useBeslenmeOwnerGuard()`: her beslenme sayfasında mount'ta checkBeslenmeAccess()
 * çağırır; "loading" | "ok" | "denied" döner. denied ise "/"'a yönlendirir.
 * İçerik erişim doğrulanmadan ASLA render edilmez (defense-in-depth; API zaten
 * server-side owner-gated).
 *
 * `BeslenmeGate`: guard durumuna göre yükleniyor/erişim-yok ekranını çizer.
 * `BeslenmeShell`: emerald pastel zemin + cam hero + container (alt sayfalarda ortak).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";

export type GuardState = "loading" | "ok" | "denied";

export function useBeslenmeOwnerGuard(): GuardState {
  const router = useRouter();
  const [state, setState] = useState<GuardState>("loading");

  useEffect(() => {
    let alive = true;
    void (async () => {
      let ok = false;
      try {
        ok = await checkBeslenmeAccess();
      } catch {
        ok = false;
      }
      if (!alive) return;
      if (ok) {
        setState("ok");
      } else {
        setState("denied");
        router.replace("/");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  return state;
}

/** emerald pastel zemin — hero ve guard ekranı ortak kullanır. */
const PAGE_BG =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#f2fbf6_0%,#eefaf3_46%,#f4f9ff_100%)] text-slate-950";

function Blobs() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-emerald-200/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-teal-200/16 blur-3xl"
      />
    </>
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

      <div
        className={`relative z-10 mx-auto w-full ${maxWidthClass} px-4 py-4 sm:px-6 lg:px-8 xl:px-10`}
      >
        {backHref ? (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-white/80 px-3 py-1.5 text-[12px] font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        ) : null}

        <header className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-5 py-5 shadow-[0_10px_34px_-16px_rgba(15,23,42,0.20)] ring-1 ring-white/90 backdrop-blur-md sm:px-7 sm:py-6">
          {icon ? (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-3 top-1/2 hidden -translate-y-1/2 select-none text-emerald-500/[0.07] sm:block"
            >
              {icon}
            </div>
          ) : null}

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
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
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        </header>

        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}
