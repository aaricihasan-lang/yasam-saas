"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getStoneAssignment,
  normalizeStoneList,
  saveStoneAssignment,
  stonesToTextarea,
} from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";

// NKB-V2: kompakt düzen (Bilgi Bankası ekranını gereksiz uzatmaz; mobilde taşma yok).
const fieldBase =
  "w-full rounded-xl border border-violet-200/90 bg-white px-3 font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200/60 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40";

const selectClass = `h-9 ${fieldBase} text-sm`;

const inputClass = `h-9 ${fieldBase} text-sm placeholder:text-slate-400`;

const textareaClass = `${fieldBase} min-h-[96px] resize-y py-2 text-sm leading-relaxed placeholder:text-slate-400`;

const labelClass = "mb-1 block text-xs font-bold text-slate-700";

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

const ELEMENT_DEGER_OPTIONS = (["Ateş", "Su", "Toprak", "Hava"] as const).flatMap((el) => [
  `${el} | AZ Destek`,
  `${el} | FAZLA Destek`,
]);

type AnalizTuruValue = (typeof ANALIZ_TURU_OPTIONS)[number]["value"];

function isCakraOmurga(tur: string): tur is "cakra-omurga" {
  return tur === "cakra-omurga";
}

function isElement(tur: string): tur is "element" {
  return tur === "element";
}

export function BilgiDogaltasAta() {
  const { showToast } = useToast();
  const [analizTuru, setAnalizTuru] = useState<AnalizTuruValue>("");
  const [deger, setDeger] = useState("");
  const [oneriAciklamasi, setOneriAciklamasi] = useState("");
  const [tasListesi, setTasListesi] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
    setOneriAciklamasi("");
    setTasListesi("");
  }

  function handleDegerChange(value: string) {
    setDeger(value);
  }

  useEffect(() => {
    if (!analizTuru || !deger.trim()) {
      setOneriAciklamasi("");
      setTasListesi("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await getStoneAssignment(analizTuru, deger.trim());
      if (cancelled) return;
      if (error) return;
      if (data) {
        setOneriAciklamasi(data.reason);
        setTasListesi(stonesToTextarea(data.stones));
      } else {
        setOneriAciklamasi("");
        setTasListesi("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analizTuru, deger]);

  function handleYeni() {
    setAnalizTuru("");
    setDeger("");
    setOneriAciklamasi("");
    setTasListesi("");
  }

  async function handleKaydet() {
    if (!analizTuru) {
      showToast({ message: "Analiz türü seçin.", type: "warning" });
      return;
    }
    if (!deger.trim()) {
      showToast({ message: "Değer alanını doldurun.", type: "warning" });
      return;
    }
    const stones = normalizeStoneList(tasListesi);
    const payload = {
      analysisType: analizTuru,
      value: deger.trim(),
      reason: oneriAciklamasi,
      stones,
    };
    setKaydediliyor(true);
    try {
      const { error } = await saveStoneAssignment(payload);
      if (error) {
        // Hata: seçimler KORUNUR.
        showToast({
          message: `Kayıt sırasında hata oluştu: ${error}`,
          type: "error",
        });
        return;
      }
      // Başarı: ilgili seçimler ve durum TAMAMEN sıfırlanır.
      setAnalizTuru("");
      setDeger("");
      setOneriAciklamasi("");
      setTasListesi("");
      showToast({ message: "Doğaltaş ataması kaydedildi", type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      showToast({
        message: `Kayıt sırasında hata oluştu: ${msg}`,
        type: "error",
      });
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <div className="py-1 md:rounded-2xl md:border md:border-violet-200/80 md:bg-white/95 md:p-4 md:shadow-sm md:ring-1 md:ring-purple-200/60 md:backdrop-blur-md">
      <div className="grid gap-4 lg:grid-cols-2">
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
              {CHAKRA_VALUE_OPTIONS.map((opt) => (
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
            rows={4}
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
            rows={5}
            placeholder="Taşları alt alta veya virgülle yazın. Örn: ametist, sitrin, turmalin"
            className={textareaClass}
          />
          <p className="mt-1.5 text-xs font-medium text-slate-500">
            Kayıtta taşlar normalize edilir (virgül, nokta, satır sonu); her taşın ilk harfi büyük yazılır.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5 border-t border-violet-100/90 pt-4">
        <button
          type="button"
          onClick={handleYeni}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-violet-200/90 bg-white px-5 text-sm font-black uppercase tracking-wide text-violet-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80"
        >
          Yeni
        </button>
        <button
          type="button"
          disabled={kaydediliyor}
          onClick={() => void handleKaydet()}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_6px_20px_-4px_rgba(91,33,182,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
