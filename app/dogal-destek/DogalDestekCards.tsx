"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasAnyModulePermissionFlag } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb, type YasamUser } from "@/lib/auth/yasamUser";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";

/**
 * Doğal Destek & Rehber alt kartları. Parent route erişimi ModuleRouteGuard +
 * routeModuleAccess (/dogal-destek OR kuralı) ile kapılanır; bu bileşen yalnız
 * KULLANICININ GERÇEKTEN İZNİ OLAN alt kartı gösterir.
 *
 * İzin kaynakları REUSE edilir (yeni auth mimarisi ÜRETİLMEZ):
 *   - Aromaterapi / Şifa Rehberi: readYasamUser() + syncYasamUserFromDb() (canlı
 *     module_permissions) + merkezî OR hasAnyModulePermissionFlag (flag-tabanlı).
 *   - Beslenme (tam modül): server-authoritative checkBeslenmeAccess() (admin VEYA beslenme=true).
 *
 * FLICKER FIX: gerçek kartlar İKİ authorization kaynağı da kesinleşmeden (userResolved &&
 * beslenmeResolved) render EDİLMEZ → kartlar TEK SEFERDE görünür (2→3 sıçraması yok). Çözülene
 * kadar iskelet/spinner ya da loading metni GÖSTERİLMEZ; kart alanı SESSİZCE boş kalır, yalnız
 * container min-height'ı korunarak dikey sıçrama önlenir. Kartlar hazır olunca çok kısa ve sade
 * bir opacity geçişiyle görünür (dikkat çeken animasyon yok). Ayrı "Besinlerim"/manuel-besin alt
 * kartı ÜRÜNDEN KALDIRILDI (CUSTOM besin yönetimi tam Beslenme modülünün içindedir: /beslenme →
 * Besinler). `clients` bu hub'ı/alt kartı açmaz.
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

/** Kart sayısına göre dengeli responsive grid (mobil 1 · sm 2 · 3 kart lg 3). */
function gridClass(count: number): string {
  if (count >= 4) return "max-w-4xl grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-5xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "max-w-3xl grid-cols-1 sm:grid-cols-2";
}

export default function DogalDestekCards() {
  const [user, setUser] = useState<YasamUser | null>(null);
  // İki authorization kaynağı ayrı ayrı "resolved" olarak izlenir → ikisi de bitmeden render yok.
  const [userResolved, setUserResolved] = useState(false);
  const [beslenmeAccess, setBeslenmeAccess] = useState(false);
  const [beslenmeResolved, setBeslenmeResolved] = useState(false);
  // Kartlar mount olduktan bir kare sonra opacity 0→1 (çok kısa, sade fade — dikkat çekmez).
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    // Canlı module_permissions ile kesinleştir (login_user RPC izinleri döndürmez). Hata da olsa
    // finally ile resolve → sonsuz loading olmaz; yetki fail-closed kalır.
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setUser(fresh ?? cached ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(cached ?? null);
      })
      .finally(() => {
        if (!cancelled) setUserResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void checkBeslenmeAccess()
      .then((ok) => {
        if (!cancelled) setBeslenmeAccess(ok === true);
      })
      .catch(() => {
        if (!cancelled) setBeslenmeAccess(false);
      })
      .finally(() => {
        if (!cancelled) setBeslenmeResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accessResolved = userResolved && beslenmeResolved;

  useEffect(() => {
    if (!accessResolved) return;
    // Kartlar DOM'a girdikten sonra bir sonraki kare: opacity 0→1 geçişini tetikle.
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [accessResolved]);

  // Çözülene kadar SESSİZ boşluk — iskelet/spinner ya da loading metni YOK, gerçek kart YOK
  // (2→3 flicker'ı önle). Yalnız min-height korunur → yetki gelince layout dikey sıçramaz.
  if (!accessResolved) {
    return <div className="min-h-[16rem] w-full" aria-busy="true" aria-hidden />;
  }

  // Tüm access sonuçları kesin → görünür kartları TEK SEFERDE oluştur.
  const visible: SupportFolder[] = flagFolders.filter((folder) =>
    hasAnyModulePermissionFlag(user, [...folder.keys]),
  );
  if (beslenmeAccess) visible.push(BESLENME_FOLDER);

  return (
    <div
      className={`mx-auto grid min-h-[16rem] w-full items-stretch gap-6 transition-opacity duration-300 ease-out ${
        revealed ? "opacity-100" : "opacity-0"
      } ${gridClass(visible.length)}`}
    >
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
