"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { calcPlaceNumber } from "@/lib/numeroloji/place";
import { analyzeBusinessCompatibility } from "@/lib/numeroloji/business";
import type { BusinessCompatibilityLayer, BusinessIdentityVariant } from "@/lib/numeroloji/business";
import { NumerolojiTarihInput } from "@/components/numeroloji/NumerolojiTarihInput";
import { businessNameDigitGroups, parsePlaceNumberInput, placeInputMessage, placeInputMessageEn } from "../utils/placeInput";

// ─────────────────────────────────────────────────────────────────────────────
// EV / OFİS SAYISI (Motor A, kitap 1) + İŞYERİ UYUMU (Motor B, kitap 2)
// İKİ MOTOR BİRBİRİNDEN BAĞIMSIZDIR — ortak/global skor YOKTUR.
// Hesaplar lib/numeroloji/place + lib/numeroloji/business'ten gelir.
// ─────────────────────────────────────────────────────────────────────────────

const SAYI_RENK: Record<number, { chip: string; border: string; glow: string }> = {
  1: { chip: "from-rose-500 to-red-500",      border: "md:border-rose-200/70",   glow: "md:shadow-[0_8px_28px_rgba(244,63,94,0.32)]" },
  2: { chip: "from-orange-500 to-amber-400",  border: "md:border-orange-200/70", glow: "md:shadow-[0_8px_28px_rgba(249,115,22,0.30)]" },
  3: { chip: "from-amber-400 to-yellow-400",  border: "md:border-amber-200/70",  glow: "md:shadow-[0_8px_28px_rgba(251,191,36,0.30)]" },
  4: { chip: "from-lime-500 to-green-500",    border: "md:border-lime-200/70",   glow: "md:shadow-[0_8px_28px_rgba(132,204,22,0.30)]" },
  5: { chip: "from-emerald-500 to-teal-500",  border: "md:border-emerald-200/70",glow: "md:shadow-[0_8px_28px_rgba(16,185,129,0.30)]" },
  6: { chip: "from-teal-500 to-cyan-500",     border: "md:border-teal-200/70",   glow: "md:shadow-[0_8px_28px_rgba(20,184,166,0.30)]" },
  7: { chip: "from-sky-500 to-blue-500",      border: "md:border-sky-200/70",    glow: "md:shadow-[0_8px_28px_rgba(14,165,233,0.30)]" },
  8: { chip: "from-indigo-500 to-violet-500", border: "md:border-indigo-200/70", glow: "md:shadow-[0_8px_28px_rgba(99,102,241,0.32)]" },
  9: { chip: "from-violet-600 to-fuchsia-500",border: "md:border-violet-200/70", glow: "md:shadow-[0_8px_28px_rgba(139,92,246,0.35)]" },
};

const inputClass =
  "h-9 w-full rounded-lg border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";
const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500";
const cardClass =
  "min-w-0 border-b border-slate-100/70 pb-3 last:border-b-0 last:pb-0 md:border md:border-violet-200/70 md:rounded-[12px] md:bg-white/90 md:p-3 md:pb-3 md:shadow-[0_0_10px_rgba(139,92,246,0.05)] md:last:border md:last:pb-3";

function formatAdInput(raw: string): string {
  return raw.replace(/(?:^|[ ])[\wğüşıöçĞÜŞİÖÇ]/gu, (ch) => ch.toLocaleUpperCase("tr-TR"));
}

/** Bir işyeri katmanının sonucunu (yüzde/etiket veya nötr kaynak mesajı) render eder. */
function LayerResult({ layer }: { layer: BusinessCompatibilityLayer }) {
  const t = useTranslations("numerology.tabs.place");
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  if (layer.resultStatus === "COMPUTED" && layer.compatibilityLabel) {
    // I18N: TR'de motor etiketi birebir; EN'de kanonik alanlardan (yüzde + kutup kodu) çizilir.
    const label =
      isSourceLocale || layer.compatibilityPercent === null || layer.polarity === null
        ? layer.compatibilityLabel
        : t(layer.polarity === "UYUMLU" ? "compatibleLabel" : "incompatibleLabel", { percent: String(layer.compatibilityPercent) });
    return (
      <span className={`text-sm font-black ${layer.polarity === "UYUMLU" ? "text-emerald-600" : "text-rose-600"}`}>
        {label}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-slate-400">
      {t("noPercentRule")}
    </span>
  );
}

function VariantCard({ variant }: { variant: BusinessIdentityVariant }) {
  const t = useTranslations("numerology.tabs.place");
  const title = variant.mode === "name" ? t("modeName") : t("modeNameSurname");
  return (
    <div className="min-w-0 space-y-2 rounded-[12px] border border-teal-200/60 bg-teal-50/30 p-2.5 md:p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">{title}</p>

      {/* ① Kişi Temel Uyumu */}
      <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-200/60">
        <p className="text-[10px] font-bold text-slate-700">{t("layer1Title")}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {t("nameLabel")} <b className="text-slate-700">{variant.personNameValue}</b> · {t("birthLabel")} <b className="text-slate-700">{variant.birthDateRawSum}</b> · {t("totalLabel")} <b className="text-slate-700">{variant.personBaseValue}</b>
        </p>
        <div className="mt-1"><LayerResult layer={variant.personBase} /></div>
      </div>

      {/* ② İşyeri Adı Uyumu */}
      <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-200/60">
        <p className="text-[10px] font-bold text-slate-700">{t("layer2Title")}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {t("businessLabel")} <b className="text-slate-700">{variant.businessNameValue}</b> · {variant.personBaseValue} + {variant.businessNameValue} = <b className="text-slate-700">{variant.personBusinessTotal}</b>
        </p>
        <div className="mt-1"><LayerResult layer={variant.businessName} /></div>
      </div>

      {/* ③ Açılış Tarihi Etkisi */}
      <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-200/60">
        <p className="text-[10px] font-bold text-slate-700">{t("layer3Title")}</p>
        {variant.openingDate === null ? (
          <p className="mt-0.5 text-[11px] text-slate-400">{t("openingMissing")}</p>
        ) : !variant.openingDate.valid ? (
          <p className="mt-0.5 text-[11px] font-semibold text-rose-500">{t("openingInvalid")}</p>
        ) : (
          <>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {t("openingLabel")} <b className="text-slate-700">{variant.openingDate.rawSum}</b> · {variant.personBusinessTotal} + {variant.openingDate.rawSum} = <b className="text-slate-700">{variant.openingDate.finalTotal}</b>
            </p>
            <div className="mt-1">{variant.openingDate.classification && <LayerResult layer={variant.openingDate.classification} />}</div>
          </>
        )}
      </div>
    </div>
  );
}

export function NumerolojiEvIsYeriSayisiTab() {
  const t = useTranslations("numerology.tabs.place");
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  // ── Motor A state ──
  const [kapiNoRaw, setKapiNoRaw] = useState("");
  const [daireNoRaw, setDaireNoRaw] = useState("");
  const [not, setNot] = useState("");

  // ── Motor B state ──
  const [bName, setBName] = useState("");
  const [bSurname, setBSurname] = useState("");
  const [bBirth, setBBirth] = useState("");
  const [bBusiness, setBBusiness] = useState("");
  const [bOpening, setBOpening] = useState("");

  // D4: giriş SESSİZCE temizlenmez; hesap yine yalnız rakamlarla (kaynak yöntem) yapılır, dönüşüm gösterilir.
  const kapiIn = parsePlaceNumberInput(kapiNoRaw);
  const daireIn = parsePlaceNumberInput(daireNoRaw);
  const placeMsgs = (
    isSourceLocale
      ? [placeInputMessage("Kapı / Apartman No", kapiIn), placeInputMessage("Daire No", daireIn)]
      : [placeInputMessageEn(t, t("doorNo"), kapiIn), placeInputMessageEn(t, t("unitNo"), daireIn)]
  ).filter((m) => m !== null);
  const place = kapiIn.status === "ok" && daireIn.status === "ok" ? calcPlaceNumber(kapiIn.value, daireIn.value) : null;
  const kapiShown = kapiIn.status === "ok" && kapiIn.altered ? kapiIn.raw : null;
  const daireShown = daireIn.status === "ok" && daireIn.altered ? daireIn.raw : null;
  const businessDigits = businessNameDigitGroups(bBusiness);
  const renkSet = place ? (SAYI_RENK[place.reducedNumber] ?? SAYI_RENK[9]) : null;

  const business = analyzeBusinessCompatibility({
    name: bName,
    surname: bSurname || undefined,
    birthDate: bBirth,
    businessName: bBusiness,
    openingDate: bOpening || undefined,
  });
  const businessAttempted = bName.trim() !== "" && bBusiness.trim() !== "" && bBirth.trim() !== "";

  return (
    <div className="space-y-4">
      {/* ══════════ A) EV / OFİS SAYISI ══════════ */}
      <div className="space-y-3">
        <div className="px-[clamp(8px,2.5vw,14px)] py-2.5 md:rounded-[12px] md:border md:border-violet-200/60 md:bg-gradient-to-r md:from-violet-50/80 md:to-fuchsia-50/60 md:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-black uppercase tracking-wider text-violet-600">{t("aTitle")}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {t("aSub")}
          </p>
        </div>

        <div className={cardClass}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{t("doorNo")}</label>
              <input type="text" inputMode="numeric" maxLength={32} value={kapiNoRaw} onChange={(e) => setKapiNoRaw(e.target.value)} placeholder="4" className={inputClass} data-testid="noj-place-kapi" />
            </div>
            <div>
              <label className={labelClass}>{t("unitNo")}</label>
              <input type="text" inputMode="numeric" maxLength={32} value={daireNoRaw} onChange={(e) => setDaireNoRaw(e.target.value)} placeholder="11" className={inputClass} data-testid="noj-place-daire" />
            </div>
          </div>
          {placeMsgs.length > 0 ? (
            <div className="mt-2 space-y-1" data-testid="noj-place-msgs">
              {placeMsgs.map((m) => (
                <p key={m.text} className={`text-[11px] font-semibold ${m.tone === "error" ? "text-rose-600" : "text-amber-700"}`}>{m.text}</p>
              ))}
              {placeMsgs.some((m) => m.tone === "info") ? (
                <p className="text-[10px] text-slate-500">{t("noRuleForLetters")}</p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2">
            <label className={labelClass}>{t("noteLabel")}</label>
            <input type="text" value={not} onChange={(e) => setNot(e.target.value)} placeholder={t("notePlaceholder")} className={inputClass} />
          </div>
        </div>

        {place && renkSet ? (
          <>
            <div className={cardClass}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600">{t("steps")}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-black text-slate-700">
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-800">{kapiShown ? `${kapiShown} → ${place.buildingNumber}` : place.buildingNumber}</span>
                <span className="text-slate-400">+</span>
                <span className="rounded-md bg-fuchsia-100 px-2 py-0.5 text-fuchsia-800">{daireShown ? `${daireShown} → ${place.unitNumber}` : place.unitNumber}</span>
                <span className="text-slate-400">=</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{place.rawTotal}</span>
                {place.steps.map((adim, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="text-slate-300">→</span>
                    <span className="text-[11px] font-semibold text-slate-500">{adim}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className={`relative min-w-0 overflow-hidden md:rounded-[14px] md:border md:bg-white/95 md:p-4 ${renkSet.border} ${renkSet.glow}`}>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{t("placeNumber")}</p>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl font-black text-white shadow-lg ${renkSet.chip}`}>
                  {place.reducedNumber}
                </span>
                <div className="min-w-0">
                  {not.trim() && <p className="mb-0.5 text-[11px] font-semibold text-slate-400">{not.trim()}</p>}
                  <p className="text-xs text-slate-500 leading-snug">
                    No:{kapiShown ?? place.buildingNumber} · D:{daireShown ?? place.unitNumber}
                    {place.rawTotal !== place.reducedNumber ? ` → ${place.rawTotal} → ${place.reducedNumber}` : ` → ${place.reducedNumber}`}
                  </p>
                </div>
              </div>
            </div>

            {place.interpretation && (
              <div className={cardClass}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600">{t("meaningOf", { n: String(place.reducedNumber) })}</p>
                <p className="text-xs leading-[1.75] text-slate-700">{place.interpretation}</p>
              </div>
            )}
          </>
        ) : (
          <div className="min-w-0 px-[clamp(8px,2.5vw,14px)] py-6 text-center md:rounded-[12px] md:border-2 md:border-dashed md:border-violet-200/60 md:bg-white/60 md:px-4">
            <p className="text-xs font-semibold text-slate-400">
              {kapiIn.status === "empty" || daireIn.status === "empty" ? t("emptyPrompt") : t("invalidPrompt")}
            </p>
          </div>
        )}
      </div>

      {/* ══════════ B) İŞYERİ UYUMU ══════════ */}
      <div className="space-y-3">
        <div className="px-[clamp(8px,2.5vw,14px)] py-2.5 md:rounded-[12px] md:border md:border-teal-200/60 md:bg-gradient-to-r md:from-teal-50/80 md:to-emerald-50/60 md:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-black uppercase tracking-wider text-teal-700">{t("bTitle")}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {t("bSub")}
          </p>
        </div>

        <div className={cardClass}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{t("firstName")}</label>
              <input type="text" value={bName} onChange={(e) => setBName(formatAdInput(e.target.value))} placeholder="Ahmed" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t("surnameOptional")}</label>
              <input type="text" value={bSurname} onChange={(e) => setBSurname(e.target.value.toLocaleUpperCase("tr-TR"))} placeholder="—" className={inputClass} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{t("birthDate")}</label>
              <NumerolojiTarihInput value={bBirth} onChange={setBBirth} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t("businessName")}</label>
              <input type="text" value={bBusiness} onChange={(e) => setBBusiness(e.target.value.toLocaleUpperCase("tr-TR"))} placeholder="CANTAŞ" className={inputClass} />
            </div>
          </div>
          <div className="mt-2">
            <label className={labelClass}>{t("openingDate")}</label>
            <NumerolojiTarihInput value={bOpening} onChange={setBOpening} className={inputClass} />
            <p className="mt-1 text-[10px] text-slate-400">{t("openingHint")}</p>
          </div>
        </div>

        {business ? (
          <>
            {business.variants.map((v) => (
              <VariantCard key={v.mode} variant={v} />
            ))}
            {business.unsupportedCharacters.length > 0 && (
              <p className="text-[10px] text-amber-600">{t("unsupportedLetters", { letters: business.unsupportedCharacters.join(", ") })}</p>
            )}
            {businessDigits.length > 0 && (
              <p className="text-[10px] text-amber-600" data-testid="noj-business-digits">
                {t("businessDigits", { digits: businessDigits.join(", ") })}
              </p>
            )}
            <div className="flex min-w-0 items-start gap-2 rounded-[10px] border border-slate-200/80 bg-slate-50/80 px-3 py-2">
              <span className="mt-px shrink-0 text-slate-400 text-sm">ℹ</span>
              <p className="text-[10px] leading-[1.6] text-slate-500">
                {t("layersInfo")}
              </p>
            </div>
          </>
        ) : (
          <div className="min-w-0 px-[clamp(8px,2.5vw,14px)] py-6 text-center md:rounded-[12px] md:border-2 md:border-dashed md:border-teal-200/60 md:bg-white/60 md:px-4">
            <p className="text-xs font-semibold text-slate-400">
              {businessAttempted ? t("birthInvalid") : t("businessPrompt")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
