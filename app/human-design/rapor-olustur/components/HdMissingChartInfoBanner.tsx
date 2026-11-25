"use client";

import { useTranslations } from "next-intl";
import type { HumanDesignChart } from "@/lib/human-design/types";

/**
 * HD-1B — Eksik Harita Bilgileri Uyarısı.
 *
 * Saf eksik-alan tespiti + engelleyici-olmayan bilgilendirme banner'ı.
 * Bu dosya YALNIZ sunum ve callback sözleşmesi taşır: DB/API/build/save YOK.
 *
 * Kilitli veri sözleşmesi (bkz. HD-1B analiz):
 * - Storage değeri null / [] üzerinden çalışır; display'deki "—" fallback'i DEĞİL.
 * - Strateji AYRI alan değildir (Tip'ten türetilir) → ayrı eksik olarak listelenmez.
 * - Reflector-farkında: type_code === "reflector" iken definition_code=null,
 *   active_centers=[] ve channels=[] GEÇERLİDİR → eksik sayılmaz.
 * - type_code === null iken Reflector belirsizliği çözülemez → yalnız "Tip"
 *   gösterilir; Tanım/Merkezler/Kanallar ayrıca gösterilmez.
 */

// Deterministik sabit sıra — hem tespit hem gösterim bu sıraya göre.
export const HD_MISSING_FIELD_ORDER = [
  "Tip",
  "Otorite",
  "Profil",
  "Tanım",
  "Merkezler",
  "Kanallar",
  "Kapılar",
] as const;

export type HdMissingChartField = (typeof HD_MISSING_FIELD_ORDER)[number];

// I18N (HD-B): alan kimliği (yukarıdaki TR değerler) DEĞİŞMEZ — yalnız görünen ad `hd.reportBuilder.missing.field.*`.
const FIELD_KEY: Record<HdMissingChartField, "type" | "authority" | "profile" | "definition" | "centers" | "channels" | "gates"> = {
  Tip: "type",
  Otorite: "authority",
  Profil: "profile",
  Tanım: "definition", // i18n-ignore: alan kimliği (HD_MISSING_FIELD_ORDER anahtarı; gösterim katalogdan)
  Merkezler: "centers",
  Kanallar: "channels",
  Kapılar: "gates", // i18n-ignore: alan kimliği (HD_MISSING_FIELD_ORDER anahtarı; gösterim katalogdan)
};

// Gerçek array VE en az bir eleman. (Kör falsy DEĞİL; boş/eksik ayrı değerlendirilir.)
function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/**
 * Saf eksik-alan tespiti. Girdi mevcut HumanDesignChart; çıktı deterministik
 * sıralı eksik-etiket listesi. Eksik değerlere varsayılan veri YAZMAZ.
 */
export function detectMissingChartInfo(chart: HumanDesignChart | null): HdMissingChartField[] {
  if (!chart) return [];

  const found = new Set<HdMissingChartField>();

  // Her gerçek haritada bulunan, geçerli-boşu olmayan alanlar → null ise kesin eksik.
  if (chart.type_code == null) found.add("Tip");
  if (chart.authority_code == null) found.add("Otorite");
  if (chart.profile_code == null) found.add("Profil");

  // Reflector-belirsizliği olan alanlar YALNIZ Tip biliniyor VE reflector DEĞİL iken.
  // (Reflector için tanımsız-tanım / boş-merkez / boş-kanal GEÇERLİDİR.)
  if (chart.type_code != null && chart.type_code !== "reflector") {
    if (chart.definition_code == null) found.add("Tanım");
    if (!isNonEmptyArray(chart.active_centers)) found.add("Merkezler");
    if (!isNonEmptyArray(chart.channels)) found.add("Kanallar");
  }

  // Kapılar: gerçek haritada daima aktivasyon vardır → geçerli boş yok, her zaman kontrol edilir.
  if (!isNonEmptyArray(chart.gates)) found.add("Kapılar");

  // Deterministik sıra: sabit sırayı filtrele (push sırasından bağımsız).
  return HD_MISSING_FIELD_ORDER.filter((f) => found.has(f));
}

type Props = {
  missing: HdMissingChartField[];
  /** "Eksikleri Tamamla" — dirty-farkında navigasyon üst bileşende yürütülür. */
  onComplete: () => void;
  /** "Mevcut Bilgilerle Devam Et" — yalnız banner'ı kapatır (dismiss). */
  onContinue: () => void;
};

export function HdMissingChartInfoBanner({ missing, onComplete, onContinue }: Props) {
  const t = useTranslations("hd.reportBuilder.missing");
  if (missing.length === 0) return null;
  // Strateji ayrı alan değil; yalnız Tip eksikse küçük açıklama.
  const showStrategyNote = missing.includes("Tip");

  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 ring-1 ring-amber-100/60 sm:px-5 sm:py-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber-500 text-sm font-black text-white"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-800">{t("title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700/90">
            {t("description")}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((field) => (
              <span
                key={field}
                className="rounded-full border border-amber-300/70 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"
              >
                {t(`field.${FIELD_KEY[field]}`)}
              </span>
            ))}
          </div>

          {showStrategyNote && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-700/80">
              {t("strategyNote")}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-500 to-orange-600 px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {t("complete")}
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300/70 bg-white/80 px-4 text-sm font-bold text-amber-800 shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {t("continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
