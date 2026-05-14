"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buildPlainAnalizFull } from "../../utils/numerolojiPlainMetin";
import { extractMotorFromAnalysisJson } from "../../utils/analysisJson";
import { getNumerologyAnalysisById, getTenantIdFromStorage, type NumerologyAnalysisRow } from "../../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../../utils/numerolojiPlainMetin";
import { NumerolojiPremiumShell } from "../../components/NumerolojiPremiumShell";
import { NumerolojiNavPill } from "../../components/NumerolojiNavPill";

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
    <NumerolojiPremiumShell maxWidthClass="max-w-4xl">
      <div className="mb-6 flex flex-wrap gap-2">
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
        <div className="rounded-[22px] border border-rose-200/85 bg-rose-50/90 px-5 py-4 text-sm font-medium text-rose-900 shadow-sm ring-1 ring-rose-100/50 backdrop-blur-sm" role="alert">
          {error}
        </div>
      ) : null}

      {row && !error ? (
        <div className="rounded-[26px] border border-white/75 bg-white/60 p-6 shadow-[0_14px_42px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:p-8">
          <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{row.full_name}</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">Doğum tarihi: {row.birth_date}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Kayıt:{" "}
            {new Date(row.created_at).toLocaleString("tr-TR", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </p>

          {motor ? (
            <pre className="mt-8 max-h-[min(70vh,40rem)] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200/70 bg-white/70 p-5 font-mono text-[11px] leading-relaxed text-slate-800 shadow-inner ring-1 ring-slate-100/50 sm:text-xs">
              {plainText}
            </pre>
          ) : (
            <p className="mt-8 text-sm font-medium text-slate-600">Kayıtlı analiz verisi okunamadı veya eski formatta.</p>
          )}
        </div>
      ) : null}
    </NumerolojiPremiumShell>
  );
}
