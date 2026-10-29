"use client";

/**
 * G · Eğitim notları ve eğitim meta verisi düzenleme (FAZ 7). Yalnız eğitim alanları: başlık, takma ad, gösterim, kategori,
 * açıklama, anlatım notları. Doğum / hesap / BodyGraph verisi bu ekranda YOKTUR (sunucu da bu alanları reddeder).
 * Eşzamanlı düzenleme koruması: kaydetme okunan updatedAt ile yapılır; başka oturum değiştirdiyse 409 → yenileme istenir.
 * Yalnız DEĞİŞEN alanlar gönderilir; başarı yalnız sunucu yeni updatedAt döndürünce gösterilir.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import kat from "@/app/_premium/hd-education/egitimKatalog.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_CATEGORIES, PRIV_CATEGORY_LABEL, type PrivCategory, type PrivItemDetail } from "@/lib/human-design/education/private/privateContract";
import { ErrorView, LoadingView, NotFoundView, Shell } from "./Shell";
import { privCall, type Side } from "./privApi";

type Form = { title: string; aliasLabel: string; displayMode: "alias" | "named"; category: PrivCategory; description: string; teachingNotes: string };
const fromDetail = (d: PrivItemDetail): Form => ({
  title: d.item.title, aliasLabel: d.item.aliasLabel, displayMode: d.item.displayMode, category: d.item.category,
  description: d.item.description ?? "", teachingNotes: d.item.teachingNotes ?? "",
});

export function EditView({ side, id, backHref }: { side: Side; id: string; backHref: string }) {
  const router = useRouter();
  const api = side === "owner" ? "/api/admin/hd/education/private" : "/api/hd/education/private";
  const [d, setD] = useState<PrivItemDetail | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; conflict?: boolean } | null>(null);

  const fetchItem = useCallback(() => privCall<{ item: PrivItemDetail }>(side, `${api}/items/${encodeURIComponent(id)}`), [side, api, id]);
  const apply = useCallback((r: Awaited<ReturnType<typeof fetchItem>>) => {
    if (r.ok) { setD(r.body.item); setF(fromDetail(r.body.item)); setState("ok"); setErr(null); } else setState(r.notFound ? "notfound" : "error");
  }, []);
  const load = useCallback(async () => apply(await fetchItem()), [apply, fetchItem]);
  useEffect(() => {
    let live = true;
    void fetchItem().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [fetchItem, apply]);

  if (state === "loading") return <LoadingView />;
  if (state === "notfound") return <NotFoundView home={side === "owner" ? "/admin" : "/human-design"} />;
  if (state === "error" || !d || !f) return <ErrorView message="Kayıt yüklenemedi." onRetry={() => { setState("loading"); void load(); }} />;

  const orig = fromDetail(d);
  const changed = (Object.keys(f) as (keyof Form)[]).filter((k) => f[k] !== orig[k]);
  const titleOk = f.title.trim().length >= 1 && f.title.trim().length <= 160;
  const aliasOk = f.aliasLabel.trim().length >= 1 && f.aliasLabel.trim().length <= 80;

  async function save() {
    if (!d || !f) return;
    setBusy(true); setErr(null);
    const patch: Record<string, string | null> = {};
    for (const k of changed) patch[k] = typeof f[k] === "string" && (f[k] as string).trim() === "" && (k === "description" || k === "teachingNotes") ? null : (f[k] as string);
    const r = await privCall<{ updatedAt: string }>(side, `${api}/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { patch, expectedUpdatedAt: d.item.updatedAt } });
    setBusy(false);
    if (r.ok && r.body.updatedAt) { router.push(`${backHref}?kaydedildi=1`); return; }
    if (!r.ok && r.code === "CONFLICT") { setErr({ text: "Bu kayıt başka bir oturumda değişti. Güncel hâli yükleyip değişikliklerinizi yeniden yapın.", conflict: true }); return; }
    setErr({ text: r.ok ? "Sunucu kaydı doğrulamadı; değişiklik kaydedilmedi." : r.error });
  }

  return (
    <Shell>
      <Link className={kat.back} href={backHref}>← Kayda dön</Link>
      <header className={kat.dHead}>
        <div>
          <p className={base.eyebrow}>DÜZENLE</p>
          <h1 className={kat.dTitle}>{d.item.title}</h1>
          <p className={kat.sub2}>Yalnız eğitim amaçlı alanlar düzenlenir{side === "owner" ? ` · eğitmen: ${d.trainer.name}` : ""}</p>
        </div>
      </header>
      <section className={base.panel} data-edu-edit-form>
        <div className={oz.form2}>
          <label className={oz.field}>Eğitim başlığı
            <input value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} aria-invalid={!titleOk} data-edu-title />
            {!titleOk ? <span className={oz.fieldErr}>Başlık 1–160 karakter olmalı.</span> : null}
          </label>
          <label className={oz.field}>Takma ad
            <input value={f.aliasLabel} maxLength={80} onChange={(e) => setF({ ...f, aliasLabel: e.target.value })} aria-invalid={!aliasOk} data-edu-alias />
            {!aliasOk ? <span className={oz.fieldErr}>Takma ad 1–80 karakter olmalı.</span> : null}
          </label>
          <label className={oz.field}>Kategori
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as PrivCategory })} data-edu-category>
              {PRIV_CATEGORIES.map((c) => <option key={c} value={c}>{PRIV_CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label className={oz.field}>Gösterim
            <select value={f.displayMode} onChange={(e) => setF({ ...f, displayMode: e.target.value as "alias" | "named" })} data-edu-mode>
              <option value="alias">Takma ad</option>
              <option value="named" disabled={d.consent?.displayScope !== "acik_isim"}>Açık isim{d.consent?.displayScope !== "acik_isim" ? (d.kind === "kurgusal" ? " — kurgusal kayıtta yok" : " — izin kapsamında yok") : ""}</option>
            </select>
          </label>
          <label className={`${oz.field} ${oz.wide}`}>Açıklama
            <textarea value={f.description} maxLength={2000} rows={2} onChange={(e) => setF({ ...f, description: e.target.value })} data-edu-desc />
          </label>
          <label className={`${oz.field} ${oz.wide}`}>Anlatım notları
            <textarea value={f.teachingNotes} maxLength={20000} rows={8} onChange={(e) => setF({ ...f, teachingNotes: e.target.value })} data-edu-notes />
            <span className={oz.hint}>{f.teachingNotes.length} / 20000</span>
          </label>
        </div>
        <div className={oz.lockBox}>
          <b>Kilitli kaynak verisi.</b> Doğum tarihi, doğum saati ve BodyGraph danışanın kayıtlı haritasından okunur; bu ekrandan değiştirilemez.
          Kaynak harita değişirse kayıt erişime kapanır.
        </div>
        {err ? (
          <div className={`${oz.result} ${err.conflict ? oz.resultWarn : oz.resultBad}`} role="alert" data-edu-error>
            <span>{err.text}{err.conflict ? <> <button type="button" className={base.linkBtn} onClick={() => { setState("loading"); void load(); }}>Güncel hâli yükle</button></> : null}</span>
          </div>
        ) : null}
        <div className={base.actions}>
          <Link className={`${base.btn} ${base.ghost} ${oz.touch}`} href={backHref}>Vazgeç</Link>
          <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={save} disabled={busy || !changed.length || !titleOk || !aliasOk} data-edu-save>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </section>
    </Shell>
  );
}
