"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  FolderArchive,
  Video,
} from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { runInEffect } from "@/lib/runInEffect";

/**
 * FAZ1 FINAL HARDENING (AUTH — AI admin-only): OpenAI maliyeti doğuran alt modüller
 * (Video → Türkçe, Ders Notu) YALNIZ yöneticiye gösterilir. Sunucu da aynı kuralı zorlar
 * (video_ceviri / ders_notu → admin-only; lib/auth/moduleAccessCore ADMIN_ONLY_MODULE_KEYS).
 * Rol localStorage'dan mount SONRASI okunur (SSR/hydration farkı olmasın); ilk render'da
 * AI kartları gizlidir → uzman ölü/yetkisiz kart görmez.
 */
const subModules = [
  {
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge ve kişisel kayıt sistemi. Tüm dosyalarınızı tek merkezde saklayın.",
    href: "/dashboard/kisisel-arsiv",
    Icon: FolderArchive,
    badge: "Arşiv",
    iconGradient: "from-orange-500 to-amber-500",
    cardGradient: "from-orange-100/90 via-amber-50/95 to-white",
    border: "border-orange-200/70",
    adminOnly: false,
  },
  {
    title: "Belge Çeviri Merkezi",
    desc: "PDF belgelerini düzenlenebilir Word dosyasına dönüştür ve yönet.",
    href: "/belge-ceviri",
    Icon: BookOpen,
    badge: "Belge",
    iconGradient: "from-sky-500 to-cyan-600",
    cardGradient: "from-sky-100/90 via-cyan-50/95 to-white",
    border: "border-sky-200/70",
    adminOnly: false,
  },
  {
    title: "Video → Türkçe Word/PDF",
    desc: "Videolardan Türkçe transkript, çeviri ve eğitim dokümanı üretme merkezi.",
    href: "/video-ceviri",
    Icon: Video,
    badge: "Video",
    iconGradient: "from-rose-500 to-pink-600",
    cardGradient: "from-rose-100/90 via-pink-50/95 to-white",
    border: "border-rose-200/70",
    adminOnly: true,
  },
  {
    title: "Ders Notu Merkezi",
    desc: "Ham transkripti temizle, ders notuna dönüştür. Human Design uyumlu AI çıktısı.",
    href: "/ders-notu",
    Icon: ClipboardList,
    badge: "Notlar",
    iconGradient: "from-teal-600 to-emerald-700",
    cardGradient: "from-teal-50/90 via-emerald-50/95 to-white",
    border: "border-teal-200/70",
    adminOnly: true,
  },
] as const;

export default function DigitalContentModuleGrid() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    runInEffect(() => setIsAdmin(isAdminUser(readYasamUser())));
  }, []);

  const visible = subModules.filter((mod) => isAdmin || !mod.adminOnly);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
      {visible.map((mod) => {
        const { Icon } = mod;
        return (
          <Link
            key={mod.href}
            href={mod.href}
            className={`group flex flex-col rounded-[18px] border bg-gradient-to-br p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${mod.cardGradient} ${mod.border}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-all duration-200 group-hover:scale-105 ${mod.iconGradient}`}
              >
                <Icon className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <span className="rounded-full border border-white/80 bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm">
                {mod.badge}
              </span>
            </div>

            <h2 className="mt-2 text-sm font-black text-slate-900 sm:text-base">
              {mod.title}
            </h2>
            <p className="mt-0.5 flex-1 text-xs leading-5 text-slate-600">
              {mod.desc}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/80">
                Aktif
              </span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105"
                aria-hidden
              >
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
