"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTenantIdFromStorage, listNumerologyAnalyses } from "../helpers/numerolojiKayit";
import { NumerolojiListeKarti } from "../components/NumerolojiListeKarti";

type Row = {
  id: string;
  full_name: string;
  birth_date: string;
  created_at: string;
};

export default function NumerolojiListePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-amber-50/30 to-sky-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-bold text-violet-700">
              <Link href="/numeroloji" className="rounded-full border border-violet-200 bg-white px-3 py-1 no-underline transition hover:bg-violet-50">
                ← Modül seçimi
              </Link>
              <Link href="/numeroloji/analiz" className="rounded-full border border-violet-200 bg-white px-3 py-1 no-underline transition hover:bg-violet-50">
                Yeni analiz
              </Link>
            </div>
            <h1 className="text-2xl font-black text-slate-900">Kayıtlı analizler</h1>
            <p className="mt-1 text-sm text-slate-600">Tenant&apos;ınıza ait kayıtlı numeroloji analizleri.</p>
          </div>
        </div>

        {loading ? <p className="text-sm text-slate-600">Yükleniyor…</p> : null}

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
            {error}
            <p className="mt-2 text-xs text-amber-900/80">
              Erişim reddedildiyse Supabase RLS politikalarında <code className="rounded bg-white/80 px-1">tenant_id</code> eşleşmesini
              kontrol edin.
            </p>
          </div>
        ) : null}

        {!loading && rows && rows.length === 0 && !error ? (
          <p className="rounded-xl border border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-600">Henüz kayıtlı analiz yok.</p>
        ) : null}

        {!loading && rows && rows.length > 0 ? (
          <ul className="space-y-3">
            {rows.map((r) => (
              <NumerolojiListeKarti key={r.id} row={r} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
