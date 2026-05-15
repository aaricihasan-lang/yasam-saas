"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { extractMotorFromAnalysisJson } from "../../utils/analysisJson";
import { getNumerologyAnalysisById, getTenantIdFromStorage, type NumerologyRecordRow } from "../../helpers/numerolojiKayit";
import { NumerolojiKayitDetayPanel } from "../../components/NumerolojiKayitDetayPanel";
import { NumerolojiPremiumShell } from "../../components/NumerolojiPremiumShell";
import { NumerolojiNavPill } from "../../components/NumerolojiNavPill";

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
    <NumerolojiPremiumShell maxWidthClass="max-w-6xl">
      <div className="mb-5 flex flex-wrap gap-2 sm:mb-6">
        <NumerolojiNavPill href="/numeroloji/liste">← Listeye dön</NumerolojiNavPill>
        <NumerolojiNavPill href="/numeroloji/analiz">Yeni analiz</NumerolojiNavPill>
        <NumerolojiNavPill href="/numeroloji">Modül seçimi</NumerolojiNavPill>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/70 bg-white/50 px-4 py-5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-md">
          Yükleniyor…
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-[22px] border border-rose-200/85 bg-rose-50/90 px-5 py-4 text-sm font-medium text-rose-900 shadow-sm ring-1 ring-rose-100/50 backdrop-blur-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {row && !error ? (
        <div className="space-y-5 sm:space-y-6">
          <header className="rounded-[26px] border border-white/75 bg-white/65 px-5 py-5 shadow-[0_14px_42px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:px-7 sm:py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">Kayıtlı numeroloji analizi</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{adSoyad}</h1>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm font-medium text-slate-600">
              <span>Doğum tarihi: {row.birth_date}</span>
              <span className="text-xs text-slate-500 sm:text-sm">
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
            <p className="rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 text-sm font-medium text-slate-600">
              Kayıtlı analiz verisi okunamadı veya eski formatta.
            </p>
          )}
        </div>
      ) : null}
    </NumerolojiPremiumShell>
  );
}
