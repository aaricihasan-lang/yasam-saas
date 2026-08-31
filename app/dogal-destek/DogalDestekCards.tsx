"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasAnyModulePermissionFlag } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";

/**
 * Doğal Destek & Rehber alt kartları. Parent route erişimi ModuleRouteGuard +
 * routeModuleAccess (/dogal-destek OR kuralı) ile kapılanır; bu bileşen yalnız
 * KULLANICININ GERÇEKTEN İZNİ OLAN alt kartı gösterir (alt-kart matrisi).
 *
 * İzin kaynağı yeniden kullanılır: readYasamUser() + syncYasamUserFromDb() (canlı
 * module_permissions) ve merkezî OR yardımcı hasAnyModulePermissionFlag. Yeni auth
 * mimarisi ÜRETİLMEZ. Aromaterapi izni ≠ Şifa Rehberi izni: her kart kendi anahtar
 * kümesiyle bağımsız değerlendirilir.
 */
const supportFolders = [
  {
    title: "Aromaterapi",
    desc: "Uçucu yağlar, sabit yağlar ve karışımlar",
    href: "/aromaterapi",
    keys: ["aromatherapy", "aromaterapi"],
    icon: "🌸",
    badge: "Koku & Yağ",
    gradient: "from-orange-100 to-yellow-50",
    border: "border-orange-200/70",
    accent: "text-orange-900",
    button: "bg-orange-800/90 text-white hover:bg-orange-900",
  },
  {
    title: "Şifa Rehberi",
    desc: "Rahatsızlık kayıtları, belirtiler ve destekleyici öneriler",
    href: "/sifa-rehberi",
    keys: ["sifa_rehberi", "healing"],
    icon: "🌿",
    badge: "Şifa",
    gradient: "from-green-100 to-teal-50",
    border: "border-green-200/70",
    accent: "text-green-900",
    button: "bg-green-800/90 text-white hover:bg-green-900",
  },
] as const;

export default function DogalDestekCards() {
  const [user, setUser] = useState<YasamUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    // Canlı module_permissions ile kesinleştir (login_user RPC izinleri döndürmez).
    // setState yalnız async callback'te — effect gövdesinde senkron değil. Sync başarısız
    // olursa (fresh null) cache'e düşülür; hiç oturum yoksa null (fail-closed).
    void syncYasamUserFromDb(cached).then((fresh) => {
      if (cancelled) return;
      setUser(fresh ?? cached ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fail-closed: user kesinleşene kadar (null) hiçbir kart gösterilmez; izinli olan görünür.
  const visibleFolders = supportFolders.filter((folder) =>
    hasAnyModulePermissionFlag(user, [...folder.keys]),
  );

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 items-stretch gap-6 sm:grid-cols-2">
      {visibleFolders.map((folder) => (
        <Link
          key={folder.title}
          href={folder.href}
          className={`group flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${folder.gradient} ${folder.border}`}
        >
          <div className="flex flex-1 flex-col items-center justify-center px-5 pt-6 text-center">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/60 text-4xl shadow-sm"
              aria-hidden
            >
              {folder.icon}
            </span>
            <span
              className={`mt-4 rounded-full bg-white/60 px-3 py-0.5 text-xs font-bold backdrop-blur ${folder.accent}`}
            >
              {folder.badge}
            </span>
            <h2 className={`mt-3 text-2xl font-bold ${folder.accent}`}>{folder.title}</h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-700/90">
              {folder.desc}
            </p>
          </div>

          <div className="shrink-0 p-5 pt-4">
            <span
              className={`block w-full rounded-xl py-2.5 text-center text-sm font-bold shadow-md transition ${folder.button}`}
            >
              Klasöre Git →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
