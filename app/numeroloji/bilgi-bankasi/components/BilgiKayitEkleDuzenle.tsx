"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getKnowledgeRecord, saveKnowledgeRecord } from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";

const fieldBase =
  "w-full rounded-xl border border-violet-200/90 bg-white px-3 font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200/60 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40";

const selectClass = `h-9 ${fieldBase} text-sm`;

const inputClass = `h-9 ${fieldBase} text-sm placeholder:text-slate-400`;

const textareaClass = `${fieldBase} min-h-[140px] resize-y py-2 text-sm leading-relaxed placeholder:text-slate-400`;

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

export function BilgiKayitEkleDuzenle() {
  const { showToast } = useToast();
  const [analizTuru, setAnalizTuru] = useState<AnalizTuruValue>("");
  const [deger, setDeger] = useState("");
  const [bilgiKaynagi, setBilgiKaynagi] = useState("");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
    setBilgiKaynagi("");
    setAciklamaMetni("");
  }

  function handleDegerChange(value: string) {
    setDeger(value);
  }

  useEffect(() => {
    if (!analizTuru || !deger.trim()) {
      setBilgiKaynagi("");
      setAciklamaMetni("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await getKnowledgeRecord(analizTuru, deger.trim());
      if (cancelled) return;
      if (error) return;
      if (data) {
        setBilgiKaynagi(data.source ?? "");
        setAciklamaMetni(data.description ?? "");
      } else {
        setBilgiKaynagi("");
        setAciklamaMetni("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analizTuru, deger]);

  function handleYeni() {
    setAnalizTuru("");
    setDeger("");
    setBilgiKaynagi("");
    setAciklamaMetni("");
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
    const payload = {
      analysisType: analizTuru,
      value: deger.trim(),
      source: bilgiKaynagi,
      description: aciklamaMetni,
    };
    console.log("Kaydedilecek veri:", payload);
    setKaydediliyor(true);
    try {
      const { error } = await saveKnowledgeRecord(payload);
      if (error) {
        console.error("Bilgi Bankası kayıt hatası:", error);
        showToast({
          message: `Kayıt sırasında hata oluştu: ${error}`,
          type: "error",
        });
        return;
      }
      showToast({ message: "Kayıt kaydedildi", type: "success" });
    } catch (err) {
      console.error("Bilgi Bankası beklenmeyen hata:", err);
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
    <div className="rounded-2xl border border-violet-200/80 bg-white/95 p-4 shadow-sm ring-1 ring-purple-200/60 backdrop-blur-md">
      <div className="grid gap-4 lg:grid-cols-2">
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
              id="bilgi-deger"
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
              id="bilgi-deger"
              type="text"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
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
            rows={6}
            placeholder="Numeroloji açıklama ve yorum metnini buraya yazın..."
            className={textareaClass}
          />
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
          {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
