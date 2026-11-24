"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useCuppingVocab } from "@/app/kupa/lib/useCuppingVocab";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { kupaBtnGhost, kupaBtnPrimary, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";

/**
 * QUICK-CREATE MASTER FORM — protokol dosyasından ÇIKMADAN eksik master (Teknik /
 * Güvenlik) oluşturma. YALNIZ technique + safety (discriminated union) — Kaynak ve Nokta
 * BU FORMU KULLANMAZ (kaynak = sade serbest-metin; nokta = quick-create YOK). Kullanıcıya
 * enum kodu / DB kolon adı / tenant / id / provenance GÖSTERİLMEZ. Gerçek create+attach
 * PARENT'ta olur (onCreate); bu form yalnız alanları toplar + advisory duplicate uyarır.
 */

/** TR-locale normalize (NFKC + trim + iç boşluk sıkıştır + tr-lower) — advisory dup eşleşmesi. */
export function normalizeMasterName(v: string): string {
  return v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

export type TechniqueQuickValues = {
  name: string;
  technique_type: string | null;
  movement_style: string | null;
  description: string | null;
};
export type SafetyQuickValues = {
  title: string;
  content: string | null;
  severity: "info" | "warning" | "contraindication";
  contraindication_class: string | null;
};

export type QuickCreateConfig =
  | {
      entity: "technique";
      /** Advisory duplicate için mevcut master ad listesi. */
      existing: { id: string; label: string }[];
      /** Gerçek create + attach + refresh (parent). Create hatası → THROW (form açık kalır). */
      onCreate: (values: TechniqueQuickValues) => Promise<void>;
      /** Advisory "Mevcut Kaydı Kullan" → mevcut master'ı protokole ekle (parent). */
      onUseExisting: (id: string) => void;
    }
  | {
      entity: "safety";
      existing: { id: string; label: string }[];
      onCreate: (values: SafetyQuickValues) => Promise<void>;
      onUseExisting: (id: string) => void;
    };

// Seçenek DEĞERLERİ kanonik koddur (DB); görünen etiket useCuppingVocab ile ekran dilinde üretilir
// (TR değerleri messages/tr/cupping.json → cupping.vocab; app/kupa/teknikler/lib/labels.ts ile birebir).
const TECHNIQUE_TYPE_OPTIONS = ["", "dry", "wet"] as const;
const MOVEMENT_STYLE_OPTIONS = ["", "stationary", "gliding", "flash"] as const;
const SEVERITY_OPTIONS = ["info", "warning", "contraindication"] as const;
const CONTRA_CLASS_OPTIONS = ["", "absolute", "relative", "none"] as const;

const fieldLabel = "block text-[11px] font-semibold text-slate-500";

export function QuickCreateMasterForm({
  config,
  onCancel,
  onSuccess,
}: {
  config: QuickCreateConfig;
  /** Vazgeç → picker PICK view'ına dön (dialog KAPANMAZ). */
  onCancel: () => void;
  /** create+attach başarıyla döndü (parent picker'ı kapatmış olabilir veya PICK'e dönecek). */
  onSuccess: () => void;
}) {
  const isTechnique = config.entity === "technique";
  const t = useTranslations("cupping.protocols.quickCreate");
  const tc = useTranslations("cupping.common");
  const vocab = useCuppingVocab();
  const errText = useKupaErrorText();

  // Ortak birincil ad alanı (technique.name / safety.title).
  const [name, setName] = useState("");
  // Technique alanları
  const [techniqueType, setTechniqueType] = useState("");
  const [movementStyle, setMovementStyle] = useState("");
  const [description, setDescription] = useState("");
  // Safety alanları
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "contraindication">("warning");
  const [contraClass, setContraClass] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normName = normalizeMasterName(name);
  const duplicate = useMemo(
    () => (normName ? config.existing.find((e) => normalizeMasterName(e.label) === normName) ?? null : null),
    [normName, config.existing],
  );

  async function doCreate() {
    if (!name.trim()) {
      setError(isTechnique ? t("techniqueNameRequired") : t("titleRequired"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (config.entity === "technique") {
        await config.onCreate({
          name: name.trim(),
          technique_type: techniqueType || null,
          movement_style: movementStyle || null,
          description: description.trim() || null,
        });
      } else {
        await config.onCreate({
          title: name.trim(),
          content: content.trim() || null,
          severity,
          // severity kontrendikasyon değilse sınıf DAİMA temizlenir.
          contraindication_class: severity === "contraindication" ? contraClass || null : null,
        });
      }
      onSuccess();
    } catch (e) {
      // Create hatası → form açık kalır, kullanıcı dostu mesaj (ham DB hatası değil).
      setError(errText(e, t("createFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {/* Birincil ad */}
          <label className="block">
            <span className={fieldLabel}>{isTechnique ? t("techniqueNameLabel") : t("titleLabel")}</span>
            <input
              autoFocus
              className={`mt-1 ${kupaInput}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isTechnique ? t("techniquePlaceholder") : t("titlePlaceholder")}
              aria-label={isTechnique ? t("techniqueNameAria") : t("titleAria")}
            />
          </label>

          {/* Advisory duplicate (agresif değil; yalnız normalize-exact eşleşme) */}
          {duplicate ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] text-amber-800">
                {t("duplicatePrefix")} <b>{duplicate.label}</b>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={kupaBtnPrimary}
                  onClick={() => config.onUseExisting(duplicate.id)}
                >
                  {t("useExisting")}
                </button>
                <button type="button" disabled={busy} className={kupaBtnGhost} onClick={doCreate}>
                  {t("createAnyway")}
                </button>
              </div>
            </div>
          ) : null}

          {/* Technique alanları */}
          {config.entity === "technique" ? (
            <>
              <label className="block">
                <span className={fieldLabel}>{t("typeLabel")}</span>
                <select
                  className={`mt-1 ${kupaInput}`}
                  value={techniqueType}
                  onChange={(e) => setTechniqueType(e.target.value)}
                  aria-label={t("typeLabel")}
                >
                  {TECHNIQUE_TYPE_OPTIONS.map((v) => (
                    <option key={v} value={v}>{vocab.techniqueType(v || null)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>{t("movementLabel")}</span>
                <select
                  className={`mt-1 ${kupaInput}`}
                  value={movementStyle}
                  onChange={(e) => setMovementStyle(e.target.value)}
                  aria-label={t("movementAria")}
                >
                  {MOVEMENT_STYLE_OPTIONS.map((v) => (
                    <option key={v} value={v}>{vocab.movementStyle(v || null)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>{t("shortDescLabel")}</span>
                <textarea
                  className={`mt-1 ${kupaInput}`}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("optional")}
                  aria-label={t("shortDescAria")}
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className={fieldLabel}>{t("descLabel")}</span>
                <textarea
                  className={`mt-1 ${kupaInput}`}
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t("optional")}
                  aria-label={t("descLabel")}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>{t("severityLabel")}</span>
                <select
                  className={`mt-1 ${kupaInput}`}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as "info" | "warning" | "contraindication")}
                  aria-label={t("severityLabel")}
                >
                  {SEVERITY_OPTIONS.map((v) => (
                    <option key={v} value={v}>{vocab.severity(v)}</option>
                  ))}
                </select>
              </label>
              {severity === "contraindication" ? (
                <label className="block">
                  <span className={fieldLabel}>{t("contraLabel")}</span>
                  <select
                    className={`mt-1 ${kupaInput}`}
                    value={contraClass}
                    onChange={(e) => setContraClass(e.target.value)}
                    aria-label={t("contraAria")}
                  >
                    {CONTRA_CLASS_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v ? vocab.contraClass(v) : vocab.unspecified}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}

          {error ? <p className="text-[12px] font-medium text-rose-600">{error}</p> : null}
        </div>
      </div>

      {/* Aksiyonlar (her zaman görünür; dup varken birincil oluştur GİZLİ → sessiz create yok) */}
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3.5">
        <button type="button" className={kupaBtnGhost} onClick={onCancel}>
          {tc("cancel")}
        </button>
        {!duplicate ? (
          <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={doCreate}>
            {t("createAndAdd")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
