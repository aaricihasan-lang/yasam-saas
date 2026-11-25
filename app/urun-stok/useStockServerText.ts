"use client";

/**
 * Ürün & Stok — lib/sunucu kaynaklı Türkçe metinlerin ekran dilinde gösterimi (QA K3-03, Ajan B; F1-R3 D2).
 *
 * lib/urun-stok ve API'ler bugün Türkçe metin döndürüyor (testlerce kilitli; lib metinleri DEĞİŞMEZ).
 *  - Kaynak dilde (tr) metin BUGÜNKÜ GİBİ birebir gösterilir → Türkçe regresyonu yok.
 *  - Diğer dillerde Türkçe metin ekrana yapıştırılmaz. F1-R3: metin önce dil-bağımsız koda çevrilir
 *    (lib/urun-stok/stockErrorCodes.stockMessageCode — saf; yalnız GÖSTERİM) ve `stock.errors.codes.<KOD>`
 *    gösterilir (ör. "Yetersiz stok. Mevcut: 5 adet" → "Insufficient stock. Available: 5 pcs"); kod yoksa
 *    çağıranın çevrilmiş yedeği ya da genel metin (eski davranış).
 * canli-stok'taki `isSourceLocale` kalıbının ortak hâli. Kontrol akışı bu metne bağlanmaz.
 */
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { ineligibleReasonKey, stockMessageCode } from "@/lib/urun-stok/stockErrorCodes";
import { describeVisibilityOutcome } from "@/lib/urun-stok/salesVisibility";
import { describeCancelOutcomes, type CancelOutcome } from "@/lib/urun-stok/salesApi";

/** Kanonik birim kelimeleri (lib "adet" / "ml" / "gram") — yalnız GÖSTERİM eşlemesi. */
const UNIT_RE = /^(.*?)\s*(adet|ml|gram)$/;

export function useStockServerText() {
  const locale = useLocale();
  const t = useTranslations("stock.common.msg");
  const te = useTranslations("stock.errors");
  return useMemo(() => {
    const isSourceLocale = locale === DEFAULT_LOCALE;
    /** Kanonik birim → ekran birimi ("5 adet" → "5 pcs"); TR'de girdi aynen. */
    const unit = (value: string): string => {
      if (isSourceLocale) return value;
      const m = UNIT_RE.exec(value.trim());
      return m && te.has(`units.${m[2]}`) ? `${m[1]} ${te(`units.${m[2]}`)}`.trim() : value;
    };
    /** Türkçe lib/sunucu metni (veya açık API kodu) → çevrilmiş metin; eşlenemezse null. */
    const fromCode = (text: unknown, code?: string | null): string | null => {
      const mc = code ? { code, params: {} as Record<string, string> } : stockMessageCode(typeof text === "string" ? text : null);
      if (!mc || !te.has(`codes.${mc.code}`)) return null;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(mc.params)) params[k] = k === "available" ? unit(v) : v;
      return te(`codes.${mc.code}`, params);
    };
    return {
      isSourceLocale,
      unit,
      /** `{error}` olarak gömülen ayrıntı: TR'de `String(error ?? "")` ile birebir; diğer dillerde koddan çeviri ya da genel ayrıntı. */
      detail: (error: unknown): string => (isSourceLocale ? String(error ?? "") : fromCode(error) ?? t("serverDetail")),
      /** `error ?? fallback` kalıbı: TR'de birebir; diğer dillerde koddan çeviri ya da çevrilmiş yedek. */
      text: (error: string | null | undefined, fallback: string): string =>
        isSourceLocale ? (error ?? fallback) : fromCode(error) ?? fallback,
      /** `e instanceof Error ? e.message : fallback` kalıbı: TR'de birebir; diğer dillerde koddan çeviri ya da yedek. */
      exception: (e: unknown, fallback: string): string =>
        isSourceLocale && e instanceof Error ? e.message : (e instanceof Error ? fromCode(e.message) : null) ?? fallback,
      /** Lib'deki Türkçe sabit (ör. DUPLICATE_SALE_MESSAGE): TR'de sabitin kendisi, diğer dillerde katalog karşılığı. */
      constant: (trText: string, translated: string): string => (isSourceLocale ? trText : translated),
      /** Fotoğraf seçimi hatası (lib photoValidation): TR'de birebir; diğer dilde koddan çeviri ya da genel metin. */
      photo: (error: string): string => (isSourceLocale ? error : fromCode(error) ?? te("codes.STK_PHOTO_FAILED")),
      /**
       * K3-05: kanonik seçenek değeri (OIL_TYPES, PACKAGE_TYPES, PRODUCT_GROUPS, MATERIALS, BOTTLE_VOLUMES …) → ekran etiketi.
       * DEĞER çevrilmez (DB'ye yazılır, karşılaştırılır); yalnız <option> metni. TR'de değerin kendisi; katalogda
       * olmayan (kullanıcının "Diğer" ile yazdığı serbest metin, doğaltaş tür kodları) aynen gösterilir.
       */
      option: (value: string): string => (isSourceLocale || !te.has(`options.${value}`) ? value : te(`options.${value}`)),
      /** Ekran sabiti: "Sepete eklendi." (tr birebir katalogdan). */
      addedToBasket: (): string => t("addedToBasket"),
      /** API `code` alanı biliniyorsa: TR'de metin birebir; diğer dilde stock.errors.codes.<code> ya da yedek. */
      coded: (error: string | null | undefined, code: string | null | undefined, fallback: string): string =>
        isSourceLocale ? (error ?? fallback) : fromCode(error, code) ?? fromCode(error) ?? fallback,
      /**
       * Görünürlük (listeden sil / geri al) sonucu: TR'de lib describeVisibilityOutcome birebir;
       * diğer dilde AYNI sayımlarla çevrilmiş metin (yalnız gösterim; sayım/karar lib'deki gibi).
       */
      visibilityOutcome: (
        action: "hide" | "unhide",
        r: { ok: boolean; changed?: number; unchanged?: number; notFound?: number; error?: string },
        skipped: number,
      ): string => {
        if (isSourceLocale) return describeVisibilityOutcome(action, r, skipped);
        if (!r.ok) return fromCode(r.error) ?? te("visibility.failed");
        const parts: string[] = [];
        const n = r.changed ?? 0;
        if (n > 0) parts.push(te(action === "hide" ? "visibility.hidden" : "visibility.unhidden", { n }));
        const already = (r.unchanged ?? 0) + skipped;
        if (already > 0) parts.push(te("visibility.already", { n: already }));
        if ((r.notFound ?? 0) > 0) parts.push(te("visibility.notFound", { n: r.notFound ?? 0 }));
        return parts.join(" ") || te("visibility.noChange");
      },
      /**
       * Toplu iptal sonucu: TR'de lib describeCancelOutcomes birebir; diğer dilde AYNI sayım kuralıyla
       * (salesApi.describeCancelOutcomes ile aynı dallar) çevrilmiş metin. Yalnız gösterim.
       */
      cancelOutcome: (outcomes: readonly CancelOutcome[]): string => {
        if (isSourceLocale) return describeCancelOutcomes(outcomes);
        let cancelled = 0, already = 0, failed = 0, notRestored = 0, unknown = 0;
        for (const o of outcomes) {
          if (!o.ok) { failed += 1; continue; }
          if (o.alreadyCancelled) { already += 1; continue; }
          cancelled += 1;
          if (o.notRestored == null) unknown += 1;
          else notRestored += o.notRestored;
        }
        const parts: string[] = [];
        if (cancelled > 0) {
          const head = te("cancel.head", { n: cancelled });
          if (notRestored > 0) parts.push(te("cancel.notRestored", { head, m: notRestored }));
          else if (unknown > 0) parts.push(te("cancel.unverified", { head }));
          else parts.push(te("cancel.restored", { head }));
        }
        if (already > 0) parts.push(te("cancel.already", { n: already }));
        if (failed > 0) parts.push(te("cancel.failed", { n: failed }));
        return parts.join(" ") || te("cancel.none");
      },
      /**
       * Onay diyaloğu "işleme alınmayacak kayıtlar" notu (diğer diller): lib confirmNotes ile aynı ilk 5 kayıt
       * + gerekçe; gerekçe lib Türkçesinden anahtara eşlenir (eşlenemezse gerekçesiz). TR'de çağrılmaz (lib birebir).
       */
      ineligibleNote: (ineligible: { rec: { name?: string; timestamp?: string }; reason: string }[]): string => {
        const items = ineligible.slice(0, 5).map((x) => {
          const label = `${x.rec.name || te("ineligible.saleNoun")} (${x.rec.timestamp ?? ""})`;
          const key = ineligibleReasonKey(x.reason);
          return key ? `${label} — ${te(`ineligible.reasons.${key}`)}` : label;
        });
        const more = ineligible.length > 5 ? te("ineligible.more", { n: ineligible.length - 5 }) : "";
        return te("ineligible.list", { count: ineligible.length, list: items.join("; "), more });
      },
    };
  }, [locale, t, te]);
}
