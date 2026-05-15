"use client";

import { useState } from "react";

const fieldClass =
  "w-full rounded-2xl border border-violet-200/80 bg-white px-4 py-3 text-base font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

const labelClass = "mb-2 block text-sm font-bold text-slate-700";

export function BilgiKayitEkleDuzenle() {
  const [analizTuru, setAnalizTuru] = useState("");
  const [deger, setDeger] = useState("");
  const [bilgiKaynagi, setBilgiKaynagi] = useState("");
  const [aciklamaMetni, setAciklamaMetni] = useState("");

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
            onChange={(e) => setAnalizTuru(e.target.value)}
            className={fieldClass}
          >
            <option value="">Seçiniz…</option>
            <option value="yasam-yolu">Yaşam Yolu</option>
            <option value="dogum-gunu">Doğum Günü</option>
            <option value="ifade">İfade Sayısı</option>
            <option value="ruh-istegi">Ruh İsteği</option>
            <option value="kisilik">Kişilik</option>
            <option value="diger">Diğer</option>
          </select>
        </div>

        <div>
          <label htmlFor="bilgi-deger" className={labelClass}>
            Değer
          </label>
          <input
            id="bilgi-deger"
            type="text"
            value={deger}
            onChange={(e) => setDeger(e.target.value)}
            placeholder="Örn. 7, 11, 22…"
            className={fieldClass}
          />
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
            className={fieldClass}
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
            className={`${fieldClass} resize-y leading-relaxed`}
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
