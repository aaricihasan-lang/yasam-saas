"use client";

import { useEffect, useMemo, useState } from "react";
import { getTenantIdFromStorage, listNumerologyAnalyses } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti, type NumerolojiListeSatir } from "../components/NumerolojiListeKarti";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { NumerolojiNavPill } from "../components/NumerolojiNavPill";

export default function NumerolojiListePage() {
  const [rows, setRows] = useState<NumerolojiListeSatir[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const tid = getTenantIdFromStorage();
      if (!tid) {
        if (!cancelled) {
          setError("Kayıtları görmek için giriş yapmalısınız.");
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const { data, error: e } = await listNumerologyAnalyses(tid);
      if (cancelled) return;
      if (e) {
        setError(e);
        setRows(null);
      } else {
        setError(null);
        setRows(data ?? []);
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) => {
      const adSoyad = `${r.name} ${r.surname}`.toLocaleLowerCase("tr-TR");
      return adSoyad.includes(q);
    });
  }, [rows, search]);

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-3xl">
      <div className="mb-6 rounded-[26px] border border-white/75 bg-white/55 px-5 py-6 shadow-[0_14px_42px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:px-7">
        <div className="mb-4 flex flex-wrap gap-2">
          <NumerolojiNavPill href="/numeroloji">← Modül seçimi</NumerolojiNavPill>
          <NumerolojiNavPill href="/numeroloji/analiz">Yeni analiz</NumerolojiNavPill>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Kayıtlı analizler</h1>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">Tenant&apos;ınıza ait kayıtlı numeroloji analizleri.</p>
      </div>

      {!loading && rows && rows.length > 0 ? (
        <div className="mb-5">
          <label htmlFor="noj-liste-ara" className="mb-1.5 block text-xs font-bold text-slate-700">
            Ad veya soyad ile ara
          </label>
          <input
            id="noj-liste-ara"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Örn. Ahmet, Ayşe, Yılmaz…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-violet-100 focus:ring-2"
            autoComplete="off"
          />
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/70 bg-white/50 px-4 py-5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-md">
          Yükleniyor…
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-[22px] border border-amber-200/80 bg-amber-50/85 px-5 py-4 text-sm font-medium text-amber-950 shadow-sm ring-1 ring-amber-100/50 backdrop-blur-sm"
          role="alert"
        >
          {error}
          <p className="mt-3 text-xs leading-relaxed text-amber-900/85">
            Erişim reddedildiyse Supabase RLS politikalarında <code className="rounded-md bg-white/90 px-1.5 py-0.5 font-mono text-[11px]">tenant_id</code> eşleşmesini
            kontrol edin.
          </p>
        </div>
      ) : null}

      {!loading && rows && rows.length === 0 && !error ? (
        <div className="rounded-[22px] border border-white/80 bg-white/60 px-6 py-10 text-center text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-100/60 backdrop-blur-md">
          Henüz kayıtlı analiz yok.
        </div>
      ) : null}

      {!loading && rows && rows.length > 0 && filteredRows.length === 0 && !error ? (
        <div className="rounded-[22px] border border-white/80 bg-white/60 px-6 py-8 text-center text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-100/60 backdrop-blur-md">
          Aramanızla eşleşen kayıt bulunamadı.
        </div>
      ) : null}

      {!loading && filteredRows.length > 0 ? (
        <ul className="space-y-4">
          {filteredRows.map((r) => (
            <NumerolojiListeKarti key={r.id} row={r} />
          ))}
        </ul>
      ) : null}
    </NumerolojiPremiumShell>
  );
}
