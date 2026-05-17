"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getTenantIdFromStorage, listNumerologyAnalyses } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";

const listeNavSecondaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-7 py-4 text-base font-black text-violet-900 shadow-md no-underline transition-all duration-300 hover:-translate-y-1 hover:bg-violet-50";

const listeNavPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 px-7 py-4 text-base font-black text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)] no-underline transition-all duration-300 hover:-translate-y-1";

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
    <div className="relative min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f3ff_38%,#ecfeff_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-fuchsia-300/20 blur-[150px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-amber-300/20 blur-[150px]"
        aria-hidden
      />
      <div className="relative z-10 w-full px-6 py-6 xl:px-10 2xl:px-14">
        <div className="rounded-[34px] border-[3px] border-violet-300/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <Link href="/numeroloji" className={listeNavSecondaryClass}>
              ← Modül seçimi
            </Link>
            <Link href="/numeroloji/analiz" className={listeNavPrimaryClass}>
              <span aria-hidden>✨</span> Yeni analiz
            </Link>
          </div>
          <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">
            Kayıtlı analizler
          </h1>
          <p className="mt-3 text-lg font-medium text-slate-600 xl:text-xl">
            Kaydedilen analizlerinizi görüntüleyin, geçmiş hesaplamaları inceleyin ve tüm numeroloji kayıtlarını tek
            merkezden yönetin.
          </p>
        </div>

        {!loading && rows.length > 0 ? (
          <div className="mb-7 mt-8 sm:mb-8">
            <label htmlFor="noj-liste-ara" className="mb-3 block text-lg font-black text-slate-800">
              Ad veya soyad ile ara
            </label>
            <input
              id="noj-liste-ara"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Örn. Ahmet, Ayşe, Yılmaz…"
              className="h-16 w-full rounded-2xl border-2 border-violet-200 bg-white/90 px-6 text-lg font-semibold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-300/30"
              autoComplete="off"
            />
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-[30px] border-[3px] border-violet-300/45 bg-white/80 px-8 py-10 text-lg font-semibold text-slate-600 shadow-[0_0_40px_rgba(139,92,246,0.14)] backdrop-blur-xl">
            Yükleniyor…
          </div>
        ) : null}

        {!loading && error ? (
          <p className="mt-8 text-base font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="mt-8 rounded-[30px] border-[3px] border-violet-300/45 bg-white/80 px-8 py-14 text-center text-lg font-semibold text-slate-600 shadow-[0_0_40px_rgba(139,92,246,0.14)] backdrop-blur-xl">
            Henüz kayıtlı analiz yok.
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 && filteredRows.length === 0 ? (
          <div className="mt-8 rounded-[30px] border-[3px] border-violet-300/45 bg-white/80 px-8 py-12 text-center text-lg font-semibold text-slate-600 shadow-[0_0_40px_rgba(139,92,246,0.14)] backdrop-blur-xl">
            Aramanızla eşleşen kayıt bulunamadı.
          </div>
        ) : null}

        {!loading && !error && filteredRows.length > 0 ? (
          <ul className="mt-8 w-full space-y-6">
            {filteredRows.map((r) => (
              <NumerolojiListeKarti key={r.id} row={r} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
