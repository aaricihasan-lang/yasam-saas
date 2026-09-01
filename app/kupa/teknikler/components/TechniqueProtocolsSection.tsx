"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listTechniqueProtocols, type CuppingTechniqueProtocolRef } from "../../lib/api";

/**
 * "Kullanıldığı Protokoller" — read-only. Bu tekniği kullanan protokollerin adları,
 * tıklanınca /kupa/protokoller/[id]. DB id/tenant/relation id GÖSTERİLMEZ. Bu bölümün
 * hatası ana teknik okuyucuyu BOZMAZ (yalnız bölüm-içi hata).
 */
export function TechniqueProtocolsSection({ techniqueId }: { techniqueId: string }) {
  const [rows, setRows] = useState<CuppingTechniqueProtocolRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // techniqueId okuyucu mount'unda sabittir (reader key'li) → tek yükleme; init null.
  useEffect(() => {
    let alive = true;
    listTechniqueProtocols(techniqueId)
      .then((data) => alive && setRows(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Yüklenemedi."));
    return () => {
      alive = false;
    };
  }, [techniqueId]);

  return (
    <section>
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Kullanıldığı Protokoller</h3>
      <div className="mt-2">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
            Protokol kullanımı yüklenemedi.
          </p>
        ) : rows === null ? (
          <p className="text-[13px] text-slate-400">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-slate-500">
            Bu teknik henüz bir protokolde kullanılmıyor.
          </p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-slate-600">
              {rows.length} protokolde kullanılıyor
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/kupa/protokoller/${p.id}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 no-underline outline-none transition hover:border-amber-200 hover:bg-amber-50/40 focus-visible:ring-2 focus-visible:ring-amber-400/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-slate-800">{p.title}</span>
                      {p.category ? (
                        <span className="block truncate text-[12px] text-slate-500">{p.category}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.is_active === false ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400">Pasif</span>
                      ) : null}
                      <span className="text-sm font-semibold text-amber-700 transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
