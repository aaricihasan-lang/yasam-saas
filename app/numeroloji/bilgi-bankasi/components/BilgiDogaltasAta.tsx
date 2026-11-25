"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useToast } from "@/components/ui/ToastProvider";
import {
  getStoneAssignment,
  normalizeStoneList,
  saveStoneAssignment,
  stonesToTextarea,
} from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";
import { kbValueDisplay, type KbValueT } from "../helpers/kbValueDisplay";

// NKB-V2: kompakt düzen (Bilgi Bankası ekranını gereksiz uzatmaz; mobilde taşma yok).
// 2026-10-20 premium görünüm (owner GÖRSEL PASS — numeroloji-bilgi-bankasi): yalnız sınıf; alanlar/mantık aynen.
const fieldBase =
  "w-full rounded-xl border-[1.5px] border-[#dcd2f3] bg-white px-4 font-medium text-[#1d1640] outline-none transition focus:border-violet-400 focus:ring-[3px] focus:ring-violet-300/30";

const selectClass = `h-[46px] ${fieldBase} text-base`;

const inputClass = `h-[46px] ${fieldBase} text-base placeholder:text-slate-400`;

const textareaClass = `${fieldBase} min-h-[120px] resize-y py-3 text-base leading-relaxed placeholder:text-slate-400`;

const labelClass = "mb-1.5 block text-[15px] font-bold text-[#241d45]";

// I18N: analiz türü değerleri kanonik koddur (DB analysis_type); görünen ad
// numerology.knowledge.shared.analysisTypes.<kod> (TR birebir). Boş değer = "Seçiniz...".
const ANALIZ_TURU_OPTIONS = [
  { value: "" },
  { value: "ana-kulvar" },
  { value: "yan-kulvar" },
  { value: "ifade-sayisi" },
  { value: "hayat-yolu" },
  { value: "cakra-omurga" },
  { value: "element" },
  { value: "diger" },
] as const;

// i18n-ignore: "Ateş | AZ Destek" vb. Bilgi Bankası eşleşme anahtarıdır (DB value); çevrilmez, aynen gösterilir.
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
  const t = useTranslations("numerology.knowledge");
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  // I18N-F1-R5: kanonik değer (DB eşleşme anahtarı) DEĞİŞMEZ; yalnız görünen etiket ekran dilinde.
  const kbView = (v: string): string => (isSourceLocale ? v : kbValueDisplay(v, ((k, x) => t(`valueDisplay.${k}` as never, x as never)) as KbValueT));
  const [analizTuru, setAnalizTuru] = useState<AnalizTuruValue>("");
  const [deger, setDeger] = useState("");
  const [oneriAciklamasi, setOneriAciklamasi] = useState("");
  const [tasListesi, setTasListesi] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  // NUM-F06: kullanıcı yazdıysa (kirli) Değer düzeltmesi metni silmez/ezmez.
  const icerikKirliRef = useRef(false);
  // Bu (tür, değer) için kayıtlı atama var mı? Kaydet = üzerine yazma → kullanıcıya açıkça söylenir.
  const [mevcutAtama, setMevcutAtama] = useState<{ reason: string; stones: string[] } | null>(null);
  // Mevcut atama okunamadıysa kaydetme engellenir (sessiz üzerine yazma riski).
  const [yuklemeHatasi, setYuklemeHatasi] = useState(false);

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
    setMevcutAtama(null);
    if (!icerikKirliRef.current) {
      setOneriAciklamasi("");
      setTasListesi("");
    }
  }

  function handleDegerChange(value: string) {
    setDeger(value);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (!analizTuru || !deger.trim()) {
          if (cancelled) return;
          setMevcutAtama(null);
          setYuklemeHatasi(false);
          if (!icerikKirliRef.current) {
            setOneriAciklamasi("");
            setTasListesi("");
          }
          return;
        }
        const { data, error } = await getStoneAssignment(analizTuru, deger.trim());
        if (cancelled) return;
        if (error) {
          setYuklemeHatasi(true);
          return;
        }
        setYuklemeHatasi(false);
        if (data) {
          setMevcutAtama({ reason: data.reason, stones: data.stones });
          if (!icerikKirliRef.current) {
            setOneriAciklamasi(data.reason);
            setTasListesi(stonesToTextarea(data.stones));
          }
        } else {
          setMevcutAtama(null);
          if (!icerikKirliRef.current) {
            setOneriAciklamasi("");
            setTasListesi("");
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analizTuru, deger]);

  function handleYeni() {
    icerikKirliRef.current = false;
    setMevcutAtama(null);
    setAnalizTuru("");
    setDeger("");
    setOneriAciklamasi("");
    setTasListesi("");
  }

  async function handleKaydet() {
    if (!analizTuru) {
      showToast({ message: t("stoneAssign.chooseAnalysisType"), type: "warning" });
      return;
    }
    if (!deger.trim()) {
      showToast({ message: t("stoneAssign.fillValue"), type: "warning" });
      return;
    }
    if (yuklemeHatasi) {
      showToast({ message: t("stoneAssign.loadBlocked"), type: "error" });
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
        // I18N: sunucu/DB hata metni TR'de aynen; EN'de modülün genel hata metni (dil-bağımsız kod yok).
        showToast({
          message: isSourceLocale ? t("stoneAssign.saveFailed", { error: String(error) }) : t("stoneAssign.saveFailedGeneric"),
          type: "error",
        });
        return;
      }
      // Başarı: ilgili seçimler ve durum TAMAMEN sıfırlanır.
      icerikKirliRef.current = false;
      setMevcutAtama(null);
      setAnalizTuru("");
      setDeger("");
      setOneriAciklamasi("");
      setTasListesi("");
      showToast({ message: mevcutAtama ? t("stoneAssign.updated") : t("stoneAssign.saved"), type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("shared.unknownError");
      showToast({
        message: t("stoneAssign.saveFailed", { error: msg }),
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
            {t("stoneAssign.analysisType")}
          </label>
          <select
            id="tas-ata-analiz-turu"
            value={analizTuru}
            onChange={(e) => handleAnalizTuruChange(e.target.value)}
            className={selectClass}
          >
            {ANALIZ_TURU_OPTIONS.map((opt) => (
              <option key={opt.value || "seciniz"} value={opt.value}>
                {opt.value ? t(`shared.analysisTypes.${opt.value}`) : t("stoneAssign.selectPlaceholder")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tas-ata-deger" className={labelClass}>
            {t("stoneAssign.value")}
          </label>
          {isCakraOmurga(analizTuru) ? (
            <select
              id="tas-ata-deger"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("stoneAssign.selectPlaceholder")}</option>
              {CHAKRA_VALUE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {kbView(opt)}
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
              <option value="">{t("stoneAssign.selectPlaceholder")}</option>
              {ELEMENT_DEGER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {kbView(opt)}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="tas-ata-deger"
              type="text"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
              placeholder={t("stoneAssign.valuePlaceholder")}
              className={inputClass}
            />
          )}
        </div>

        {yuklemeHatasi ? (
          <div role="alert" className="lg:col-span-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
            {t("stoneAssign.loadErrorBox")}
          </div>
        ) : mevcutAtama ? (
          <div role="status" className="lg:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {t("stoneAssign.existingBox")}
            {oneriAciklamasi !== mevcutAtama.reason || tasListesi !== stonesToTextarea(mevcutAtama.stones) ? (
              <button
                type="button"
                onClick={() => {
                  icerikKirliRef.current = false;
                  setOneriAciklamasi(mevcutAtama.reason);
                  setTasListesi(stonesToTextarea(mevcutAtama.stones));
                }}
                className="ml-2 rounded-lg border border-amber-400 bg-white px-2 py-1 font-black text-amber-900 hover:bg-amber-100"
              >
                {t("stoneAssign.loadExisting")}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="lg:col-span-2">
          <label htmlFor="tas-ata-oneri" className={labelClass}>
            {t("stoneAssign.reasonLabel")}
          </label>
          <textarea
            id="tas-ata-oneri"
            value={oneriAciklamasi}
            onChange={(e) => { icerikKirliRef.current = true; setOneriAciklamasi(e.target.value); }}
            rows={4}
            placeholder={t("stoneAssign.reasonPlaceholder")}
            className={textareaClass}
          />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="tas-ata-liste" className={labelClass}>
            {t("stoneAssign.stonesLabel")}
          </label>
          <textarea
            id="tas-ata-liste"
            value={tasListesi}
            onChange={(e) => { icerikKirliRef.current = true; setTasListesi(e.target.value); }}
            rows={5}
            placeholder={t("stoneAssign.stonesPlaceholder")}
            className={textareaClass}
          />
          <p className="mt-1.5 text-xs font-medium text-slate-500">
            {t("stoneAssign.stonesHint")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5 border-t border-violet-100/90 pt-4">
        <button
          type="button"
          onClick={handleYeni}
          className="inline-flex h-11 items-center justify-center rounded-xl border-[1.5px] border-[#e2dcef] bg-white px-6 text-base font-black uppercase tracking-wide text-violet-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80"
        >
          {t("stoneAssign.new")}
        </button>
        <button
          type="button"
          disabled={kaydediliyor}
          onClick={() => void handleKaydet()}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-violet-700 px-7 text-base font-black uppercase tracking-wide text-white shadow-[0_10px_22px_-12px_rgba(109,40,217,0.8)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {kaydediliyor ? t("shared.saving") : t("shared.save")}
        </button>
      </div>
    </div>
  );
}
