"use client";

/**
 * Owner taş formu (yeni taş + düzenleme). Düzenlemede yalnız kaynağa göre DEĞİŞEN anahtarlar owner sürümüne yazılır
 * (kısmi katman); kaynak metinler hiç değişmez. Lisanslı metin bu dosyada yoktur — değerler çalışma anında API'den gelir.
 */

import { useState } from "react";
import type { StoneLibraryKeyedFacet } from "@/lib/stone-library/contract";
import { FACET_LABEL, FACET_ORDER, FIELD_LABEL, MONTHS, TEXT_FIELDS, splitKeywords, type TextField } from "@/app/dogaltas/kutuphane/_shared/labels";
import { VOCAB } from "./vocab";
import s from "./owner.module.css";

export type FormState = {
  name_tr: string;
  name_en: string;
  text: Record<TextField, string>;
  keywords: string;
  facets: Record<StoneLibraryKeyedFacet, string[]>;
  hmin: string;
  hmax: string;
  birth_month: number[];
  vib: string;
  pairings: string[];
};

export type StoneRef = { id?: string; slug: string; name_tr: string; name_en: string | null };
export type FieldRefs = Partial<Record<TextField | "keywords", { tr?: string; en?: string; verified?: string }>>;

export const emptyForm = (): FormState => ({
  name_tr: "",
  name_en: "",
  text: { description: "", meaning_spiritual: "", meaning_emotional: "", meaning_physical: "", affirmation: "" },
  keywords: "",
  facets: { color: [], chakra: [], zodiac: [], element: [], planet: [] },
  hmin: "",
  hmax: "",
  birth_month: [],
  vib: "",
  pairings: [],
});

const sameSet = (a: (string | number)[], b: (string | number)[]) => a.length === b.length && a.every((x) => b.includes(x));
const nums = (v: string) => v.split(/[,;\s]+/).filter(Boolean).map(Number);
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Owner verisinden form durumunu kurar (taban üzerine owner sürümü uygulanır). */
export function applyOwnerData(base: FormState, data: Record<string, unknown> | null | undefined): FormState {
  if (!data) return base;
  const f: FormState = structuredClone(base);
  if (typeof data.name_tr === "string") f.name_tr = data.name_tr;
  if (typeof data.name_en === "string") f.name_en = data.name_en;
  const fields = (data.fields ?? {}) as Record<string, unknown>;
  for (const k of TEXT_FIELDS) if (typeof fields[k] === "string") f.text[k] = fields[k] as string;
  const kw = data.keywords as { tr?: unknown } | undefined;
  if (kw && Array.isArray(kw.tr)) f.keywords = kw.tr.filter((x): x is string => typeof x === "string").join(" | ");
  const facets = (data.facets ?? {}) as Record<string, unknown>;
  for (const k of FACET_ORDER) if (Array.isArray(facets[k])) f.facets[k] = (facets[k] as unknown[]).filter((x): x is string => typeof x === "string");
  const h = data.hardness as { min?: unknown; max?: unknown } | undefined;
  if (h && typeof h.min === "number" && typeof h.max === "number") {
    f.hmin = String(h.min);
    f.hmax = String(h.max);
  }
  if (Array.isArray(data.birth_month)) f.birth_month = data.birth_month.filter((x): x is number => typeof x === "number");
  if (Array.isArray(data.numerical_vibration)) f.vib = data.numerical_vibration.join(", ");
  if (Array.isArray(data.pairings)) f.pairings = data.pairings.filter((x): x is string => typeof x === "string");
  return f;
}

export type FormErrors = Partial<Record<"name_tr" | "hardness" | "vib", string>>;

/** Form → owner verisi. Yeni taşta dolu tüm alanlar; düzenlemede yalnız kaynaktan farklı olanlar. */
export function formToData(form: FormState, base: FormState | null): { data: Record<string, unknown>; errors: FormErrors } {
  const errors: FormErrors = {};
  const data: Record<string, unknown> = {};
  const isNew = base === null;
  const b = base ?? emptyForm();
  const nameTr = form.name_tr.trim();
  if (!nameTr) errors.name_tr = "Türkçe ad zorunlu.";
  if (isNew || nameTr !== b.name_tr.trim()) if (nameTr) data.name_tr = nameTr;
  const nameEn = form.name_en.trim();
  if (nameEn && nameEn !== b.name_en.trim()) data.name_en = nameEn;
  const fields: Record<string, string> = {};
  for (const k of TEXT_FIELDS) {
    const v = form.text[k].trim();
    if (v && v !== b.text[k].trim()) fields[k] = v;
  }
  if (Object.keys(fields).length) data.fields = fields;
  const kw = splitKeywords(form.keywords);
  if (kw.length && !sameSet(kw, splitKeywords(b.keywords))) data.keywords = { tr: kw };
  const facets: Record<string, string[]> = {};
  for (const k of FACET_ORDER) if (!sameSet(form.facets[k], b.facets[k]) && (form.facets[k].length || !isNew)) facets[k] = form.facets[k];
  if (Object.keys(facets).length) data.facets = facets;
  const hmin = num(form.hmin);
  const hmax = num(form.hmax);
  if (hmin !== null || hmax !== null) {
    const lo = hmin ?? hmax;
    const hi = hmax ?? hmin;
    if (lo === null || hi === null || !Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi > 10 || lo > hi) errors.hardness = "Sertlik 0–10 arasında olmalı; en az değer en çok değerden büyük olamaz.";
    else if (isNew || form.hmin !== b.hmin || form.hmax !== b.hmax) data.hardness = { min: lo, max: hi };
  }
  if (!sameSet(form.birth_month, b.birth_month) && (form.birth_month.length || !isNew)) data.birth_month = [...form.birth_month].sort((x, y) => x - y);
  const vib = nums(form.vib);
  if (vib.some((x) => !Number.isFinite(x) || x < 0 || x > 9999)) errors.vib = "Sayısal titreşim 0–9999 arası sayılar olmalı (virgülle ayırın).";
  else if (!sameSet(vib, nums(b.vib)) && (vib.length || !isNew)) data.numerical_vibration = vib;
  if (!sameSet(form.pairings, b.pairings) && (form.pairings.length || !isNew)) data.pairings = form.pairings;
  return { data, errors };
}

type Props = {
  form: FormState;
  onChange: (f: FormState) => void;
  base: FormState | null;
  refs?: FieldRefs;
  errors: FormErrors;
  stones: StoneRef[];
  selfSlug: string | null;
  originalName?: { tr: string; en: string | null } | null;
};

export function StoneForm({ form, onChange, base, refs, errors, stones, selfSlug, originalName }: Props) {
  const [pairQ, setPairQ] = useState("");
  const set = (patch: Partial<FormState>) => onChange({ ...form, ...patch });
  const changed = (k: TextField) => base !== null && form.text[k].trim() !== base.text[k].trim();
  const nameOf = (slug: string) => stones.find((x) => x.slug === slug)?.name_tr ?? slug;
  const fq = pairQ.trim().toLocaleLowerCase("tr");
  const cands = fq
    ? stones.filter((x) => x.slug !== selfSlug && !form.pairings.includes(x.slug) && `${x.name_tr} ${x.name_en ?? ""}`.toLocaleLowerCase("tr").includes(fq)).slice(0, 8)
    : [];

  const refBlock = (k: TextField | "keywords") => {
    const r = refs?.[k];
    if (!r || (!r.tr && !r.en && !r.verified)) return null;
    return (
      <details className={s.ref}>
        <summary>Özgün değerleri göster</summary>
        <dl>
          {r.verified ? (
            <>
              <dt>Doğrulanmış Türkçe çeviri</dt>
              <dd>{r.verified}</dd>
            </>
          ) : null}
          <dt>Kaynak metin (Türkçe)</dt>
          <dd>{r.tr || "—"}</dd>
          <dt>Kaynak metin (İngilizce)</dt>
          <dd>{r.en || "—"}</dd>
        </dl>
      </details>
    );
  };

  return (
    <div className={s.eform}>
      <section className={s.esec}>
        <h2>Ad</h2>
        <div className={s.g2}>
          <label className={s.fl}>
            <span>
              Türkçe ad <small>(zorunlu)</small>
            </span>
            <input className={s.input} value={form.name_tr} maxLength={120} onChange={(e) => set({ name_tr: e.target.value })} aria-invalid={!!errors.name_tr} />
            {errors.name_tr ? <span className={s.errText}>{errors.name_tr}</span> : null}
          </label>
          <label className={s.fl}>
            <span>
              İngilizce ad <small>(isteğe bağlı)</small>
            </span>
            <input className={s.input} value={form.name_en} maxLength={120} onChange={(e) => set({ name_en: e.target.value })} />
          </label>
        </div>
        {originalName ? (
          <p className={s.note}>
            Özgün ad (kaynak, değişmez): <b>{originalName.tr}</b> / {originalName.en || "—"}. Burada yazdığınız ad yalnız gösterimde kullanılır.
          </p>
        ) : null}
      </section>

      <section className={s.esec}>
        <h2>İçerik</h2>
        {base ? <p className={s.note}>Değiştirdiğiniz alan &quot;Owner sürümü&quot; olarak ayrıca saklanır; kaynak metin ve doğrulanmış çeviri değişmez. Boş bırakılan alan kaynaktaki gösterime döner.</p> : null}
        {TEXT_FIELDS.map((k) => (
          <div key={k} className={`${s.fe} ${changed(k) ? s.feChanged : ""}`}>
            <label className={s.fl}>
              <span>
                {FIELD_LABEL[k]} {changed(k) ? <em className={s.chg}>Owner sürümü</em> : null}
              </span>
              <textarea
                className={s.textarea}
                rows={k === "affirmation" ? 2 : 5}
                value={form.text[k]}
                maxLength={20000}
                placeholder={base ? "" : "Boş bırakılabilir"}
                onChange={(e) => set({ text: { ...form.text, [k]: e.target.value } })}
              />
            </label>
            <div className={s.feFoot}>
              {refBlock(k)}
              {changed(k) && base ? (
                <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} onClick={() => set({ text: { ...form.text, [k]: base.text[k] } })}>
                  Özgün gösterime dön
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <div className={s.fe}>
          <label className={s.fl}>
            <span>{FIELD_LABEL.keywords}</span>
            <input className={s.input} value={form.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="Anahtar kelimeleri | ile ayırın (ör. Huzur | Denge)" />
          </label>
          <div className={s.feFoot}>{refBlock("keywords")}</div>
        </div>
      </section>

      <section className={s.esec}>
        <h2>Katalog bilgileri</h2>
        {FACET_ORDER.map((k) => (
          <fieldset key={k} className={s.fpick}>
            <legend>{FACET_LABEL[k]}</legend>
            <div className={s.chips}>
              {VOCAB[k].map(([key, label]) => {
                const on = form.facets[k].includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={s.chip}
                    aria-pressed={on}
                    onClick={() => set({ facets: { ...form.facets, [k]: on ? form.facets[k].filter((x) => x !== key) : [...form.facets[k], key] } })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className={s.g3}>
          <label className={s.fl}>
            <span>Sertlik (Mohs) — en az</span>
            <input className={s.input} inputMode="decimal" value={form.hmin} placeholder="Bilinmiyorsa boş" onChange={(e) => set({ hmin: e.target.value })} aria-invalid={!!errors.hardness} />
          </label>
          <label className={s.fl}>
            <span>Sertlik (Mohs) — en çok</span>
            <input className={s.input} inputMode="decimal" value={form.hmax} placeholder="Bilinmiyorsa boş" onChange={(e) => set({ hmax: e.target.value })} aria-invalid={!!errors.hardness} />
          </label>
          <label className={s.fl}>
            <span>Sayısal titreşim</span>
            <input className={s.input} inputMode="numeric" value={form.vib} placeholder="Ör. 3, 7" onChange={(e) => set({ vib: e.target.value })} aria-invalid={!!errors.vib} />
          </label>
        </div>
        {errors.hardness ? <p className={s.errText}>{errors.hardness}</p> : null}
        {errors.vib ? <p className={s.errText}>{errors.vib}</p> : null}
        <fieldset className={s.fpick}>
          <legend>Doğum ayı</legend>
          <div className={s.chips}>
            {MONTHS.map((m, i) => {
              const v = i + 1;
              const on = form.birth_month.includes(v);
              return (
                <button key={m} type="button" className={s.chip} aria-pressed={on} onClick={() => set({ birth_month: on ? form.birth_month.filter((x) => x !== v) : [...form.birth_month, v] })}>
                  {m}
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section className={s.esec}>
        <h2>Birlikte kullanılan taşlar</h2>
        <div className={s.chips}>
          {form.pairings.length ? (
            form.pairings.map((p) => (
              <span key={p} className={`${s.chip} ${s.chipStatic}`}>
                {nameOf(p)}
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} aria-label={`${nameOf(p)} eşleştirmesini kaldır`} onClick={() => set({ pairings: form.pairings.filter((x) => x !== p) })}>
                  ×
                </button>
              </span>
            ))
          ) : (
            <span className={s.note}>Henüz eşleştirme yok.</span>
          )}
        </div>
        <label className={s.fl}>
          <span>Taş ara ve ekle</span>
          <input className={s.input} value={pairQ} onChange={(e) => setPairQ(e.target.value)} placeholder="Taş adı yazın…" autoComplete="off" />
        </label>
        {cands.length ? (
          <div className={s.cands}>
            {cands.map((x) => (
              <button
                key={x.slug}
                type="button"
                className={s.chip}
                onClick={() => {
                  set({ pairings: [...form.pairings, x.slug] });
                  setPairQ("");
                }}
              >
                + {x.name_tr}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
