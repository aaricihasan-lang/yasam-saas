"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { kupaBtnPrimary, kupaInput } from "../../components/KupaShell";
import { listTechniques, type CuppingTechnique } from "../../lib/api";
import {
  MOVEMENT_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
  hasMovement,
  movementStyleLabel,
  techniqueTypeLabel,
} from "../lib/labels";

/**
 * Sol panel — teknik listesi (arama + tür/uygulama-biçimi filtresi). Satırlar
 * /kupa/teknikler/[id] deep-link'idir (browser back/forward temiz). Ham enum kodu /
 * kind / id / DB metadata GÖSTERİLMEZ.
 */

function normalize(v: string): string {
  return v.normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
}

export function TechniqueList({ selectedId, version = 0 }: { selectedId: string | null; version?: number }) {
  const [items, setItems] = useState<CuppingTechnique[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [movementFilter, setMovementFilter] = useState<string>("all");

  // `version` artınca (workspace refreshList → reader edit sonrası) liste yeniden yüklenir.
  useEffect(() => {
    let alive = true;
    listTechniques()
      .then((data) => alive && setItems(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Liste yüklenemedi."));
    return () => {
      alive = false;
    };
  }, [version]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = normalize(q);
    return items.filter((t) => {
      if (needle) {
        const hay = normalize(`${t.name} ${t.description ?? ""}`);
        if (!hay.includes(needle)) return false;
      }
      if (typeFilter !== "all") {
        const tt = t.technique_type || "unspecified";
        if (tt !== typeFilter) return false;
      }
      if (movementFilter !== "all") {
        const ms = t.movement_style || "unspecified";
        if (ms !== movementFilter) return false;
      }
      return true;
    });
  }, [items, q, typeFilter, movementFilter]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Kupa Teknikleri</h2>
        <Link href="/kupa/teknikler/yeni" className={kupaBtnPrimary}>
          + Yeni Teknik
        </Link>
      </div>

      <input
        className={kupaInput}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Teknik ara…"
        aria-label="Teknik ara"
      />

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="tech-type-filter">Tür filtresi</label>
        <select
          id="tech-type-filter"
          className={`${kupaInput} w-auto flex-1`}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Tür filtresi"
        >
          {TYPE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="tech-move-filter">Uygulama biçimi filtresi</label>
        <select
          id="tech-move-filter"
          className={`${kupaInput} w-auto flex-1`}
          value={movementFilter}
          onChange={(e) => setMovementFilter(e.target.value)}
          aria-label="Uygulama biçimi filtresi"
        >
          {MOVEMENT_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>
        ) : items === null ? (
          <p className="p-3 text-[13px] text-slate-400">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-center">
            <p className="text-[13px] text-slate-500">Henüz teknik yok.</p>
            <Link href="/kupa/teknikler/yeni" className="mt-2 inline-block text-sm font-semibold text-amber-700">
              İlk tekniği oluştur →
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-[13px] text-slate-400">Aramanızla eşleşen teknik yok.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {filtered.map((t) => {
              const active = t.id === selectedId;
              return (
                <li key={t.id}>
                  <Link
                    href={`/kupa/teknikler/${t.id}`}
                    aria-current={active ? "true" : undefined}
                    className={`block rounded-xl border px-3 py-2.5 no-underline outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400/60 ${
                      active
                        ? "border-amber-300 bg-amber-50/80 shadow-sm"
                        : "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"
                    }`}
                  >
                    <span className="block truncate text-[15px] font-bold text-slate-900">{t.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-amber-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        {techniqueTypeLabel(t.technique_type)}
                      </span>
                      {hasMovement(t.movement_style) ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {movementStyleLabel(t.movement_style)}
                        </span>
                      ) : null}
                      {t.is_active === false ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400">Pasif</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
