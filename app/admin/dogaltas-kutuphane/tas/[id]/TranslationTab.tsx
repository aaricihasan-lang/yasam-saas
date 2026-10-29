"use client";

/**
 * Taş bazında çeviri yönetimi. Alan / taş bazında tek adım "Kaydet ve Yayınla" + bildirimde "Geri al".
 * Kaynak metni değişmiş (stale) çeviri yayınlanamaz; kaynak metin (Türkçe) gösterimi alanları çeviri olarak etiketlenmez.
 */

import { STONE_LIBRARY_DISPLAY_FIELDS } from "@/lib/stone-library/contract";
import { FIELD_LABEL } from "@/app/dogaltas/kutuphane/_shared/labels";
import { OwnerPublishRelation } from "../../_components/OwnerShell";
import s from "../../_components/owner.module.css";
import type { ActFn, SourceRecord, Translation } from "./types";

type Props = { translations: Translation[]; records: SourceRecord[]; busy: boolean; act: ActFn };

export function TranslationTab({ translations, records, busy, act }: Props) {
  const rec = (field: string, lang: "tr" | "en") => records.find((r) => r.field_key === field && r.lang === lang && r.is_current && !r.deleted_at)?.content ?? "";
  const eligibleFields = translations.filter((t) => t.display_kind === "verified_translation" && !t.stale && !t.published).map((t) => t.field);
  const eligible = eligibleFields.length;
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
            {publishedN} alan yayında · {eligible} alan yayınlanabilir.
          </p>
        </div>
        <div className={s.rowActions}>
          <button type="button" className={`btn-success ${s.btn}`} disabled={busy || eligible === 0} onClick={() => void act({ action: "translation", op: "publish" }, { success: "Bu taşın çevirileri yayınlandı.", undo: eligibleFields.map((field) => ({ action: "translation", field, op: "unpublish" })) })}>
            Bu taşın çevirilerini yayınla ({eligible} alan)
          </button>
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
                  <span className={`${s.pill} ${s.pillGold}`}>Yayında değil</span>
                )}
              </div>
              {t?.stale ? <p className={`${s.flag} ${s.flagBad}`}>Kaynak metin değişti. Çeviri yeniden doğrulanana kadar yayınlanamaz; uzmana kaynak Türkçe metin gösterilir.</p> : null}
              {fallback ? <p className={s.flag}>Bu alanda kaynak metin (Türkçe) gösterilir; doğrulanmış çeviri olarak yayınlanmaz ve etiketlenmez.</p> : null}
              <div className={s.tcols}>
                {cell("Kaynak metin (İngilizce)", keywords ? "" : rec(field, "en"))}
                {cell("Kaynak metin (Türkçe)", keywords ? "" : rec(field, "tr"))}
                {cell(fallback ? "Gösterilecek metin" : "Doğrulanmış Türkçe çeviri", t?.content_tr ?? "", !fallback && !!t)}
              </div>
              {t && !fallback ? (
                <div className={`${s.rowActions} ${s.rowActionsLeft}`}>
                  {t.published ? (
                    <button type="button" className={`btn-danger ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "translation", field, op: "unpublish" }, { success: `${FIELD_LABEL[field]}: çeviri yayından kaldırıldı.`, undo: t.stale ? null : { action: "translation", field, op: "publish" } })}>
                      Yayından kaldır
                    </button>
                  ) : (
                    <button type="button" className={`btn-success ${s.btn} ${s.btnSm}`} disabled={busy || t.stale} onClick={() => void act({ action: "translation", field, op: "publish" }, { success: `${FIELD_LABEL[field]}: çeviri yayınlandı.`, undo: { action: "translation", field, op: "unpublish" } })}>
                      Kaydet ve Yayınla
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
