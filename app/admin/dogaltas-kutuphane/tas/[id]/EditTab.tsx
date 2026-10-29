"use client";

import { useState } from "react";
import { FACET_ORDER, TEXT_FIELDS, type TextField } from "@/app/dogaltas/kutuphane/_shared/labels";
import { StoneForm, applyOwnerData, emptyForm, formToData, type FieldRefs, type FormErrors, type FormState, type StoneRef } from "../../_components/StoneForm";
import { fmtDate } from "../../_components/ownerApi";
import s from "../../_components/owner.module.css";
import type { ActFn, Layers, SourceDetail } from "./types";

type ShowToast = (msg: string, opts?: { tone?: "ok" | "err" }) => void;

/**
 * Kaynak tabanı: uzmanın owner katmanı olmadan göreceği metin. Doğrulanmış Türkçe çeviri (eskimemiş) kısa kaynak Türkçe metne
 * göre önceliklidir; taş yayınlanınca çeviri de yayınlanır (tek akış), bu yüzden ekran yayın durumundan bağımsız aynı metni gösterir.
 */
function buildBase(layers: Layers, source: SourceDetail | null, stones: StoneRef[], idToSlug: Map<string, string>): { base: FormState; refs: FieldRefs } {
  const f = emptyForm();
  const refs: FieldRefs = {};
  if (layers.stone.origin === "owner") {
    f.name_tr = layers.stone.name_tr;
    f.name_en = layers.stone.name_en ?? "";
    return { base: f, refs };
  }
  f.name_tr = source?.stone?.name_tr ?? layers.stone.name_tr;
  f.name_en = source?.stone?.name_en ?? layers.stone.name_en ?? "";
  const recs = (source?.records ?? []).filter((r) => r.is_current && !r.deleted_at && r.review_state !== "rejected");
  const rec = (field: string, lang: "tr" | "en") => recs.find((r) => r.field_key === field && r.lang === lang)?.content ?? "";
  const pubTr = (field: string) => layers.translations.find((t) => t.field === field && t.display_kind === "verified_translation" && !t.stale)?.content_tr ?? null;
  const anyTr = (field: string) => layers.translations.find((t) => t.field === field && t.display_kind === "verified_translation")?.content_tr;
  for (const k of TEXT_FIELDS) {
    f.text[k] = pubTr(k) ?? rec(k, "tr");
    refs[k] = { tr: rec(k, "tr"), en: rec(k, "en"), verified: anyTr(k) };
  }
  const facets = (source?.facets ?? []).filter((x) => !x.deleted_at && x.review_state !== "rejected" && x.visibility !== "hidden");
  const kwTr = facets.filter((x) => x.facet === "keyword" && x.lang === "tr").map((x) => x.value_text ?? x.value_key);
  const kwEn = facets.filter((x) => x.facet === "keyword" && x.lang === "en").map((x) => x.value_text ?? x.value_key);
  f.keywords = pubTr("keywords") ?? kwTr.join(" | ");
  refs.keywords = { tr: kwTr.join(" | "), en: kwEn.join(" | "), verified: anyTr("keywords") };
  for (const k of FACET_ORDER) f.facets[k] = [...new Set(facets.filter((x) => x.facet === k).map((x) => x.value_key))];
  const hard = facets.filter((x) => x.facet === "hardness" && typeof x.value_num === "number").map((x) => Number(x.value_num));
  if (hard.length) {
    f.hmin = String(Math.min(...hard));
    f.hmax = String(Math.max(...hard));
  }
  f.birth_month = [...new Set(facets.filter((x) => x.facet === "birth_month" && x.value_num != null).map((x) => Number(x.value_num)))];
  f.vib = [...new Set(facets.filter((x) => x.facet === "numerical_vibration" && x.value_num != null).map((x) => Number(x.value_num)))].join(", ");
  const known = new Set(stones.map((x) => x.slug));
  f.pairings = [...new Set(facets.filter((x) => x.facet === "pairing" && x.pair_stone_id).map((x) => idToSlug.get(x.pair_stone_id as string) ?? ""))].filter((x) => x && known.has(x));
  return { base: f, refs };
}

type Props = { layers: Layers; source: SourceDetail | null; stones: StoneRef[]; busy: boolean; act: ActFn; showToast: ShowToast };

export function EditTab(props: Props) {
  const { layers } = props;
  const maxV = layers.versions.reduce((m, v) => Math.max(m, v.version), 0);
  // Kayıt / sürüm değişiminde form yeni tabandan yeniden kurulur.
  return <EditForm key={`${layers.stone.owner_version_current ?? "src"}-${maxV}-${props.source ? 1 : 0}-${props.stones.length}`} {...props} maxV={maxV} />;
}

function EditForm({ layers, source, stones, busy, act, showToast, maxV }: Props & { maxV: number }) {
  const own = layers.stone.origin === "owner";
  const [init] = useState(() => {
    const idToSlug = new Map(stones.filter((x) => x.id).map((x) => [x.id as string, x.slug]));
    const { base, refs } = buildBase(layers, source, stones, idToSlug);
    const cur = layers.versions.find((v) => v.current)?.data ?? null;
    return { base, refs, form: applyOwnerData(base, cur) };
  });
  const [form, setForm] = useState<FormState>(init.form);
  const [errors, setErrors] = useState<FormErrors>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(init.form);

  // Tek "Kaydet": yeni owner sürümü kaydedilir ve hemen etkin olur; taşın yayın durumu değişmez (yayın üstteki düğmeden).
  const save = async () => {
    const { data, errors: errs } = formToData(form, own ? null : init.base);
    setErrors(errs);
    if (Object.keys(errs).length) {
      showToast("Formdaki hataları düzeltin.", { tone: "err" });
      return;
    }
    await act({ action: "save_apply", data, expected_version: maxV }, {
      success: "Kaydedildi.",
      undo: { action: "set_version", version: layers.stone.owner_version_current },
    });
  };

  const changedFields = (TEXT_FIELDS as readonly TextField[]).filter((k) => form.text[k].trim() !== init.base.text[k].trim()).length;

  return (
    <>
      <div className={s.editCols}>
        <div>
          <StoneForm
            form={form}
            onChange={setForm}
            base={own ? null : init.base}
            refs={init.refs}
            errors={errors}
            stones={stones}
            selfSlug={layers.stone.slug}
            originalName={own ? null : { tr: init.base.name_tr, en: init.base.name_en || null }}
          />
        </div>
        <aside className={s.vpanel}>
          <h2>Sürüm geçmişi</h2>
          {own ? null : (
            <div className={`${s.vrow} ${layers.stone.owner_version_current === null ? s.vrowCur : ""}`}>
              <div>
                <b>Özgün kaynak</b>
                <small>Kaynak ve doğrulanmış çeviri gösterimi</small>
              </div>
              {layers.stone.owner_version_current === null ? (
                <span className={`${s.pill} ${s.pillTeal}`}>Etkin</span>
              ) : (
                <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "set_version", version: null }, { success: "Özgün kaynağa dönüldü.", undo: { action: "set_version", version: layers.stone.owner_version_current } })}>
                  Özgün kaynağa dön
                </button>
              )}
            </div>
          )}
          {layers.versions.map((v) => (
            <div key={v.version} className={`${s.vrow} ${v.current ? s.vrowCur : ""}`}>
              <div>
                <b>Sürüm {v.version}</b>
                <small>
                  {fmtDate(v.created_at)}
                  {v.note ? ` · ${v.note}` : ""}
                </small>
              </div>
              {v.current ? (
                <span className={`${s.pill} ${s.pillTeal}`}>Etkin</span>
              ) : (
                <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "set_version", version: v.version }, { success: `Sürüm ${v.version} etkinleştirildi.`, undo: { action: "set_version", version: layers.stone.owner_version_current } })}>
                  Bu sürüme dön
                </button>
              )}
            </div>
          ))}
          {layers.versions.length ? null : <p className={s.note}>Henüz Owner düzenlemesi yok.</p>}
          <p className={s.note}>Her kayıt yeni bir sürüm oluşturur. Kaynak veriler hiçbir sürümde değişmez.</p>
        </aside>
      </div>
      <div className={s.savebar}>
        <span className={s.sbL}>{dirty ? `Kaydedilmemiş değişiklik var${changedFields ? ` · ${changedFields} metin alanı kaynaktan farklı` : ""}` : "Değişiklik yok"}</span>
        <div className={s.rowActions}>
          <button type="button" className={`btn-outline ${s.btn}`} disabled={!dirty || busy} onClick={() => setForm(init.form)}>
            Değişiklikleri at
          </button>
          <button type="button" className={`btn-success ${s.btn}`} disabled={busy || !dirty} onClick={() => void save()}>
            Kaydet
          </button>
        </div>
      </div>
    </>
  );
}
