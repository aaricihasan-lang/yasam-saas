"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getKnowledgeRecord, saveKnowledgeRecord, updateKnowledgeRecordById } from "../helpers/bilgiBankaKayit";
import { CHAKRA_VALUE_OPTIONS } from "../helpers/bilgiCakraValueOptions";
import { isKulvarAnalysisType, type KulvarSectionKey } from "../helpers/knowledgeSections";
import { EMPTY_KULVAR_BODIES, bodiesFromRecord, decideSaveMethod, sectionsFromBodies, shouldResetCanonicalFormAfterSave, type KulvarBodies } from "../helpers/kulvarFormLogic";
import { MSG_NEEDS_SAVED_RECORD } from "../helpers/sourceUiLogic";
import { useKulvarSources } from "../helpers/useKulvarSources";
import { KulvarSectionEditor } from "./KulvarSectionEditor";
import { KulvarSourceManager } from "./KulvarSourceManager";
import { KaynakNotlariYonetimi } from "./KaynakNotlariYonetimi";
import { AckPanel, type AckState } from "./AckPanel";

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
  const [kulvarBodies, setKulvarBodies] = useState<KulvarBodies>({ ...EMPTY_KULVAR_BODIES });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [ack, setAck] = useState<AckState>(null);

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
  }

  function handleAnalizTuruChange(value: string) {
    setAnalizTuru(value as AnalizTuruValue);
    setDeger("");
    resetIcerik();
    setAck(null);
  }

  function handleDegerChange(value: string) {
    setDeger(value);
    setAck(null);
  }

  // Mevcut kaydı yükle: content_sections canonical, yoksa legacy description → overview fallback.
  // Bu fallback yalnız ARAYÜZDE üretilir; DB'ye YAZILMAZ (kullanıcı Kaydet demeden dönüşüm yok).
  useEffect(() => {
    if (!analizTuru || !deger.trim()) {
      resetIcerik();
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await getKnowledgeRecord(analizTuru, deger.trim());
      if (cancelled) return;
      if (error) return;
      if (data) {
        setExistingId(data.id);
        setBilgiKaynagi(data.source ?? "");
        if (isKulvarAnalysisType(analizTuru)) {
          setKulvarBodies(bodiesFromRecord(data));
          setAciklamaMetni("");
        } else {
          setAciklamaMetni(data.description ?? "");
          setKulvarBodies({ ...EMPTY_KULVAR_BODIES });
        }
      } else {
        setExistingId(null);
        setBilgiKaynagi("");
        setAciklamaMetni("");
        setKulvarBodies({ ...EMPTY_KULVAR_BODIES });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analizTuru, deger]);

  function handleYeni() {
    setAnalizTuru("");
    setDeger("");
    resetIcerik();
    setAck(null);
  }

  function handleKulvarBodyChange(key: KulvarSectionKey, value: string) {
    setKulvarBodies((prev) => ({ ...prev, [key]: value }));
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
          message: "Bu analiz türü ve değer için kayıt zaten mevcut. Düzenlemek için mevcut kaydı açın.",
        });
        return;
      }
      if (error) {
        setAck({ type: "error", message: `Kayıt sırasında hata oluştu: ${error}` });
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
      setAck({ type: "success", message: "Kanonik açıklama kaydedildi." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      setAck({ type: "error", message: `Kayıt sırasında hata oluştu: ${msg}` });
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <div className="py-1 md:rounded-2xl md:border md:border-violet-200/80 md:bg-white/95 md:p-4 md:shadow-sm md:ring-1 md:ring-purple-200/60 md:backdrop-blur-md">
      <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2">
        <p className="text-sm font-black text-violet-900">A. Kanonik Açıklama</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">
          Her analiz türü ve değer için tek kanonik açıklama. Kaynağa özgü uzman notları aşağıdaki
          <span className="font-bold"> B. Kaynak Notları</span> bölümünde ayrı tutulur.
        </p>
      </div>
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

        {isKulvar ? (
          <>
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-bold text-violet-800">
                {existingId ? "Kaydı düzenliyorsunuz — bölümleri güncelleyin" : "Yapılandırılmış bölümler"}
              </p>
              <KulvarSectionEditor bodies={kulvarBodies} onChange={handleKulvarBodyChange} disabled={kaydediliyor} />
            </div>
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-bold text-violet-800">Kaynaklar</p>
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
                <p className="text-sm font-medium text-slate-500">{MSG_NEEDS_SAVED_RECORD}</p>
              )}
            </div>
          </>
        ) : (
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
        )}
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
          {existingId ? (kaydediliyor ? "Güncelleniyor..." : "Kanonik Açıklamayı Güncelle") : kaydediliyor ? "Kaydediliyor..." : "Kanonik Açıklamayı Kaydet"}
        </button>
      </div>

      <AckPanel panel={ack} onClose={() => setAck(null)} />

      {/* B. Kaynak Notları — kanonik açıklamadan AYRI; kaydedilmiş kayıt gerekir. */}
      <div className="mt-5 border-t border-violet-100 pt-4">
        <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2">
          <p className="text-sm font-black text-violet-900">B. Kaynak Notları</p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            Kaynak başına ayrı uzman notları. Kanonik açıklamayı DEĞİŞTİRMEZ. “Uzmanın Kendi Notu” için
            kaynak seçmeden kaydedin. “Analizde kullan” işaretli notlar yalnız Hesap Özetli analizde görünür.
          </p>
        </div>
        {existingId ? (
          <KaynakNotlariYonetimi recordId={existingId} />
        ) : (
          <p className="text-sm font-medium text-slate-500">
            Kaynak notu eklemek için önce yukarıdan analiz türü ve değeri seçip kanonik açıklamayı kaydedin.
          </p>
        )}
      </div>
    </div>
  );
}
