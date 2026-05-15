"use client";

import { useEffect, useState } from "react";
import {
  getStoneAssignment,
  normalizeStoneList,
  saveStoneAssignment,
  stonesToTextarea,
} from "../helpers/stoneAssignmentStore";

const fieldBase =
  "w-full rounded-2xl border-2 border-violet-200/90 bg-white px-6 font-medium text-slate-900 shadow-md outline-none ring-1 ring-purple-200 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/50";

const selectClass = `h-16 ${fieldBase} text-lg`;

const inputClass = `h-16 ${fieldBase} text-lg placeholder:text-slate-400`;

const textareaClass = `${fieldBase} min-h-[300px] resize-y py-5 text-lg leading-relaxed placeholder:text-slate-400`;

const labelClass = "mb-3 block text-lg font-bold text-slate-800";

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

/** Her çakra için AZ ve FAZLA (1–10). */
const CAKRA_OMURGA_DEGER_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return [`${n}. Çakra | AZ`, `${n}. Çakra | FAZLA`] as const;
}).flat();

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

export function BilgiDogaltasAta() {
  const [analizTuru, setAnalizTuru] = useState<AnalizTuruValue>("");
  const [deger, setDeger] = useState("");
  const [oneriAciklamasi, setOneriAciklamasi] = useState("");
  const [tasListesi, setTasListesi] = useState("");
  const [kayitMesaj, setKayitMesaj] = useState<string | null>(null);

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
    setOneriAciklamasi("");
    setTasListesi("");
    setKayitMesaj(null);
  }

  function handleDegerChange(value: string) {
    setDeger(value);
    setKayitMesaj(null);
  }

  useEffect(() => {
    if (!analizTuru || !deger) {
      setOneriAciklamasi("");
      setTasListesi("");
      return;
    }
    const entry = getStoneAssignment(analizTuru, deger);
    if (entry) {
      setOneriAciklamasi(entry.reason);
      setTasListesi(stonesToTextarea(entry.stones));
    } else {
      setOneriAciklamasi("");
      setTasListesi("");
    }
  }, [analizTuru, deger]);

  function handleYeni() {
    setAnalizTuru("");
    setDeger("");
    setOneriAciklamasi("");
    setTasListesi("");
    setKayitMesaj(null);
  }

  function handleKaydet() {
    setKayitMesaj(null);
    if (!analizTuru) {
      setKayitMesaj("Analiz türü seçin.");
      return;
    }
    if (!deger.trim()) {
      setKayitMesaj("Değer alanını doldurun.");
      return;
    }
    const stones = normalizeStoneList(tasListesi);
    saveStoneAssignment({
      category: analizTuru,
      value: deger.trim(),
      reason: oneriAciklamasi,
      stones,
    });
    setTasListesi(stonesToTextarea(stones));
    setKayitMesaj("Kaydedildi.");
  }

  return (
    <div className="rounded-[32px] border-2 border-violet-200/80 bg-white/95 p-10 shadow-xl ring-1 ring-purple-200 backdrop-blur-md">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12">
        <div>
          <label htmlFor="tas-ata-analiz-turu" className={labelClass}>
            Analiz Türü
          </label>
          <select
            id="tas-ata-analiz-turu"
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
          <label htmlFor="tas-ata-deger" className={labelClass}>
            Değer
          </label>
          {isCakraOmurga(analizTuru) ? (
            <select
              id="tas-ata-deger"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
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
              id="tas-ata-deger"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
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
              id="tas-ata-deger"
              type="text"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
              placeholder="Örn. 19, 11, 33/6, 22…"
              className={inputClass}
            />
          )}
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="tas-ata-oneri" className={labelClass}>
            Öneri Açıklaması
          </label>
          <textarea
            id="tas-ata-oneri"
            value={oneriAciklamasi}
            onChange={(e) => setOneriAciklamasi(e.target.value)}
            rows={8}
            placeholder="Bu analiz türü ve değer için doğaltaş öneri açıklamasını yazın…"
            className={textareaClass}
          />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="tas-ata-liste" className={labelClass}>
            Taş Listesi
          </label>
          <textarea
            id="tas-ata-liste"
            value={tasListesi}
            onChange={(e) => setTasListesi(e.target.value)}
            rows={10}
            placeholder="Taşları alt alta veya virgülle yazın. Örn: ametist, sitrin, turmalin"
            className={textareaClass}
          />
          <p className="mt-2 text-sm font-medium text-slate-500">
            Kayıtta taşlar normalize edilir (virgül, nokta, satır sonu); her taşın ilk harfi büyük yazılır.
          </p>
        </div>
      </div>

      {kayitMesaj ? (
        <p
          className={`mt-6 rounded-2xl px-4 py-3 text-base font-semibold ${
            kayitMesaj === "Kaydedildi."
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70"
              : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/70"
          }`}
          role="status"
        >
          {kayitMesaj}
        </p>
      ) : null}

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
          onClick={handleKaydet}
          className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-emerald-400/70 bg-gradient-to-r from-emerald-600 to-teal-600 px-10 py-3 text-base font-black uppercase tracking-wide text-white shadow-[0_12px_32px_-8px_rgba(16,185,129,0.4)] ring-2 ring-emerald-300/40 transition hover:brightness-105"
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}
