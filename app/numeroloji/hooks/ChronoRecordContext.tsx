"use client";

// I18N-0003 — Kronolojik görünürlük için KAYIT BAĞLAMI (istemci).
//
//   • `birthDate`: kaydın yapısal `birth_date` alanı. Ekran / düz metin / görsel rapor doğum yılını
//     önce buradan alır (chronoBirth.resolveChronoBirth); motor metnindeki "Doğum Tarihi:" satırı yalnız
//     eski kayıt / kaydedilmemiş hesap geri dönüşüdür. Karar çevrilmiş metne bağlı DEĞİLDİR.
//   • `restrictedLimitYear`: sunucu bu kaydı "Gelecek Yılları Göster" yetkisi olmadan süzdüyse
//     (`analysis_data.futureYearsView.restricted`), istemci yetki önbelleği ne derse desin sınır yılı
//     bu değeri AŞAMAZ (defense-in-depth; yer tutucular / yeniden hesaplanabilen Değişim gösterilmez).

import { createContext, useContext, type ReactNode } from "react";

export type ChronoRecordInfo = { birthDate: string | null; restrictedLimitYear: number | null };

const EMPTY: ChronoRecordInfo = { birthDate: null, restrictedLimitYear: null };
const Ctx = createContext<ChronoRecordInfo>(EMPTY);

/** analysis_data.futureYearsView → sunucu kısıtı (yoksa null). */
export function restrictedLimitYearOf(analysisData: unknown): number | null {
  if (!analysisData || typeof analysisData !== "object" || Array.isArray(analysisData)) return null;
  const v = (analysisData as Record<string, unknown>).futureYearsView;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.restricted !== true) return null;
  // Sunucu doğum tarihini çözemedi (belirsiz/bozuk kayıt) → hiçbir kronolojik dönem açılmaz.
  if (o.birthResolved === false) return 0;
  // Kısıt var ama sınır yılı okunamıyor → fail-closed: hiçbir dönem açılmaz (0 her başlangıç yılından küçük).
  return typeof o.limitYear === "number" && Number.isFinite(o.limitYear) ? o.limitYear : 0;
}

export function ChronoRecordProvider({
  birthDate,
  analysisData,
  children,
}: {
  birthDate?: string | null;
  analysisData?: unknown;
  children: ReactNode;
}) {
  const value: ChronoRecordInfo = {
    birthDate: typeof birthDate === "string" && birthDate.trim() ? birthDate.trim() : null,
    restrictedLimitYear: restrictedLimitYearOf(analysisData),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChronoRecord(): ChronoRecordInfo {
  return useContext(Ctx);
}
