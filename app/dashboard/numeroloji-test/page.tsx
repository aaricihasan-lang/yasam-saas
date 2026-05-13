"use client";

import { useState } from "react";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export default function NumerolojiTestPage() {
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [anaKulvar, setAnaKulvar] = useState<string | null>(null);
  const [yanKulvar, setYanKulvar] = useState<string | null>(null);
  const [ifadeSayisi, setIfadeSayisi] = useState<string | null>(null);
  const [hayatYolu, setHayatYolu] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAnaKulvar(null);
    setYanKulvar(null);
    setIfadeSayisi(null);
    setHayatYolu(null);

    const { firstName, lastName } = splitFullName(fullName);
    if (!firstName.trim()) {
      setError("Ad soyad alanını doldurun.");
      return;
    }
    if (!birthDate.trim()) {
      setError("Doğum tarihini girin (ör. 15.03.1990).");
      return;
    }

    try {
      const out = hesaplaNumeroloji({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate: birthDate.trim(),
      });
      setAnaKulvar(out.anaKulvar.display || "—");
      setYanKulvar(out.yanKulvar.display || "—");
      setIfadeSayisi(out.ifadeSayisi.display || "—");
      setHayatYolu(out.hayatYolu.display || "—");
    } catch (err) {
      console.error(err);
      setError("Hesaplama sırasında hata oluştu.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-1 text-xl font-semibold">Numeroloji motor testi</h1>
        <p className="mb-6 text-sm text-slate-600">
          <code className="rounded bg-slate-200 px-1">lib/numeroloji/numerolojiMotor.ts</code> — sadece dört çıktı.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-4 rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
        >
          <div>
            <label htmlFor="numeroloji-adsoyad" className="mb-1 block text-sm font-medium">
              Ad Soyad
            </label>
            <input
              id="numeroloji-adsoyad"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Örn. Ayşe Yılmaz"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="numeroloji-dt" className="mb-1 block text-sm font-medium">
              Doğum tarihi
            </label>
            <input
              id="numeroloji-dt"
              type="text"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              placeholder="GG.AA.YYYY"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              autoComplete="bday"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Hesapla
          </button>
        </form>

        {error ? (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        {(anaKulvar !== null ||
          yanKulvar !== null ||
          ifadeSayisi !== null ||
          hayatYolu !== null) && (
          <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-4 text-sm shadow-sm">
            <div>
              <span className="font-medium text-slate-700">Ana Kulvar:</span>{" "}
              <span className="tabular-nums">{anaKulvar}</span>
            </div>
            <div>
              <span className="font-medium text-slate-700">Yan Kulvar:</span>{" "}
              <span className="tabular-nums">{yanKulvar}</span>
            </div>
            <div>
              <span className="font-medium text-slate-700">İfade Sayısı:</span>{" "}
              <span className="tabular-nums">{ifadeSayisi}</span>
            </div>
            <div>
              <span className="font-medium text-slate-700">Hayat Yolu:</span>{" "}
              <span className="tabular-nums">{hayatYolu}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
