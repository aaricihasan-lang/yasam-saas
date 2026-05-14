"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buildPlainAnalizFull } from "../../utils/numerolojiPlainMetin";
import { extractMotorFromAnalysisJson } from "../../utils/analysisJson";
import { getNumerologyAnalysisById, getTenantIdFromStorage, type NumerologyAnalysisRow } from "../../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../../utils/numerolojiPlainMetin";

export default function NumerolojiKayitDetayPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [row, setRow] = useState<NumerologyAnalysisRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError("Geçersiz kayıt.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function run() {
      const tid = getTenantIdFromStorage();
      if (!tid) {
        if (!cancelled) {
          setError("Giriş gerekli.");
          setLoading(false);
        }
        return;
      }
      const { data, error: e } = await getNumerologyAnalysisById(id, tid);
      if (cancelled) return;
      if (e || !data) {
        setError(e || "Kayıt bulunamadı.");
        setRow(null);
      } else {
        setError(null);
        setRow(data);
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const motor: NumerolojiMotorOut | null = row ? extractMotorFromAnalysisJson(row.analysis_json) : null;

  const plainText = motor ? buildPlainAnalizFull(motor) : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-amber-50/30 to-sky-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap gap-2 text-[11px] font-bold text-violet-700">
          <Link href="/numeroloji/liste" className="rounded-full border border-violet-200 bg-white px-3 py-1 no-underline transition hover:bg-violet-50">
            ← Listeye dön
          </Link>
          <Link href="/numeroloji/analiz" className="rounded-full border border-violet-200 bg-white px-3 py-1 no-underline transition hover:bg-violet-50">
            Yeni analiz
          </Link>
        </div>

        {loading ? <p className="text-sm text-slate-600">Yükleniyor…</p> : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
            {error}
          </div>
        ) : null}

        {row && !error ? (
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-md ring-1 ring-violet-100/50 sm:p-6">
            <h1 className="text-xl font-black text-slate-900">{row.full_name}</h1>
            <p className="mt-1 text-sm text-slate-600">Doğum tarihi: {row.birth_date}</p>
            <p className="mt-1 text-xs text-slate-500">
              Kayıt:{" "}
              {new Date(row.created_at).toLocaleString("tr-TR", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>

            {motor ? (
              <pre className="mt-6 max-h-[min(70vh,40rem)] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-4 font-mono text-[11px] leading-relaxed text-slate-800 sm:text-xs">
                {plainText}
              </pre>
            ) : (
              <p className="mt-6 text-sm text-slate-600">Kayıtlı analiz verisi okunamadı veya eski formatta.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
