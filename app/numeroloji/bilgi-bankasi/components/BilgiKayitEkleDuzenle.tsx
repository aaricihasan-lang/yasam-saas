"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useToast } from "@/components/ui/ToastProvider";
import { numApiErrorCode } from "../../helpers/numApiClient";
import { getKnowledgeRecord, saveKnowledgeRecord, updateKnowledgeRecordById } from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";
import { kbValueDisplay, type KbValueT } from "../helpers/kbValueDisplay";
import { isKulvarAnalysisType, type KulvarSectionKey } from "../helpers/knowledgeSections";
import { EMPTY_KULVAR_BODIES, bodiesFromRecord, decideSaveMethod, sectionsFromBodies, shouldResetCanonicalFormAfterSave, type KulvarBodies } from "../helpers/kulvarFormLogic";
import { MSG_NEEDS_SAVED_RECORD } from "../helpers/sourceUiLogic";
import { useKulvarSources } from "../helpers/useKulvarSources";
import { KulvarSectionEditor } from "./KulvarSectionEditor";
import { KulvarSourceManager } from "./KulvarSourceManager";
import { KaynakNotlariYonetimi } from "./KaynakNotlariYonetimi";
import { AckPanel, type AckState } from "./AckPanel";

// 2026-10-20 premium görünüm (owner GÖRSEL PASS — numeroloji-bilgi-bankasi): yalnız sınıf; alanlar/mantık aynen.
const fieldBase =
  "w-full rounded-xl border-[1.5px] border-[#dcd2f3] bg-white px-4 font-medium text-[#1d1640] outline-none transition focus:border-violet-400 focus:ring-[3px] focus:ring-violet-300/30";

const selectClass = `h-[46px] ${fieldBase} text-base`;

const inputClass = `h-[46px] ${fieldBase} text-base placeholder:text-slate-400`;

const textareaClass = `${fieldBase} min-h-[140px] resize-y py-3 text-base leading-relaxed placeholder:text-slate-400`;

const labelClass = "mb-1.5 block text-[15px] font-bold text-[#241d45]";

// I18N: değerler kanonik analiz türü kodudur; görünen ad numerology.knowledge.shared.analysisTypes.<kod>,
// boş değer form.selectPlaceholder (TR katalog değerleri önceki etiketlerle birebir).
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

type KbT = ReturnType<typeof useTranslations>;

/**
 * I18N — EN'de sunucu hata ayrıntısı: numApiClient'ın sakladığı dil-bağımsız `code` → katalog
 * (önce numerology.knowledge.apiErrors, sonra common.apiErrors). Kod yoksa null (çağıran genel metni gösterir).
 * TR'de kullanılmaz (sunucu metni birebir).
 */
function enApiErrorDetail(t: KbT, tApi: KbT, serverText: string): string | null {
  const code = numApiErrorCode(serverText);
  if (!code) return null;
  if (t.has(`apiErrors.${code}`)) return t(`apiErrors.${code}`);
  if (code === "NETWORK") return tApi("network");
  if (tApi.has(`codes.${code}`)) return tApi(`codes.${code}`);
  return null;
}

export function BilgiKayitEkleDuzenle() {
  const { showToast } = useToast();
  const t = useTranslations("numerology.knowledge");
  const tApi = useTranslations("common.apiErrors");
  // I18N: TR'de sunucu / istisna metni birebir; EN'de kod → katalog, yoksa genel metin.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  // I18N-F1-R5: kanonik değer (DB eşleşme anahtarı) DEĞİŞMEZ; yalnız görünen etiket ekran dilinde.
  const kbView = (v: string): string => (isSourceLocale ? v : kbValueDisplay(v, ((k, x) => t(`valueDisplay.${k}` as never, x as never)) as KbValueT));
  const [analizTuru, setAnalizTuru] = useState<AnalizTuruValue>("");
  const [deger, setDeger] = useState("");
  const [bilgiKaynagi, setBilgiKaynagi] = useState("");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const [kulvarBodies, setKulvarBodies] = useState<KulvarBodies>({ ...EMPTY_KULVAR_BODIES });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [ack, setAck] = useState<AckState>(null);
  // NUM-F06: kullanıcının elle yazdığı içerik (kaynak/açıklama/kulvar bölümleri) "kirli" ise,
  // Değer alanındaki bir düzeltme/eşleşmeme bu metni SİLMEZ. Yalnız kayıttan yüklenmiş ve
  // dokunulmamış içerik, eşleşme kaybolunca temizlenir.
  const icerikKirliRef = useRef(false);
  const [bekleyenKayit, setBekleyenKayit] = useState<Awaited<ReturnType<typeof getKnowledgeRecord>>["data"]>(null);

  const isKulvar = isKulvarAnalysisType(analizTuru);
  // Kaynak yönetimi yalnız kaydedilmiş (existingId) Kulvar kaydında etkin.
  const { sources: kSources, links: kLinks, loading: kLoading, reload: kReload } = useKulvarSources(
    existingId,
    isKulvar && Boolean(existingId),
  );

  function resetIcerik() {
    setBilgiKaynagi("");
    setAciklamaMetni("");
    setKulvarBodies({ ...EMPTY_KULVAR_BODIES });
    setExistingId(null);
    setBekleyenKayit(null);
    icerikKirliRef.current = false;
  }

  function yukleKayit(data: NonNullable<Awaited<ReturnType<typeof getKnowledgeRecord>>["data"]>, tur: string) {
    setExistingId(data.id);
    setBilgiKaynagi(data.source ?? "");
    if (isKulvarAnalysisType(tur)) {
      setKulvarBodies(bodiesFromRecord(data));
      setAciklamaMetni("");
    } else {
      setAciklamaMetni(data.description ?? "");
      setKulvarBodies({ ...EMPTY_KULVAR_BODIES });
    }
    setBekleyenKayit(null);
    icerikKirliRef.current = false;
  }

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
    if (icerikKirliRef.current) {
      // Kullanıcının yazdığı metin korunur; yalnız eşleşme bağı kopar.
      setExistingId(null);
      setBekleyenKayit(null);
    } else {
      resetIcerik();
    }
    setAck(null);
  }

  function handleDegerChange(value: string) {
    setDeger(value);
    setAck(null);
  }

  // Mevcut kaydı yükle: content_sections canonical, yoksa legacy description → overview fallback.
  // Bu fallback yalnız ARAYÜZDE üretilir; DB'ye YAZILMAZ (kullanıcı Kaydet demeden dönüşüm yok).
  // NUM-F06: debounce'lu; kullanıcı metni (kirli) hiçbir durumda sessizce silinmez/ezilmez.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (!analizTuru || !deger.trim()) {
          if (cancelled) return;
          setExistingId(null);
          setBekleyenKayit(null);
          if (!icerikKirliRef.current) {
            setBilgiKaynagi("");
            setAciklamaMetni("");
            setKulvarBodies({ ...EMPTY_KULVAR_BODIES });
          }
          return;
        }
        const { data, error } = await getKnowledgeRecord(analizTuru, deger.trim());
        if (cancelled || error) return;
        if (data) {
          if (icerikKirliRef.current) {
            // Yazılmış metni EZME: eşleşen kaydı kullanıcıya göster, yüklemeyi ona bırak.
            setExistingId(data.id);
            setBekleyenKayit(data);
          } else {
            yukleKayit(data, analizTuru);
          }
        } else {
          setExistingId(null);
          setBekleyenKayit(null);
          if (!icerikKirliRef.current) {
            setBilgiKaynagi("");
            setAciklamaMetni("");
            setKulvarBodies({ ...EMPTY_KULVAR_BODIES });
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
    setAnalizTuru("");
    setDeger("");
    resetIcerik();
    setAck(null);
  }

  function handleKulvarBodyChange(key: KulvarSectionKey, value: string) {
    icerikKirliRef.current = true;
    setKulvarBodies((prev) => ({ ...prev, [key]: value }));
  }

  async function handleKaydet() {
    if (!analizTuru) {
      showToast({ message: t("form.chooseAnalysisType"), type: "warning" });
      return;
    }
    if (!deger.trim()) {
      showToast({ message: t("form.fillValue"), type: "warning" });
      return;
    }

    const method = decideSaveMethod(existingId);
    setKaydediliyor(true);
    try {
      let error: string | null = null;
      let conflict = false;

      if (isKulvar) {
        // content_sections canonical; description düzleştirilmiş kopyası ÜRETİLMEZ.
        const content_sections = sectionsFromBodies(kulvarBodies);
        if (method === "PATCH" && existingId) {
          ({ error } = await updateKnowledgeRecordById(existingId, {
            analysisType: analizTuru,
            value: deger.trim(),
            source: bilgiKaynagi,
            content_sections,
          }));
        } else {
          ({ error, conflict } = await saveKnowledgeRecord({
            analysisType: analizTuru,
            value: deger.trim(),
            source: bilgiKaynagi,
            content_sections,
          }));
        }
      } else {
        if (method === "PATCH" && existingId) {
          ({ error } = await updateKnowledgeRecordById(existingId, {
            analysisType: analizTuru,
            value: deger.trim(),
            source: bilgiKaynagi,
            description: aciklamaMetni,
          }));
        } else {
          ({ error, conflict } = await saveKnowledgeRecord({
            analysisType: analizTuru,
            value: deger.trim(),
            source: bilgiKaynagi,
            description: aciklamaMetni,
          }));
        }
      }

      if (conflict) {
        // HATA/çakışma: form verisi korunur; kalıcı panel.
        setAck({
          type: "error",
          message: t("canonical.conflict"),
        });
        return;
      }
      if (error) {
        const detail = isSourceLocale ? error : enApiErrorDetail(t, tApi, error);
        setAck({ type: "error", message: detail ? t("canonical.saveFailed", { error: detail }) : t("canonical.saveFailedGeneric") });
        return;
      }

      // BAŞARI: formu başlangıç durumuna döndür — edit modu kapanır, seçili eski kayıt durumu
      // temizlenir (eski form verileri ekranda KALMAZ). Kalıcı başarı paneli "Tamam"a kadar kalır.
      // (Yukarıdaki hata/çakışma yolları erken return ile formu ve edit modunu KORUR.)
      if (shouldResetCanonicalFormAfterSave("success")) {
        setAnalizTuru("");
        setDeger("");
        resetIcerik();
      }
      setAck({ type: "success", message: t("canonical.saved") });
    } catch (err) {
      // EN'de istisna metni (dil-bağımsız değil) gösterilmez → genel metin.
      const msg = err instanceof Error ? err.message : t("shared.unknownError");
      setAck({ type: "error", message: isSourceLocale ? t("canonical.saveFailed", { error: msg }) : t("canonical.saveFailedGeneric") });
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <div className="py-1 md:rounded-2xl md:border md:border-violet-200/80 md:bg-white/95 md:p-4 md:shadow-sm md:ring-1 md:ring-purple-200/60 md:backdrop-blur-md">
      <div className="mb-4 rounded-2xl border border-[#e3dbf5] bg-[#f6f2fd] px-4 py-3">
        <p className="text-[17px] font-extrabold text-[#2a1866]">{t("canonical.heading")}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">
          {t.rich("canonical.intro", { b: (chunks) => <span className="font-bold">{chunks}</span> })}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="bilgi-analiz-turu" className={labelClass}>
            {t("canonical.analysisType")}
          </label>
          <select
            id="bilgi-analiz-turu"
            value={analizTuru}
            onChange={(e) => handleAnalizTuruChange(e.target.value)}
            className={selectClass}
          >
            {ANALIZ_TURU_OPTIONS.map((opt) => (
              <option key={opt.value || "seciniz"} value={opt.value}>
                {opt.value ? t(`shared.analysisTypes.${opt.value}`) : t("form.selectPlaceholder")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bilgi-deger" className={labelClass}>
            {t("canonical.value")}
          </label>
          {isCakraOmurga(analizTuru) ? (
            <select
              id="bilgi-deger"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("form.selectPlaceholder")}</option>
              {CHAKRA_VALUE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {kbView(opt)}
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
              <option value="">{t("form.selectPlaceholder")}</option>
              {ELEMENT_DEGER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {kbView(opt)}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="bilgi-deger"
              type="text"
              value={deger}
              onChange={(e) => handleDegerChange(e.target.value)}
              placeholder={t("form.valuePlaceholder")}
              className={inputClass}
            />
          )}
        </div>

        {bekleyenKayit ? (
          <div role="status" className="lg:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {t("canonical.pendingRecord")}{" "}
            <button
              type="button"
              onClick={() => yukleKayit(bekleyenKayit, analizTuru)}
              className="ml-1 rounded-lg border border-amber-400 bg-white px-2 py-1 font-black text-amber-900 hover:bg-amber-100"
            >
              {t("canonical.loadPending")}
            </button>
          </div>
        ) : null}

        <div className="lg:col-span-2">
          <label htmlFor="bilgi-kaynak" className={labelClass}>
            {t("canonical.source")}
          </label>
          <input
            id="bilgi-kaynak"
            type="text"
            value={bilgiKaynagi}
            onChange={(e) => { icerikKirliRef.current = true; setBilgiKaynagi(e.target.value); }}
            placeholder={t("form.sourcePlaceholder")}
            className={inputClass}
          />
        </div>

        {isKulvar ? (
          <>
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-bold text-violet-800">
                {existingId ? t("canonical.editingSections") : t("form.structuredSections")}
              </p>
              <KulvarSectionEditor bodies={kulvarBodies} onChange={handleKulvarBodyChange} disabled={kaydediliyor} />
            </div>
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-bold text-violet-800">{t("form.sources")}</p>
              {existingId ? (
                <KulvarSourceManager
                  recordId={existingId}
                  recordAnalysisType={analizTuru}
                  sources={kSources}
                  links={kLinks}
                  loading={kLoading}
                  reload={kReload}
                />
              ) : (
                <p className="text-sm font-medium text-slate-500">{isSourceLocale ? MSG_NEEDS_SAVED_RECORD : t("canonical.needsSavedRecord")}</p>
              )}
            </div>
          </>
        ) : (
          <div className="lg:col-span-2">
            <label htmlFor="bilgi-aciklama" className={labelClass}>
              {t("canonical.description")}
            </label>
            <textarea
              id="bilgi-aciklama"
              value={aciklamaMetni}
              onChange={(e) => { icerikKirliRef.current = true; setAciklamaMetni(e.target.value); }}
              rows={6}
              placeholder={t("canonical.descriptionPlaceholder")}
              className={textareaClass}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5 border-t border-violet-100/90 pt-4">
        <button
          type="button"
          onClick={handleYeni}
          className="inline-flex h-11 items-center justify-center rounded-xl border-[1.5px] border-[#e2dcef] bg-white px-6 text-base font-black uppercase tracking-wide text-violet-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/80"
        >
          {t("canonical.new")}
        </button>
        <button
          type="button"
          disabled={kaydediliyor}
          onClick={() => void handleKaydet()}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-violet-700 px-7 text-base font-black uppercase tracking-wide text-white shadow-[0_10px_22px_-12px_rgba(109,40,217,0.8)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {existingId ? (kaydediliyor ? t("canonical.updating") : t("canonical.update")) : kaydediliyor ? t("canonical.saving") : t("canonical.save")}
        </button>
      </div>

      <AckPanel panel={ack} onClose={() => setAck(null)} />

      {/* B. Kaynak Notları — kanonik açıklamadan AYRI; kaydedilmiş kayıt gerekir. */}
      <div className="mt-6 border-t-2 border-[#ece6f7] pt-5">
        <div className="mb-4 rounded-2xl border border-[#e3dbf5] bg-[#f6f2fd] px-4 py-3">
          <p className="text-[17px] font-extrabold text-[#2a1866]">{t("canonical.notesHeading")}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            {t("canonical.notesIntro")}
          </p>
        </div>
        {existingId ? (
          <KaynakNotlariYonetimi recordId={existingId} />
        ) : (
          <p className="text-sm font-medium text-slate-500">
            {t("canonical.notesNeedRecord")}
          </p>
        )}
      </div>
    </div>
  );
}
