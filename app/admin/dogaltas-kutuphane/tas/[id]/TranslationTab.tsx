"use client";

/**
 * Taş bazında çeviri karşılaştırması (İngilizce kaynak / Türkçe kaynak / doğrulanmış Türkçe çeviri). Ayrı çeviri yayın adımı
 * YOKTUR: taş yayınlanınca doğrulanmış çeviriler birlikte yayınlanır, yayından kaldırılınca birlikte kaldırılır.
 * Kaynak metni değişmiş (stale) çeviri yayınlanmaz; kaynak metin (Türkçe) gösterimi alanları çeviri olarak etiketlenmez.
 */

import { STONE_LIBRARY_DISPLAY_FIELDS } from "@/lib/stone-library/contract";
import { FIELD_LABEL } from "@/app/dogaltas/kutuphane/_shared/labels";
import { OwnerPublishRelation } from "../../_components/OwnerShell";
import s from "../../_components/owner.module.css";
import type { SourceRecord, Translation } from "./types";

type Props = { translations: Translation[]; records: SourceRecord[]; stonePublished: boolean };

export function TranslationTab({ translations, records, stonePublished }: Props) {
  const rec = (field: string, lang: "tr" | "en") => records.find((r) => r.field_key === field && r.lang === lang && r.is_current && !r.deleted_at)?.content ?? "";
  const verifiedN = translations.filter((t) => t.display_kind === "verified_translation" && !t.stale).length;
  const publishedN = translations.filter((t) => t.published).length;
  const rows = STONE_LIBRARY_DISPLAY_FIELDS.map((f) => ({ field: f, t: translations.find((x) => x.field === f) ?? null }));

  const cell = (title: string, text: string, ver = false) => (
    <div className={s.tc}>
      <h4>{title}</h4>
      <div className={`${s.cell} ${ver ? s.cellVer : ""}`}>{text || <span className={s.muted}>Kaynakta yok</span>}</div>
    </div>
  );

  return (
    <>
      <div className={s.tabToolbar}>
        <div>
          <h2>Çeviri</h2>
          <p className={s.note} style={{ margin: "2px 0 0" }}>
            {verifiedN} doğrulanmış çeviri alanı · {publishedN} alan yayında.{" "}
            {stonePublished ? "Taş yayında: doğrulanmış çeviriler uzmana gösterilir." : "Taş yayınlandığında doğrulanmış çeviriler birlikte yayınlanır."}
          </p>
        </div>
      </div>
      <OwnerPublishRelation />
      <div className={s.trlist}>
        {rows.map(({ field, t }) => {
          const fallback = t?.display_kind === "source_tr_fallback";
          const keywords = field === "keywords";
          return (
            <article key={field} className={s.trow}>
              <div className={s.trowHead}>
                <b>{FIELD_LABEL[field]}</b>
                {!t ? (
                  <span className={s.pill}>Çeviri yok</span>
                ) : fallback ? (
                  <span className={s.pill}>Kaynak metin (Türkçe) — çeviri yok</span>
                ) : t.stale ? (
                  <span className={`${s.pill} ${s.pillRose}`}>Kaynak metin değişti — yeniden doğrulama gerekiyor</span>
                ) : t.published ? (
                  <span className={`${s.pill} ${s.pillTeal}`}>Yayında</span>
                ) : (
                  <span className={`${s.pill} ${s.pillGold}`}>Taşla birlikte yayınlanacak</span>
                )}
              </div>
              {t?.stale ? <p className={`${s.flag} ${s.flagBad}`}>Kaynak metin değişti. Çeviri yeniden doğrulanana kadar yayınlanmaz; uzmana kaynak Türkçe metin gösterilir.</p> : null}
              {fallback ? <p className={s.flag}>Bu alanda kaynak metin (Türkçe) gösterilir; doğrulanmış çeviri olarak yayınlanmaz ve etiketlenmez.</p> : null}
              <div className={s.tcols}>
                {cell("Kaynak metin (İngilizce)", keywords ? "" : rec(field, "en"))}
                {cell("Kaynak metin (Türkçe)", keywords ? "" : rec(field, "tr"))}
                {cell(fallback ? "Gösterilecek metin" : "Doğrulanmış Türkçe çeviri", t?.content_tr ?? "", !fallback && !!t)}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
