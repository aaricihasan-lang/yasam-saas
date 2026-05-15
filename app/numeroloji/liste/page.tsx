"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getTenantIdFromStorage, listNumerologyAnalyses } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { NumerolojiNavPill } from "../components/NumerolojiNavPill";

export default function NumerolojiListePage() {
  const pathname = usePathname();
  const [rows, setRows] = useState<NumerolojiListeSatir[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    const tenantId = getTenantIdFromStorage();
    const { data, error: e } = await listNumerologyAnalyses(tenantId);
    if (e) {
      setError(`Kayıtlar yüklenemedi: ${e}`);
      setRows([]);
    } else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void loadRows();
    });
  }, [loadRows, pathname]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) => {
      const adSoyad = `${r.name} ${r.surname}`.toLocaleLowerCase("tr-TR");
      return adSoyad.includes(q);
    });
  }, [rows, search]);

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-7xl">
      <div className="mb-8 rounded-[32px] border border-white/75 bg-white/55 px-7 py-9 shadow-[0_18px_52px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 lg:py-12">
        <div className="mb-5 flex flex-wrap gap-3 sm:mb-6">
          <NumerolojiNavPill href="/numeroloji">← Modül seçimi</NumerolojiNavPill>
          <NumerolojiNavPill href="/numeroloji/analiz">Yeni analiz</NumerolojiNavPill>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
          Kayıtlı analizler
        </h1>
        <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-slate-600 sm:mt-4 sm:text-lg">
          Tenant&apos;ınıza ait kayıtlı numeroloji analizleri.
        </p>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="mb-7 sm:mb-8">
          <label htmlFor="noj-liste-ara" className="mb-2.5 block text-sm font-bold text-slate-700 sm:text-base">
            Ad veya soyad ile ara
          </label>
          <input
            id="noj-liste-ara"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Örn. Ahmet, Ayşe, Yılmaz…"
            className="w-full rounded-2xl border border-violet-200/80 bg-white/95 px-5 py-4 text-base font-medium text-slate-900 shadow-[0_8px_28px_-12px_rgba(91,33,182,0.2)] outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40 sm:px-6 sm:py-4.5 sm:text-lg"
            autoComplete="off"
          />
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[26px] border border-white/70 bg-white/50 px-6 py-8 text-base font-medium text-slate-600 shadow-sm backdrop-blur-md sm:px-8 sm:py-10 sm:text-lg">
          Yükleniyor…
        </div>
      ) : null}

      {!loading && error ? (
        <p className="text-sm font-medium text-rose-700 sm:text-base" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-[28px] border border-white/80 bg-white/60 px-8 py-14 text-center text-base font-medium text-slate-600 shadow-sm ring-1 ring-slate-100/60 backdrop-blur-md sm:py-16 sm:text-lg">
          Henüz kayıtlı analiz yok.
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 && filteredRows.length === 0 ? (
        <div className="rounded-[28px] border border-white/80 bg-white/60 px-8 py-12 text-center text-base font-medium text-slate-600 shadow-sm ring-1 ring-slate-100/60 backdrop-blur-md sm:py-14 sm:text-lg">
          Aramanızla eşleşen kayıt bulunamadı.
        </div>
      ) : null}

      {!loading && !error && filteredRows.length > 0 ? (
        <ul className="space-y-5 sm:space-y-6">
          {filteredRows.map((r) => (
            <NumerolojiListeKarti key={r.id} row={r} />
          ))}
        </ul>
      ) : null}
    </NumerolojiPremiumShell>
  );
}
