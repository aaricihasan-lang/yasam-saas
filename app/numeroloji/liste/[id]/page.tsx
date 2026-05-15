"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { extractMotorFromAnalysisJson } from "../../utils/analysisJson";
import { getNumerologyAnalysisById, getTenantIdFromStorage, type NumerologyRecordRow } from "../../helpers/numerolojiKayit";
import { NumerolojiKayitDetayPanel } from "../../components/NumerolojiKayitDetayPanel";
import { NumerolojiPremiumShell } from "../../components/NumerolojiPremiumShell";

const detayNavLinkClass =
  "inline-flex items-center gap-2 rounded-2xl border border-white/85 bg-white/80 px-6 py-3 text-sm font-bold text-violet-900 shadow-[0_8px_26px_-8px_rgba(91,33,182,0.38)] ring-1 ring-violet-200/55 backdrop-blur-md transition hover:scale-[1.03] hover:border-violet-300/90 hover:bg-white hover:text-violet-950 hover:shadow-[0_14px_36px_-8px_rgba(91,33,182,0.45)] no-underline";

export default function NumerolojiKayitDetayPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [row, setRow] = useState<NumerologyRecordRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      runInEffect(() => {
        setError("Geçersiz kayıt.");
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    async function run() {
      const tid = getTenantIdFromStorage();
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

  const motor = row ? extractMotorFromAnalysisJson(row.analysis_data) : null;
  const adSoyad = row ? `${row.name} ${row.surname}`.replace(/\s+/g, " ").trim() : "";

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-7xl">
      <div className="mb-6 flex flex-wrap gap-3 sm:mb-8">
        <Link href="/numeroloji/liste" className={detayNavLinkClass}>
          ← Listeye dön
        </Link>
        <Link href="/numeroloji/analiz" className={detayNavLinkClass}>
          <span aria-hidden>✨</span> Yeni analiz
        </Link>
        <Link href="/numeroloji" className={detayNavLinkClass}>
          Modül seçimi
        </Link>
      </div>

      {loading ? (
        <div className="rounded-[26px] border border-white/70 bg-white/50 px-6 py-8 text-base font-medium text-slate-600 shadow-sm backdrop-blur-md sm:px-8 sm:py-10 sm:text-lg">
          Yükleniyor…
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-[28px] border border-rose-200/85 bg-rose-50/90 px-6 py-5 text-base font-medium text-rose-900 shadow-sm ring-1 ring-rose-100/50 backdrop-blur-sm sm:px-8 sm:py-6 sm:text-lg"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {row && !error ? (
        <div className="space-y-6 sm:space-y-8">
          <header className="rounded-[32px] border border-white/75 bg-white/65 px-7 py-8 shadow-[0_18px_52px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:px-10 sm:py-10 lg:px-12 lg:py-11">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700/90 sm:text-sm sm:tracking-[0.32em]">
              Kayıtlı numeroloji analizi
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
              {adSoyad}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-base font-medium text-slate-600 sm:mt-5 sm:text-lg">
              <span>Doğum tarihi: {row.birth_date}</span>
              <span className="text-slate-500">
                Oluşturulma:{" "}
                {new Date(row.created_at).toLocaleString("tr-TR", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </span>
            </div>
          </header>

          {motor ? (
            <NumerolojiKayitDetayPanel
              out={motor}
              name={row.name}
              surname={row.surname}
              birthDate={row.birth_date}
              analysisData={row.analysis_data}
            />
          ) : (
            <p className="rounded-[26px] border border-slate-200/80 bg-white/70 px-6 py-5 text-base font-medium text-slate-600 sm:px-8 sm:py-6 sm:text-lg">
              Kayıtlı analiz verisi okunamadı veya eski formatta.
            </p>
          )}
        </div>
      ) : null}
    </NumerolojiPremiumShell>
  );
}
