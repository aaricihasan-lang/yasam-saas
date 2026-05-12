"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

export default function DashboardPage() {
  const [totalClients, setTotalClients] = useState<number | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTotalClients() {
      const { count, error } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", TENANT_ID);

      if (cancelled) return;

      if (error) {
        console.error(error);
        setTotalClients(0);
        return;
      }

      setTotalClients(count ?? 0);
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

      const { count, error } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", TENANT_ID)
        .gte("appointment_date", today.toISOString())
        .lt("appointment_date", tomorrow.toISOString());

      if (cancelled) return;

      if (error) {
        console.error(error);
        setTodayAppointments(0);
        return;
      }

      setTodayAppointments(count ?? 0);
    }

    loadTodayAppointments();

    return () => {
      cancelled = true;
    };
  }, []);

  const modules: {
    title: string;
    desc: string;
    icon: string;
    href?: string;
  }[] = [
    {
      title: "Danışanlar",
      desc: "Danışan kayıt ve analiz sistemi",
      icon: "👥",
      href: "/dashboard/clients",
    },
    {
      title: "Ajanda",
      desc: "Randevu ve seans yönetimi",
      icon: "🗓️",
      href: "/dashboard/ajanda",
    },
    {
      title: "Doğaltaş",
      desc: "Taş ve mineral veri sistemi",
      icon: "💎",
      href: "/dogaltas",
    },
    {
      title: "Numeroloji",
      desc: "Numerolojik analiz modülü",
      icon: "🔢",
    },
    {
      title: "Refleksoloji",
      desc: "Bölge ve seans sistemi",
      icon: "🦶",
    },
    {
      title: "Aromaterapi",
      desc: "Uçucu ve sabit yağ sistemi",
      icon: "🌿",
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
            Premium SaaS Panel
          </p>
        </div>

        <div className="mt-6 space-y-2">
          <button className="w-full rounded-xl border border-indigo-400/30 bg-indigo-500/20 p-2.5 text-left text-sm transition hover:bg-indigo-500/30">
            Dashboard
          </button>

          <Link
            href="/dashboard/clients"
            className="block w-full rounded-xl bg-white/5 p-2.5 text-left text-sm text-inherit no-underline transition hover:bg-white/10"
          >
            Danışanlar
          </Link>

          <Link
            href="/dashboard/ajanda"
            className="block w-full rounded-xl bg-white/5 p-2.5 text-left text-sm text-inherit no-underline transition hover:bg-white/10"
          >
            Ajanda
          </Link>

          <Link
            href="/dogaltas"
            className="block w-full rounded-xl bg-white/5 p-2.5 text-left text-sm text-inherit no-underline transition hover:bg-white/10"
          >
            Doğaltaş
          </Link>
        </div>

        <div className="mt-auto pt-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3">
            <p className="text-xs font-semibold">
              Premium Sistem Aktif
            </p>

            <p className="mt-0.5 text-[11px] opacity-80">
              Tüm modüller çalışıyor
            </p>
          </div>
        </div>
      </aside>

      {/* CONTENT */}

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 md:p-5">
        {/* TOP */}

        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight md:text-[1.65rem]">
              Hoş Geldiniz 👋
            </h2>

            <p className="mt-0.5 text-xs text-slate-400 md:text-[13px]">
              Yaşam Sistemi yönetim paneline giriş yaptınız.
            </p>
          </div>

          <div className="shrink-0 rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 px-3 py-2 shadow-lg shadow-pink-500/20 ring-1 ring-white/10">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/90">
              Aktif Kullanıcı
            </p>
            <p className="text-xs font-bold leading-tight">
              Uzman Paneli
            </p>
          </div>
        </div>

        {/* STATS */}

        <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              Toplam Danışan
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              {totalClients === null ? "…" : totalClients}
            </h3>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              Bugünkü Randevu
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              {todayAppointments === null ? "…" : todayAppointments}
            </h3>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              Kayıtlı Taş
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              516
            </h3>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400">
              Aktif Modül
            </p>

            <h3 className="mt-1 text-xl font-bold tabular-nums md:text-2xl">
              7
            </h3>
          </div>
        </div>

        {/* MODULES */}

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 pt-0.5">
          <h3 className="shrink-0 text-sm font-semibold text-slate-200 md:text-base">
            Modüller
          </h3>

          <div className="grid w-full shrink-0 grid-cols-2 content-start gap-1.5 auto-rows-min md:grid-cols-3 md:gap-2">
            {modules.map((module) => {
              const cardClass =
                "flex w-full flex-col justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 backdrop-blur-sm transition duration-200 md:gap-1.5 md:px-2.5 md:py-2";

              const linkHoverClass =
                "hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_10px_28px_rgba(0,0,0,0.32)] active:translate-y-0 active:brightness-[0.98]";

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
                return (
                  <Link
                    key={module.title}
                    href={module.href}
                    className={`${cardClass} ${linkHoverClass} cursor-pointer text-inherit no-underline outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081028]`}
                  >
                    {inner}
                  </Link>
                );
              }

              return (
                <div
                  key={module.title}
                  className={`${cardClass} ${staticHoverClass} cursor-default`}
                >
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