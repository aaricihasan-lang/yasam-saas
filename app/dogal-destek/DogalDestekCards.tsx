"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasAnyModulePermissionFlag } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";
import { checkBeslenmeAccess, checkBeslenmeFoodAccess } from "@/lib/beslenme/beslenmeClient";

/**
 * Doğal Destek & Rehber alt kartları. Parent route erişimi ModuleRouteGuard +
 * routeModuleAccess (/dogal-destek OR kuralı) ile kapılanır; bu bileşen yalnız
 * KULLANICININ GERÇEKTEN İZNİ OLAN alt kartı gösterir (alt-kart matrisi).
 *
 * İzin kaynakları REUSE edilir (yeni auth mimarisi ÜRETİLMEZ):
 *   - Aromaterapi / Şifa Rehberi: readYasamUser() + syncYasamUserFromDb() (canlı
 *     module_permissions) + merkezî OR hasAnyModulePermissionFlag (flag-tabanlı).
 *   - Beslenme (tam modül): server-authoritative checkBeslenmeAccess() (admin VEYA beslenme=true).
 *   - Besinlerim (dar manuel): checkBeslenmeFoodAccess()==='expert' VE tam Beslenme YOK
 *     (beslenmeAccess===false). Tam Beslenme/admin/owner "Beslenme" kartını görür → duplicate yok.
 *
 * Beslenme probe'ları TRI-STATE fail-closed: çözülene kadar (null) Beslenme/Besinlerim gizli
 * (async flicker yok). `clients` TEK BAŞINA bu hub'ı veya alt kartları AÇMAZ (danışan-bound
 * Beslenme akışı Danışan Yolculuğu'ndadır; besin OKUMA orada korunur, custom food WRITE değil).
 */
type SupportFolder = {
  title: string;
  desc: string;
  href: string;
  icon: string;
  badge: string;
  gradient: string;
  border: string;
  accent: string;
  button: string;
};

const flagFolders: (SupportFolder & { keys: string[] })[] = [
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
];

// Tam Beslenme alt kartı (server-authoritative access). Emerald ailesi — Aromaterapi (turuncu)
// ve Şifa (yeşil/teal) ile karışmayacak kadar ayrık.
const BESLENME_FOLDER: SupportFolder = {
  title: "Beslenme",
  desc: "Besinler, beslenme yaklaşımları ve profesyonel beslenme bilgileri",
  href: "/beslenme",
  icon: "🥗",
  badge: "Beslenme",
  gradient: "from-emerald-100 to-lime-50",
  border: "border-emerald-200/70",
  accent: "text-emerald-900",
  button: "bg-emerald-800/90 text-white hover:bg-emerald-900",
};

// Dar manuel-besin alt kartı — aynı aile, "Manuel Besin" rozetiyle dar özellik olduğu belli.
const BESINLERIM_FOLDER: SupportFolder = {
  title: "Besinlerim",
  desc: "Kendi özel besinlerinizi ekleyin ve besin değerlerini tamamlayın",
  href: "/beslenme/besinlerim",
  icon: "🍎",
  badge: "Manuel Besin",
  gradient: "from-lime-50 to-emerald-100",
  border: "border-emerald-200/70",
  accent: "text-emerald-900",
  button: "bg-emerald-800/90 text-white hover:bg-emerald-900",
};

/** Kart sayısına göre dengeli responsive grid (mobil 1 · sm 2 · 3 kart lg 3 · 4 kart 2x2). */
function gridClass(count: number): string {
  if (count >= 4) return "max-w-4xl grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-5xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "max-w-3xl grid-cols-1 sm:grid-cols-2";
}

export default function DogalDestekCards() {
  const [user, setUser] = useState<YasamUser | null>(null);
  // Beslenme probe'ları TRI-STATE (null=çözülmedi → fail-closed gizli; flicker yok).
  const [beslenmeAccess, setBeslenmeAccess] = useState<boolean | null>(null);
  const [foodContributor, setFoodContributor] = useState<"owner" | "expert" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    // Canlı module_permissions ile kesinleştir (login_user RPC izinleri döndürmez).
    void syncYasamUserFromDb(cached).then((fresh) => {
      if (cancelled) return;
      setUser(fresh ?? cached ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Server-authoritative Beslenme + manuel-besin probe'ları (mevcut yardımcılar REUSE). setState
  // yalnız async callback'te; probe çözülene kadar null (fail-closed).
  useEffect(() => {
    let cancelled = false;
    void checkBeslenmeAccess().then((ok) => {
      if (!cancelled) setBeslenmeAccess(ok === true);
    });
    void checkBeslenmeFoodAccess().then((auth) => {
      if (!cancelled) setFoodContributor(auth);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fail-closed: user kesinleşene kadar flag-kartları gizli; probe çözülene kadar Beslenme gizli.
  const visible: SupportFolder[] = [
    ...flagFolders.filter((folder) => hasAnyModulePermissionFlag(user, [...folder.keys])),
  ];
  // Tam Beslenme erişimi → "Beslenme" kartı (admin veya beslenme=true).
  if (beslenmeAccess === true) visible.push(BESLENME_FOLDER);
  // Dar manuel yetenek VE tam Beslenme YOK → "Besinlerim" (duplicate önle; clients-only'de gizli).
  if (foodContributor === "expert" && beslenmeAccess === false) visible.push(BESINLERIM_FOLDER);

  return (
    <div className={`mx-auto grid w-full items-stretch gap-6 ${gridClass(visible.length)}`}>
      {visible.map((folder) => (
        <Link
          key={folder.title}
          href={folder.href}
          data-support-card={folder.title}
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
