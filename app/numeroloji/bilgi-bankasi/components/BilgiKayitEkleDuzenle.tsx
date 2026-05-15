"use client";

import { useState } from "react";

const fieldBase =
  "w-full rounded-2xl border-2 border-violet-200/90 bg-white px-5 font-medium text-slate-900 shadow-sm outline-none ring-2 ring-violet-100/50 transition focus:border-violet-400 focus:ring-4 focus:ring-violet-200/45";

const selectClass = `h-14 ${fieldBase} text-base`;

const inputClass = `h-14 ${fieldBase} text-base placeholder:text-slate-400`;

const textareaClass = `${fieldBase} min-h-[220px] resize-y py-4 text-base leading-relaxed placeholder:text-slate-400 sm:min-h-[260px]`;

const labelClass = "mb-2.5 block text-base font-bold text-slate-800 sm:text-lg";

const ANALIZ_TURU_OPTIONS = [
  { value: "", label: "Seçiniz..." },
  { value: "ana-kulvar", label: "Ana Kulvar" },
  { value: "yan-kulvar", label: "Yan Kulvar" },
  { value: "ifade-sayisi", label: "İfade Sayısı" },
  { value: "hayat-yolu", label: "Hayat Yolu" },
  { value: "cakra-omurga", label: "Çakra Omurga" },
  { value: "element", label: "Element" },
  { value: "diger", label: "Diğer" },
] as const;

const CAKRA_OMURGA_DEGER_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const durum = n % 2 === 1 ? "AZ" : "FAZLA";
  return `${n}. Çakra | ${durum}`;
});

const ELEMENT_DEGER_OPTIONS = (["Ateş", "Su", "Toprak", "Hava"] as const).flatMap((el) => [
  `${el} | AZ`,
  `${el} | FAZLA`,
]);

type AnalizTuruValue = (typeof ANALIZ_TURU_OPTIONS)[number]["value"];

function isCakraOmurga(tur: string): tur is "cakra-omurga" {
  return tur === "cakra-omurga";
}

function isElement(tur: string): tur is "element" {
  return tur === "element";
}

export function BilgiKayitEkleDuzenle() {
  const [analizTuru, setAnalizTuru] = useState<AnalizTuruValue>("");
  const [deger, setDeger] = useState("");
  const [bilgiKaynagi, setBilgiKaynagi] = useState("");
  const [aciklamaMetni, setAciklamaMetni] = useState("");

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
  }

  function handleYeni() {
    setAnalizTuru("");
    setDeger("");
    setBilgiKaynagi("");
    setAciklamaMetni("");
  }

  return (
    <div className="rounded-[28px] border-2 border-violet-200/75 bg-white/95 p-7 shadow-[0_16px_48px_-14px_rgba(91,33,182,0.22)] ring-2 ring-violet-100/55 backdrop-blur-md sm:p-9 lg:p-10">
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8 xl:gap-10">
        <div>
          <label htmlFor="bilgi-analiz-turu" className={labelClass}>
            Analiz Türü
          </label>
          <select
            id="bilgi-analiz-turu"
            value={analizTuru}
            onChange={(e) => handleAnalizTuruChange(e.target.value)}
            className={selectClass}
          >
            {ANALIZ_TURU_OPTIONS.map((opt) => (
              <option key={opt.value || "seciniz"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bilgi-deger" className={labelClass}>
            Değer
          </label>
          {isCakraOmurga(analizTuru) ? (
            <select
              id="bilgi-deger"
              value={deger}
              onChange={(e) => setDeger(e.target.value)}
              className={selectClass}
            >
              <option value="">Seçiniz...</option>
              {CAKRA_OMURGA_DEGER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : isElement(analizTuru) ? (
            <select
              id="bilgi-deger"
              value={deger}
              onChange={(e) => setDeger(e.target.value)}
              className={selectClass}
            >
              <option value="">Seçiniz...</option>
              {ELEMENT_DEGER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="bilgi-deger"
              type="text"
              value={deger}
              onChange={(e) => setDeger(e.target.value)}
              placeholder="Örn. 19, 11, 33/6, 22…"
              className={inputClass}
            />
          )}
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="bilgi-kaynak" className={labelClass}>
            Bilgi Kaynağı
          </label>
          <input
            id="bilgi-kaynak"
            type="text"
            value={bilgiKaynagi}
            onChange={(e) => setBilgiKaynagi(e.target.value)}
            placeholder="Örn. Eğitim notu, kitap, uzman yorumu…"
            className={inputClass}
          />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="bilgi-aciklama" className={labelClass}>
            Açıklama Metni
          </label>
          <textarea
            id="bilgi-aciklama"
            value={aciklamaMetni}
            onChange={(e) => setAciklamaMetni(e.target.value)}
            rows={10}
            placeholder="Numeroloji açıklama ve yorum metnini buraya yazın…"
            className={textareaClass}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 border-t-2 border-violet-100/90 pt-8 sm:mt-10">
        <button
          type="button"
          onClick={handleYeni}
          className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-violet-200/90 bg-white px-8 py-3 text-base font-black uppercase tracking-wide text-violet-900 shadow-md ring-2 ring-violet-100/50 transition hover:border-violet-300 hover:bg-violet-50/80"
        >
          Yeni
        </button>
        <button
          type="button"
          className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-10 py-3 text-base font-black uppercase tracking-wide text-white shadow-[0_12px_32px_-8px_rgba(91,33,182,0.45)] ring-2 ring-violet-300/40 transition hover:brightness-105"
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}
