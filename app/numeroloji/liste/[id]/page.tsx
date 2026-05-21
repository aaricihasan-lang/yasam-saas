"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { extractMotorFromAnalysisJson } from "../../utils/analysisJson";
import {
  getNumerologyAnalysisById,
  resolveNumerolojiTenantId,
  type NumerologyRecordRow,
} from "../../helpers/numerolojiKayit";
import { NumerolojiKayitDetayPanel } from "../../components/NumerolojiKayitDetayPanel";

const detayNavSecondaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-white px-7 py-4 text-base font-black text-violet-900 shadow-md no-underline transition-all duration-300 hover:-translate-y-1 hover:bg-violet-50";

const detayNavPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 px-7 py-4 text-base font-black text-white shadow-[0_10px_30px_rgba(139,92,246,0.25)] no-underline transition-all duration-300 hover:-translate-y-1";

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
      const tid = await resolveNumerolojiTenantId();
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
        <div className="mb-8 flex flex-wrap gap-4">
          <Link href="/numeroloji/liste" className={detayNavSecondaryClass}>
            ← Listeye dön
          </Link>
          <Link href="/numeroloji/analiz" className={detayNavPrimaryClass}>
            <span aria-hidden>✨</span> Yeni analiz
          </Link>
          <Link href="/numeroloji" className={detayNavSecondaryClass}>
            Modül seçimi
          </Link>
        </div>

        {loading ? (
          <div className="rounded-[30px] border-[3px] border-violet-300/45 bg-white/80 px-8 py-10 text-lg font-semibold text-slate-600 shadow-[0_0_40px_rgba(139,92,246,0.14)] backdrop-blur-xl">
            Yükleniyor…
          </div>
        ) : null}

        {error ? (
          <div
            className="rounded-[30px] border-[3px] border-rose-300/50 bg-rose-50/90 px-8 py-6 text-lg font-semibold text-rose-900 shadow-[0_0_40px_rgba(244,63,94,0.12)] backdrop-blur-xl"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {row && !error ? (
          <div className="w-full space-y-8">
            <header className="rounded-[34px] border-[3px] border-violet-300/45 bg-white/78 p-8 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl">
              <p className="inline-block rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.22em] text-violet-700">
                Kayıtlı numeroloji analizi
              </p>
              <h1 className="mt-4 text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">{adSoyad}</h1>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-lg font-semibold text-slate-600">
                <span>Doğum tarihi: {row.birth_date}</span>
                <span>
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
                recordId={row.id}
                onAnalysisDataUpdate={(analysis_data) => setRow((prev) => (prev ? { ...prev, analysis_data } : prev))}
              />
            ) : (
              <p className="rounded-[30px] border-[3px] border-violet-300/40 bg-white/80 px-8 py-6 text-lg font-semibold text-slate-600 shadow-[0_0_40px_rgba(139,92,246,0.13)] backdrop-blur-xl">
                Kayıtlı analiz verisi okunamadı veya eski formatta.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
