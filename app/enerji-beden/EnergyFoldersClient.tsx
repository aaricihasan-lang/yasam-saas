"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";

export type EnergyFolder = {
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

/**
 * REF-020 (UI-only): Refleksoloji kartı YALNIZ granular `reflexology`/`refleksoloji`
 * izniyle görünür. Backend izin semantiği DEĞİŞMEZ (energy_body → reflexology fallback
 * EKLENMEZ); yalnız home görünürlüğü API kapısıyla hizalanır. Biyoenerji/Kupa kartları
 * mevcut davranışını korur (bu değişiklik onların görünürlüğünü DEĞİŞTİRMEZ).
 */
export function EnergyFoldersClient({ folders }: { folders: readonly EnergyFolder[] }) {
  const [reflexAllowed, setReflexAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const u = readYasamUser();
    if (!u) {
      setReflexAllowed(false);
      return;
    }
    if (u.is_demo_account === true) {
      setReflexAllowed(true);
      return;
    }
    setReflexAllowed(
      resolveModuleAccess(u.role, u.module_permissions ?? null, "reflexology"),
    );
  }, []);

  const visible = folders.filter((f) => {
    if (f.href !== "/refleksoloji") return true;
    // Kontrol tamamlanana kadar (null) gizli tut → yetkisiz karta tıklama/flash olmaz.
    return reflexAllowed === true;
  });

  return (
    <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-cols-1 items-stretch gap-5 pb-2 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((folder) => (
        <Link
          key={folder.title}
          href={folder.href}
          className={`group flex h-auto flex-col overflow-hidden rounded-2xl border bg-gradient-to-br shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${folder.gradient} ${folder.border}`}
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
