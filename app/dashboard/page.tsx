"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Uzman API çağrıları için kimlik başlıkları (publishable supabase yerine). */
function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return { "x-user-id": uid ?? "", ...(token ? { "x-session-token": token } : {}) };
}

export default function DashboardPage() {
  const t = useTranslations("home.dashboard");
  const [totalClients, setTotalClients] = useState<number | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTotalClients() {
      const res = await fetch("/api/clients", { headers: userHeaders() });

      if (cancelled) return;

      if (!res.ok) {
        console.error("Danışan sayısı alınamadı");
        setTotalClients(0);
        return;
      }

      const json = (await res.json()) as { clients?: unknown[] };
      if (cancelled) return;
      setTotalClients(json.clients?.length ?? 0);
    }

    loadTotalClients();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTodayAppointments() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const params = new URLSearchParams({
        from: today.toISOString(),
        to: new Date(tomorrow.getTime() - 1).toISOString(),
      });
      const res = await fetch(`/api/appointments?${params.toString()}`, {
        headers: userHeaders(),
      });

      if (cancelled) return;

      if (!res.ok) {
        console.error("Randevu sayısı alınamadı");
        setTodayAppointments(0);
        return;
      }

      const json = (await res.json()) as { appointments?: unknown[] };
      if (cancelled) return;
      setTodayAppointments(json.appointments?.length ?? 0);
    }

    loadTodayAppointments();

    return () => {
      cancelled = true;
    };
  }, []);

  const modules: {
    id: string;
    title: string;
    desc: string;
    icon: string;
    href?: string;
    badge?: string;
    /** Sadece Numeroloji: güçlü hover / glow / scale */
    premiumGlow?: boolean;
  }[] = [
    {
      id: "clients",
      title: t("cards.clients.title"),
      desc: t("cards.clients.desc"),
      icon: "👥",
      href: "/dashboard/clients",
    },
    {
      id: "agenda",
      title: t("cards.agenda.title"),
      desc: t("cards.agenda.desc"),
      icon: "🗓️",
      href: "/dashboard/ajanda",
    },
    {
      id: "stones",
      title: t("cards.stones.title"),
      desc: t("cards.stones.desc"),
      icon: "💎",
      href: "/dogaltas",
    },
    {
      id: "bioenergy",
      title: t("cards.bioenergy.title"),
      desc: t("cards.bioenergy.desc"),
      icon: "✨",
      href: "/dashboard/biyoenerji",
      badge: t("badgeNew"),
    },
    {
      id: "personalArchive",
      title: t("cards.personalArchive.title"),
      desc: t("cards.personalArchive.desc"),
      icon: "🗂️",
      href: "/dashboard/kisisel-arsiv",
      badge: t("badgeNewUpper"),
    },
    {
      id: "numerology",
      title: t("cards.numerology.title"),
      desc: t("cards.numerology.desc"),
      icon: "🔢",
      href: "/numeroloji",
      premiumGlow: true,
    },
    {
      id: "reflexology",
      title: t("cards.reflexology.title"),
      desc: t("cards.reflexology.desc"),
      icon: "🦶",
    },
    {
      id: "aromatherapy",
      title: t("cards.aromatherapy.title"),
      desc: t("cards.aromatherapy.desc"),
      icon: "🌿",
    },
    {
      id: "cupping",
      title: t("cards.cupping.title"),
      desc: t("cards.cupping.desc"),
      icon: "🫙",
      href: "/kupa",
      badge: t("badgeNew"),
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#081028] text-white">
      {/* SIDEBAR */}

      <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#0b1736] p-4">
        <div>
          <h1 className="text-lg font-bold tracking-wide">
            Yaşam Sistemi
          </h1>

          <p className="mt-0.5 text-[11px] text-slate-400">
            {t("brandTagline")}
          </p>
        </div>

        <div className="mt-6 space-y-2">
          <button className="w-full rounded-xl border border-indigo-400/30 bg-indigo-500/20 p-2.5 text-left text-sm transition hover:bg-indigo-500/30">
            {t("navDashboard")}
          </button>

          <Link
            href="/dashboard/clients"
            className="block w-full rounded-xl bg-white/5 p-2.5 text-left text-sm text-inherit no-underline transition hover:bg-white/10"
          >
            {t("navClients")}
          </Link>

          <Link
            href="/dashboard/ajanda"
            className="block w-full rounded-xl bg-white/5 p-2.5 text-left text-sm text-inherit no-underline transition hover:bg-white/10"
          >
            {t("navAgenda")}
          </Link>

          <Link
            href="/dogaltas"
            className="block w-full rounded-xl bg-white/5 p-2.5 text-left text-sm text-inherit no-underline transition hover:bg-white/10"
          >
            {t("navStones")}
          </Link>
        </div>

        <div className="mt-auto pt-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3">
            <p className="text-xs font-semibold">
              {t("premiumActive")}
            </p>

            <p className="mt-0.5 text-[11px] opacity-80">
              {t("allModulesRunning")}
            </p>
          </div>
        </div>
      </aside>

      {/* CONTENT */}

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4 md:p-5">
        {/* TOP */}

        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight md:text-[1.65rem]">
              {t("welcome")}
            </h2>

            <p className="mt-0.5 text-xs text-slate-400 md:text-[13px]">
              {t("welcomeSub")}
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 px-3 py-2 shadow-lg shadow-pink-500/20 ring-1 ring-white/10">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/90">
              {t("activeUser")}
            </p>
            <p className="text-xs font-bold leading-tight">
              {t("expertPanel")}
            </p>
          </div>
        </div>

        {/* STATS */}

        <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              {t("statTotalClients")}
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              {totalClients === null ? "…" : totalClients}
            </h3>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              {t("statTodayAppointments")}
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              {todayAppointments === null ? "…" : todayAppointments}
            </h3>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              {t("statSavedStones")}
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              516
            </h3>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              {t("statActiveModules")}
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              8
            </h3>
          </div>
        </div>

        {/* MODULES */}

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 pt-0.5">
          <h3 className="shrink-0 text-sm font-semibold text-slate-200 md:text-base">
            {t("modulesTitle")}
          </h3>

          <div className="grid w-full min-h-0 shrink-0 grid-cols-2 content-start gap-1.5 auto-rows-fr md:grid-cols-3 md:gap-2">
            {modules.map((module) => {
              const cardClass =
                "relative flex w-full min-h-[5.5rem] flex-col justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 backdrop-blur-sm transition duration-200 md:min-h-[5.75rem] md:gap-1.5 md:px-2.5 md:py-2";

              const linkHoverClass =
                "hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_10px_28px_rgba(0,0,0,0.32)] active:translate-y-0 active:brightness-[0.98]";

              const numerolojiHoverClass =
                "cursor-pointer transition-all duration-300 ease-out hover:scale-[1.03] hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-gradient-to-br hover:from-violet-500/[0.14] hover:to-fuchsia-500/[0.08] hover:shadow-[0_0_36px_-6px_rgba(167,139,250,0.55),0_14px_36px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.07)] active:scale-[1.01] active:translate-y-0 active:brightness-[0.97]";

              const staticHoverClass =
                "hover:border-white/14 hover:bg-white/[0.06]";

              const inner = (
                <>
                  <div
                    className="text-xl leading-none md:text-[1.35rem]"
                    aria-hidden
                  >
                    {module.icon}
                  </div>

                  <h4 className="text-xs font-bold leading-tight md:text-[13px]">
                    {module.title}
                  </h4>

                  <p className="line-clamp-2 text-[10px] leading-tight text-slate-400 md:text-[11px]">
                    {module.desc}
                  </p>
                </>
              );

              if (module.href) {
                const linkMotion = module.premiumGlow ? numerolojiHoverClass : `${linkHoverClass} transition-all duration-200`;
                const focusRing = module.premiumGlow
                  ? "focus-visible:ring-2 focus-visible:ring-violet-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081028]"
                  : "focus-visible:ring-2 focus-visible:ring-indigo-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081028]";
                return (
                  <Link
                    key={module.id}
                    href={module.href}
                    className={`${cardClass} ${linkMotion} text-inherit no-underline outline-none ${focusRing}`}
                  >
                    {module.badge ? (
                      <span className="absolute right-1.5 top-1.5 z-[1] rounded-full bg-indigo-500/25 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-indigo-100 ring-1 ring-indigo-400/35 md:right-2 md:top-2">
                        {module.badge}
                      </span>
                    ) : null}
                    {inner}
                  </Link>
                );
              }

              return (
                <div
                  key={module.id}
                  className={`${cardClass} ${staticHoverClass} cursor-default`}
                >
                  {module.badge ? (
                    <span className="absolute right-1.5 top-1.5 z-[1] rounded-full bg-indigo-500/25 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-indigo-100 ring-1 ring-indigo-400/35 md:right-2 md:top-2">
                      {module.badge}
                    </span>
                  ) : null}
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}