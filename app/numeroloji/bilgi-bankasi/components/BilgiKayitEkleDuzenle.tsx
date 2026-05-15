"use client";

import { useState } from "react";

const selectClass =
  "h-12 w-full rounded-2xl border border-violet-200/80 bg-white px-4 font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

const inputClass =
  "h-12 w-full rounded-2xl border border-violet-200/80 bg-white px-4 font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

const textareaClass =
  "w-full resize-y rounded-2xl border border-violet-200/80 bg-white px-4 py-3 text-base font-medium leading-relaxed text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

const labelClass = "mb-2 block text-sm font-bold text-slate-700";

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
    <div className="rounded-[28px] border border-white/80 bg-white/75 p-6 shadow-[0_12px_40px_-12px_rgba(91,33,182,0.15)] ring-1 ring-violet-100/50 backdrop-blur-md sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <div className="sm:col-span-2 lg:col-span-1">
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

        <div className="sm:col-span-2">
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

        <div className="sm:col-span-2">
          <label htmlFor="bilgi-aciklama" className={labelClass}>
            Açıklama Metni
          </label>
          <textarea
            id="bilgi-aciklama"
            value={aciklamaMetni}
            onChange={(e) => setAciklamaMetni(e.target.value)}
            rows={6}
            placeholder="Numeroloji açıklama ve yorum metnini buraya yazın…"
            className={textareaClass}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 border-t border-violet-100/80 pt-6 sm:mt-8">
        <button
          type="button"
          onClick={handleYeni}
          className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-violet-200/90 bg-white px-6 py-2.5 text-sm font-black uppercase tracking-wide text-violet-900 shadow-sm ring-1 ring-violet-100/60 transition hover:border-violet-300 hover:bg-violet-50/80"
        >
          Yeni
        </button>
        <button
          type="button"
          className="inline-flex min-h-[2.75rem] items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-[0_10px_28px_-8px_rgba(91,33,182,0.4)] ring-1 ring-violet-300/40 transition hover:brightness-105"
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}
