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
import { readYasamUser, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";
import {
  DIGITAL_CONTENT_HUB_CHILDREN,
  canSeeHubChild,
  type HubChildId,
} from "@/lib/auth/hubVisibility";

/**
 * Dijital İçerik Merkezi alt kartları — owner kararı: uzman KENDİSİNE AÇILMAMIŞ alt modülü
 * GÖRMEZ. Her kart yalnız kullanıcının o alt modüle gerçek izni varsa render edilir
 * (lib/auth/hubVisibility tek kaynak; admin tümünü görür). Video → Türkçe ve Ders Notu
 * admin-only AI yüzeyleridir (moduleAccessCore.ADMIN_ONLY_MODULE_KEYS) → uzmanda bayraktan
 * bağımsız görünmez. Sunucu yetkisi AYRICA zorlanır (ModuleRouteGuard + requireModuleAccess);
 * bu bileşen yalnız görünürlüktür.
 *
 * İzinler canlı DB'den kesinleşmeden (syncYasamUserFromDb) kart render EDİLMEZ → sonradan
 * açılan izin kartı gösterir, kapatılan izin kartı gizler; yetkisiz kart hiç flash etmez.
 */
const subModules: {
  id: HubChildId;
  title: string;
  desc: string;
  href: string;
  Icon: typeof FolderArchive;
  badge: string;
  iconGradient: string;
  cardGradient: string;
  border: string;
}[] = [
  {
    id: "personal_archive",
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge ve kişisel kayıt sistemi. Tüm dosyalarınızı tek merkezde saklayın.",
    href: "/dashboard/kisisel-arsiv",
    Icon: FolderArchive,
    badge: "Arşiv",
    iconGradient: "from-orange-500 to-amber-500",
    cardGradient: "from-orange-100/90 via-amber-50/95 to-white",
    border: "border-orange-200/70",
  },
  {
    id: "belge_ceviri",
    title: "Belge Çeviri Merkezi",
    desc: "PDF belgelerini düzenlenebilir Word dosyasına dönüştür ve yönet.",
    href: "/belge-ceviri",
    Icon: BookOpen,
    badge: "Belge",
    iconGradient: "from-sky-500 to-cyan-600",
    cardGradient: "from-sky-100/90 via-cyan-50/95 to-white",
    border: "border-sky-200/70",
  },
  {
    id: "video_ceviri",
    title: "Video → Türkçe Word/PDF",
    desc: "Videolardan Türkçe transkript, çeviri ve eğitim dokümanı üretme merkezi.",
    href: "/video-ceviri",
    Icon: Video,
    badge: "Video",
    iconGradient: "from-rose-500 to-pink-600",
    cardGradient: "from-rose-100/90 via-pink-50/95 to-white",
    border: "border-rose-200/70",
  },
  {
    id: "ders_notu",
    title: "Ders Notu Merkezi",
    desc: "Ham transkripti temizle, ders notuna dönüştür. Human Design uyumlu AI çıktısı.",
    href: "/ders-notu",
    Icon: ClipboardList,
    badge: "Notlar",
    iconGradient: "from-teal-600 to-emerald-700",
    cardGradient: "from-teal-50/90 via-emerald-50/95 to-white",
    border: "border-teal-200/70",
  },
];

const CHILD_BY_ID = new Map(DIGITAL_CONTENT_HUB_CHILDREN.map((child) => [child.id, child]));

export default function DigitalContentModuleGrid() {
  const [user, setUser] = useState<YasamUser | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    // Canlı module_permissions ile kesinleştir; hata olsa da resolve → yetki fail-closed kalır.
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setUser(fresh ?? cached ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(cached ?? null);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Çözülene kadar sessiz boşluk (iskelet/yetkisiz kart yok); min-height dikey sıçramayı önler.
  if (!resolved) {
    return <div className="min-h-[10rem] w-full" aria-busy="true" aria-hidden />;
  }

  const visible = subModules.filter((mod) => {
    const child = CHILD_BY_ID.get(mod.id);
    return child ? canSeeHubChild(user, child) : false;
  });

  if (visible.length === 0) {
    return (
      <div
        data-digital-content-empty
        className="rounded-[18px] border border-slate-200 bg-white/70 px-5 py-8 text-center text-sm font-medium text-slate-600"
      >
        Bu merkezde hesabınız için açık bir modül bulunmuyor.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-4">
      {visible.map((mod) => {
        const { Icon } = mod;
        return (
          <Link
            key={mod.href}
            href={mod.href}
            data-digital-content-card={mod.id}
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
