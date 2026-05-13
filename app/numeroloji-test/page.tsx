"use client";

import { useState } from "react";
import { hesaplaNumeroloji, type NumerolojiInput } from "@/lib/numeroloji";
import type { NumerolojiResult } from "@/lib/numeroloji";

function splitFullName(fullName: string): Pick<NumerolojiInput, "firstName" | "lastName"> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function ResultBlock({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-white via-violet-50/40 to-sky-50/50 p-4 shadow-md shadow-violet-200/30 ring-1 ring-white/80">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-violet-800/90">{title}</h3>
      <p className="mt-2 break-words text-lg font-black tabular-nums text-slate-900">{value || "—"}</p>
      {hint ? (
        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}

function ResultFromNumeroloji({ title, r }: { title: string; r: NumerolojiResult }) {
  const hint = r.steps?.length ? r.steps.join("\n") : undefined;
  return <ResultBlock title={title} value={r.display || "—"} hint={hint} />;
}

export default function NumerolojiTestPage() {
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<ReturnType<typeof hesaplaNumeroloji> | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOut(null);

    const { firstName, lastName } = splitFullName(fullName);
    if (!firstName.trim()) {
      setError("Lütfen ad soyad girin.");
      return;
    }
    if (!birthDate.trim()) {
      setError("Lütfen doğum tarihini girin (ör. 15.03.1990).");
      return;
    }

    try {
      setOut(
        hesaplaNumeroloji({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate: birthDate.trim(),
        }),
      );
    } catch (err) {
      console.error(err);
      setError("Hesaplama sırasında bir hata oluştu.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-fuchsia-50/40 to-sky-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-700/80">Test</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Numeroloji motoru
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-600">
            Pastel önizleme — veriler yalnızca tarayıcıda işlenir; kayıt veya sunucu yoktur.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-3xl border border-white/90 bg-white/85 p-5 shadow-xl shadow-violet-200/40 ring-1 ring-violet-100/60 backdrop-blur-sm sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="nm-adsoyad" className="mb-1.5 block text-xs font-bold text-slate-700">
                Ad Soyad
              </label>
              <input
                id="nm-adsoyad"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn. Ayşe Yılmaz"
                className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-inner outline-none ring-1 ring-violet-100/50 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200/80"
                autoComplete="name"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nm-dt" className="mb-1.5 block text-xs font-bold text-slate-700">
                Doğum tarihi
              </label>
              <input
                id="nm-dt"
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="GG.AA.YYYY"
                className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-inner outline-none ring-1 ring-sky-100/50 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200/80"
                autoComplete="bday"
              />
            </div>
          </div>
          <button
            type="submit"
            className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-sky-600 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-violet-400/35 transition hover:brightness-105 active:scale-[0.99] sm:w-auto sm:px-10"
          >
            Hesapla
          </button>
        </form>

        {error ? (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-rose-200/90 bg-rose-50/95 px-4 py-3 text-center text-sm font-semibold text-rose-900 shadow-sm"
          >
            {error}
          </div>
        ) : null}

        {out ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ResultFromNumeroloji title="Ana Kulvar" r={out.anaKulvar} />
            <ResultFromNumeroloji title="Yan Kulvar" r={out.yanKulvar} />
            <ResultFromNumeroloji title="İfade Sayısı" r={out.ifadeSayisi} />
            <ResultFromNumeroloji title="Hayat Yolu" r={out.hayatYolu} />
            <ResultBlock title="PIN Kodu" value={out.pinKoduMetni} />
            <ResultBlock title="Çakra Omurgası" value={out.cakraOmurgasiMetni} />
            <ResultBlock title="Elementler" value={out.elementlerMetni} />
            <ResultBlock title="Değişim Dönüşüm" value={out.degisimDonusumMetni} />
            <ResultBlock title="Zirve Yılları" value={out.zirveYillariMetni} />
            <ResultBlock title="Mücadele Yılları" value={out.mucadeleYillariMetni} />
            <div className="sm:col-span-2">
              <ResultBlock
                title="Harflerin Yankılanışı"
                value={out.harflerinYankilanisi.display || "—"}
                hint={
                  [
                    out.harflerinYankilanisi.steps?.length
                      ? out.harflerinYankilanisi.steps.join("\n")
                      : "",
                    out.harflerinYankilanisiMetni?.trim() ? out.harflerinYankilanisiMetni : "",
                  ]
                    .filter(Boolean)
                    .join("\n\n") || undefined
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
