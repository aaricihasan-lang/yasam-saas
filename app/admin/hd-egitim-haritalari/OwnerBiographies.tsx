"use client";

/**
 * Hazır Eğitim Haritaları — OWNER "HAYAT HİKÂYELERİ" (FAZ 10). Mevcut owner yönetim ekranının bir sekmesidir (yeni modül değil).
 * Kişi bazında aşamalar AYRI gösterilir: doğum verisi · HD hesaplama · harita yayını · Hayat Hikâyesi içeriği · biyografi yayını.
 * Biyografi içeriğini yalnız owner düzenler (sunucu: requireEducationOwner + CAS revizyonu); eğitmen salt okunur görür.
 * Biyografi yayını, harita yayınından bağımsızdır ve OTOMATİK değildir; eğitmen yalnız YAYIMLI haritanın YAYIMLI biyografisini görür.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/hayatHikayesi.module.css";
import {
  BIO_CONTENT_LABEL, BIO_FACT_STATUS_LABEL, BIO_LANG_LABEL, BIO_SECTION_KEYS, BIO_SECTION_LABEL, BIO_SOURCE_KINDS, BIO_SOURCE_KIND_LABEL,
  type BioContent, type BioEvent, type BioFactCheck, type BioOwnerDetail, type BioOwnerRow, type BioSection, type BioSource,
} from "@/lib/human-design/education/biography/biographyContract";
import { BiographyTab } from "@/app/human-design/egitim-haritalari/[id]/_hayat/BiographyViews";
import { ownerGet, ownerHeaders, ownerPost } from "./ownerApi";

const BIRTH_LABEL: Record<BioOwnerRow["birthData"], string> = { dogrulandi: "Doğrulandı", dogrulaniyor: "Doğrulanıyor", "kayit-yok": "Harita kaydı yok (aday)" };
const HD_LABEL: Record<BioOwnerRow["hd"], string> = { hesaplandi: "Hesaplandı", bekliyor: "Bekliyor", "kayit-yok": "—" };
const PUB_LABEL: Record<string, string> = { draft: "Taslak", pilot_candidate: "Pilot adayı", approved: "Onaylandı", published: "Yayında", withdrawn: "Kaldırıldı" };
const ACTION_LABEL: Record<string, string> = { import: "İçe aktarıldı", owner_edit: "Owner düzenledi", publish: "Yayımlandı", unpublish: "Yayından kaldırıldı", status: "Owner incelemesi kaydedildi" };
const fmt = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
const ids = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

export function OwnerBiographies() {
  const [rows, setRows] = useState<BioOwnerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => ownerGet<{ rows: BioOwnerRow[] }>("/api/admin/hd/education/biographies").then((r) => {
    if (r.ok) { setRows(r.data.rows); setErr(null); } else setErr(r.error);
  }), []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    return (rows ?? []).filter((r) => !t || r.displayName.toLocaleLowerCase("tr-TR").includes(t));
  }, [rows, q]);

  if (openId) return <BiographyEditor id={openId} onClose={() => { setOpenId(null); void load(); }} />;
  return (
    <section className={base.panel} aria-labelledby="bio-own-h" data-bio-owner-list>
      <h2 id="bio-own-h" className={base.h2}>Hayat Hikâyeleri</h2>
      <p className={base.lead}>Her kişi için doğum verisi, HD hesaplama, harita yayını ve Hayat Hikâyesi aşamaları ayrı izlenir. Biyografi yayını otomatik değildir.</p>
      <div className={base.tools}>
        <input className={base.input} type="search" placeholder="Kişi ara…" aria-label="Kişi ara" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err ? <p className={base.err} role="alert">{err}</p> : null}
      {!rows ? <p className={base.empty}>Yükleniyor…</p> : (
        <div className={css.ownWrap}>
          <table className={css.ownTable}>
            <thead>
              <tr><th>Kişi</th><th>Doğum verisi</th><th>HD hesaplama</th><th>Harita yayını</th><th>Hayat Hikâyesi</th><th>Kaynak</th><th>Biyografi yayını</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const tr = r.biographies.find((b) => b.lang === "tr") ?? null;
                return (
                  <tr key={r.personKey} data-bio-owner-row={r.personKey}>
                    <td><b>{r.displayName}</b>{r.isLiving ? <><br /><span className={base.tag} style={{ background: "#fff4e6", color: "#8a4b0b" }}>Yaşayan kişi</span></> : null}</td>
                    <td>{BIRTH_LABEL[r.birthData]}</td>
                    <td>{HD_LABEL[r.hd]}</td>
                    <td>{r.mapPublication ? PUB_LABEL[r.mapPublication] ?? r.mapPublication : "—"}</td>
                    <td data-bio-owner-content>
                      {r.biographies.length ? r.biographies.map((b) => <div key={b.id}>{BIO_LANG_LABEL[b.lang]}: {BIO_CONTENT_LABEL[b.contentStatus]} · {b.eventCount} olay{b.livingMismatch ? <> <span className={`${base.tag} ${base.tBad}`} data-bio-living-mismatch>Yaşam durumu kişi kaydıyla uyuşmuyor</span></> : null}</div>)
                        : <span>Yok{"" /* İngilizce eksikse açıkça görünür */}</span>}
                      {r.biographies.length && !r.biographies.some((b) => b.lang === "en") ? <div className={css.small} style={{ marginTop: 2 }}>English: hazır değil</div> : null}
                    </td>
                    <td>{tr ? tr.sourceCount : "—"}</td>
                    <td data-bio-owner-publish>{r.biographies.length ? r.biographies.map((b) => <div key={b.id}>{BIO_LANG_LABEL[b.lang]}: {b.publishStatus === "published" ? "Yayında" : "Kapalı"}</div>) : "—"}</td>
                    <td>{r.biographies.map((b) => (
                      <button key={b.id} type="button" className={`${base.btn} ${base.ghost}`} style={{ marginBottom: 4 }} onClick={() => setOpenId(b.id)} data-bio-owner-edit={`${r.personKey}:${b.lang}`}>
                        {BIO_LANG_LABEL[b.lang]} düzenle
                      </button>
                    ))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={base.count}>{shown.length} kişi · {(rows ?? []).filter((r) => r.biographies.length).length} kişide Hayat Hikâyesi var</p>
        </div>
      )}
    </section>
  );
}

/**
 * FAZ 19 (P2-d): owner inceleme özeti — içe aktarılan iddia doğrulama kaydı (fact_checks) ve açık sorular. Tek kaynaklı / belirsiz
 * iddialar AÇIKÇA listelenir. Bu bilgiler eğitmene GİTMEZ (FAZ 13); eğitmen metni doğrulanmış içerikle aynıdır.
 */
function ReviewSummary({ c }: { c: BioContent }) {
  const by = (st: string) => c.factChecks.filter((f) => f.status === st);
  const single = by("tek_kaynak");
  const unsure = by("belirsiz");
  const lists: Array<["tek_kaynak" | "belirsiz", BioFactCheck[]]> = [["tek_kaynak", single], ["belirsiz", unsure]];
  return (
    <div className={css.edBlock} data-bio-review-summary>
      <b>İnceleme özeti — yalnız owner (eğitmene gösterilmez)</b>
      <p className={css.small} data-bio-fact-counts>
        İddia doğrulama kaydı: {c.factChecks.length} iddia · {by("capraz").length} çapraz doğrulandı · {single.length} tek kaynak
        {unsure.length ? ` · ${unsure.length} belirsiz` : ""} · {c.openQuestions.length} açık soru / editoryal not
      </p>
      {lists.map(([st, list]) => list.length ? (
        <div key={st} data-bio-fact-list={st}>
          <p className={css.small} style={{ margin: "6px 0 2px" }}><b>{BIO_FACT_STATUS_LABEL[st]} iddialar</b></p>
          <ul className={css.small} style={{ margin: 0 }}>
            {list.map((f, i) => <li key={i}>{f.claim} <span style={{ opacity: 0.75 }}>(kaynak: {f.sourceIds.join(", ")})</span></li>)}
          </ul>
        </div>
      ) : null)}
      {c.openQuestions.length ? (
        <div data-bio-open-questions>
          <p className={css.small} style={{ margin: "6px 0 2px" }}><b>Açık sorular</b></p>
          <ul className={css.small} style={{ margin: 0 }}>{c.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

const CONFIRM_TITLE = {
  publish: "Hayat hikâyesi yayımlansın mı?", unpublish: "Yayından kaldırılsın mı?", review: "Owner incelemesi kaydedilsin mi?", save: "Değişiklikler kaydedilsin mi?",
} as const;
const CONFIRM_ACTION = { publish: "Yayımla", unpublish: "Yayından kaldır", review: "İncelendi olarak kaydet", save: "Kaydet" } as const;

function BiographyEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<BioOwnerDetail | null>(null);
  const [c, setC] = useState<BioContent | null>(null);
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "review" | "save">(null);
  const load = useCallback(() => ownerGet<BioOwnerDetail>(`/api/admin/hd/education/biographies/${encodeURIComponent(id)}`).then((r) => {
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    const { id: _i, personKey: _p, lang: _l, subjectId: _s, contentStatus: _cs, publishStatus: _ps, revision: _r, publishedAt: _pa, createdAt: _ca, updatedAt: _ua, history: _h, reviewedAt: _ra, ...content } = r.data;
    void _i; void _p; void _l; void _s; void _cs; void _ps; void _r; void _pa; void _ca; void _ua; void _h; void _ra;
    setD(r.data); setC(content); setSaved(JSON.stringify(content));
  }), [id]);
  useEffect(() => { void load(); }, [load]);
  const dirty = c !== null && JSON.stringify(c) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!d || !c) return <section className={base.panel}>{msg ? <p className={base.err} role="alert">{msg.text}</p> : <p className={base.empty}>Yükleniyor…</p>}</section>;
  const set = <K extends keyof BioContent>(k: K, v: BioContent[K]) => { setC({ ...c, [k]: v }); setMsg(null); };
  const setSection = (i: number, s: BioSection) => set("sections", c.sections.map((x, j) => (j === i ? s : x)));
  const setEvent = (i: number, e: BioEvent) => set("timeline", c.timeline.map((x, j) => (j === i ? e : x)));
  const setSource = (i: number, s: BioSource) => set("sources", c.sources.map((x, j) => (j === i ? s : x)));
  const missingKeys = BIO_SECTION_KEYS.filter((k) => !c.sections.some((s) => s.key === k));

  const save = async () => {
    setBusy(true); setConfirm(null);
    try {
      const res = await fetch(`/api/admin/hd/education/biographies/${encodeURIComponent(id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...ownerHeaders() }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ revision: d.revision, content: c }),
      });
      const b = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; revision?: number; unpublished?: boolean } | null;
      if (res.ok && b?.ok) {
        await load();
        // FAZ 19 (P2-f): içerik değişti → owner incelemesi düştü; yayımlıysa yayından çıktı (yeniden onay gerekir).
        setMsg({ ok: true, text: b.unpublished
          ? `Kaydedildi (sürüm ${b.revision}). İçerik değiştiği için yayından kaldırıldı; yeniden inceleyip yayımlamanız gerekir.`
          : `Kaydedildi (sürüm ${b.revision}). Yayın için owner incelemesi gerekir.` });
      }
      else setMsg({ ok: false, text: b?.error ?? "Kaydedilemedi." });
    } catch {
      setMsg({ ok: false, text: "Ağ hatası — kayıt doğrulanamadı." });
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: "publish" | "unpublish" | "review") => {
    setBusy(true);
    const r = await ownerPost<{ revision: number }>(`/api/admin/hd/education/biographies/${encodeURIComponent(id)}`, { action, revision: d.revision });
    setBusy(false); setConfirm(null);
    if (r.ok) { await load(); setMsg({ ok: true, text: action === "publish" ? "Hayat hikâyesi yayımlandı." : action === "unpublish" ? "Hayat hikâyesi yayından kaldırıldı." : "Owner incelemesi kaydedildi; artık yayımlanabilir." }); }
    else setMsg({ ok: false, text: r.error });
  };

  return (
    <section className={base.panel} aria-labelledby="bio-ed-h" data-bio-editor data-bio-revision={d.revision}>
      <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => { if (!dirty || window.confirm("Kaydedilmemiş değişiklikler silinecek. Çıkılsın mı?")) onClose(); }} data-bio-editor-back>← Hayat Hikâyeleri</button>
      <h2 id="bio-ed-h" className={base.h2} style={{ marginTop: 10 }}>{d.displayName} · {BIO_LANG_LABEL[d.lang]}</h2>
      <p className={base.lead}>
        Sürüm {d.revision} · <span data-bio-editor-status={d.contentStatus}>{BIO_CONTENT_LABEL[d.contentStatus]}{d.reviewedAt ? ` (${fmt(d.reviewedAt)})` : ""}</span> · biyografi yayını: <b data-bio-editor-publish>{d.publishStatus === "published" ? "Yayında" : "Kapalı"}</b>
        {d.subjectId ? "" : " · harita kaydı yok (aday) — eğitmen göremez"}
      </p>
      <div className={css.langRow} style={{ marginTop: 10 }}>
        <button type="button" className={`${css.langBtn} ${!preview ? css.langOn : ""}`} onClick={() => setPreview(false)} aria-pressed={!preview} data-bio-editor-edit>Düzenle</button>
        <button type="button" className={`${css.langBtn} ${preview ? css.langOn : ""}`} onClick={() => setPreview(true)} aria-pressed={preview} data-bio-editor-preview>Eğitmen görünümü</button>
      </div>
      {msg ? <p className={msg.ok ? base.note : base.err} role={msg.ok ? "status" : "alert"} data-bio-editor-msg>{msg.text}</p> : null}
      <ReviewSummary c={c} />

      {preview ? (
        <BiographyTab state={{ kind: "ok", data: { lang: d.lang, availableLangs: [d.lang], biography: { ...c, lang: d.lang, revision: d.revision, updatedAt: d.updatedAt } } }}
          lang={d.lang} onLang={() => undefined} onCite={() => undefined} onAddNote={() => undefined} displayName={c.displayName} />
      ) : (
        <>
          <div className={css.edBlock}>
            <div className={css.edGrid}>
              <label className={css.edField}>Ad<input value={c.displayName} maxLength={200} onChange={(e) => set("displayName", e.target.value)} data-bio-f="displayName" /></label>
              <label className={css.edField}>Yaşadığı yıllar<input value={c.lifeSpan ?? ""} maxLength={40} onChange={(e) => set("lifeSpan", e.target.value || null)} /></label>
              <label className={css.edField}>Meslek<input value={c.profession ?? ""} maxLength={200} onChange={(e) => set("profession", e.target.value || null)} /></label>
              <label className={css.edField}>Ülke<input value={c.country ?? ""} maxLength={200} onChange={(e) => set("country", e.target.value || null)} /></label>
              <label className={css.edField}>Dönem<input value={c.era ?? ""} maxLength={100} onChange={(e) => set("era", e.target.value || null)} /></label>
              <label className={css.edField}>Tanındığı alan<input value={c.knownFor ?? ""} maxLength={400} onChange={(e) => set("knownFor", e.target.value || null)} /></label>
              <label className={`${css.edField} ${css.edWide}`}>Kısa tanıtım<textarea value={c.shortIntro} maxLength={1500} onChange={(e) => set("shortIntro", e.target.value)} data-bio-f="shortIntro" /></label>
              <label className={`${css.edField} ${css.edWide}`}>Tarafsızlık / güncellik notu<textarea value={c.neutralityNote ?? ""} maxLength={1000} onChange={(e) => set("neutralityNote", e.target.value || null)} /></label>
              <label className={`${css.edField} ${css.edWide}`}>
                Editoryal / araştırma notları — yalnız owner (eğitmene gösterilmez; her satır bir not, en çok 20)
                <textarea value={c.openQuestions.join("\n")} maxLength={20 * 501}
                  onChange={(e) => set("openQuestions", e.target.value.split("\n").map((x) => x.slice(0, 500)).filter((x, i, a) => x.trim() || i < a.length - 1).slice(0, 20))}
                  data-bio-f="openQuestions" style={{ minHeight: 90 }} />
              </label>
            </div>
          </div>

          {c.sections.map((s, i) => (
            <div key={s.key} className={css.edBlock} data-bio-ed-section={s.key}>
              <div className={css.edGrid}>
                <label className={css.edField}>Bölüm ({BIO_SECTION_LABEL[s.key]})<input value={s.title} maxLength={120} onChange={(e) => setSection(i, { ...s, title: e.target.value })} /></label>
                <div style={{ display: "flex", alignItems: "end", justifyContent: "flex-end" }}>
                  <button type="button" className={`${base.btn} ${base.danger}`} onClick={() => set("sections", c.sections.filter((_, j) => j !== i))}>Bölümü kaldır</button>
                </div>
              </div>
              {s.paragraphs.map((p, j) => (
                <div key={j} className={css.edGrid} style={{ marginTop: 8 }}>
                  <label className={`${css.edField} ${css.edWide}`}>Paragraf {j + 1}
                    <textarea value={p.text} maxLength={2000} onChange={(e) => setSection(i, { ...s, paragraphs: s.paragraphs.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} data-bio-f={`p-${s.key}-${j}`} />
                  </label>
                  <label className={css.edField}>Kaynak kimlikleri (virgülle)
                    <input value={p.sourceIds.join(", ")} onChange={(e) => setSection(i, { ...s, paragraphs: s.paragraphs.map((x, k) => (k === j ? { ...x, sourceIds: ids(e.target.value) } : x)) })} />
                  </label>
                  <div style={{ display: "flex", alignItems: "end", justifyContent: "flex-end" }}>
                    <button type="button" className={`${base.btn} ${base.ghost}`} disabled={s.paragraphs.length <= 1} onClick={() => setSection(i, { ...s, paragraphs: s.paragraphs.filter((_, k) => k !== j) })}>Paragrafı sil</button>
                  </div>
                </div>
              ))}
              <button type="button" className={`${base.btn} ${base.ghost}`} style={{ marginTop: 8 }} onClick={() => setSection(i, { ...s, paragraphs: [...s.paragraphs, { text: "", sourceIds: [] }] })}>+ Paragraf</button>
            </div>
          ))}
          {missingKeys.length ? (
            <div className={css.langRow} style={{ marginTop: 10 }}>
              {missingKeys.map((k) => (
                <button key={k} type="button" className={`${base.btn} ${base.ghost}`} onClick={() => set("sections", [...c.sections, { key: k, title: BIO_SECTION_LABEL[k], paragraphs: [{ text: "", sourceIds: [] }] }].sort((a, b) => BIO_SECTION_KEYS.indexOf(a.key) - BIO_SECTION_KEYS.indexOf(b.key)))}>
                  + {BIO_SECTION_LABEL[k]}
                </button>
              ))}
            </div>
          ) : null}

          <div className={css.edBlock} data-bio-ed-timeline>
            <b>Önemli Yaşam Olayları</b>
            {c.timeline.map((e, i) => (
              <div key={i} className={css.edRow}>
                <input aria-label="Tarih" value={e.date} placeholder="YYYY[-AA[-GG]]" maxLength={10} onChange={(x) => setEvent(i, { ...e, date: x.target.value })} />
                <div style={{ display: "grid", gap: 6 }}>
                  <input aria-label="Başlık" value={e.title} maxLength={160} onChange={(x) => setEvent(i, { ...e, title: x.target.value })} />
                  <textarea aria-label="Açıklama" value={e.text} maxLength={600} onChange={(x) => setEvent(i, { ...e, text: x.target.value })} style={{ minHeight: 60 }} />
                </div>
                <input aria-label="Kaynak kimlikleri" value={e.sourceIds.join(", ")} onChange={(x) => setEvent(i, { ...e, sourceIds: ids(x.target.value) })} />
                <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => set("timeline", c.timeline.filter((_, j) => j !== i))}>Sil</button>
              </div>
            ))}
            <button type="button" className={`${base.btn} ${base.ghost}`} style={{ marginTop: 8 }} onClick={() => set("timeline", [...c.timeline, { date: "", title: "", text: "", sourceIds: [] }])}>+ Olay</button>
          </div>

          <div className={css.edBlock} data-bio-ed-sources>
            <b>Kaynaklar</b> <span className={css.small}>Yalnız https bağlantı. Vikipedi kaynağında sayfa sürümü (oldid) zorunlu. Sunucu bağlantıları indirmez.</span>
            {c.sources.map((s, i) => (
              <div key={i} className={css.edSrcRow}>
                <input aria-label="Kimlik" value={s.id} maxLength={24} onChange={(x) => setSource(i, { ...s, id: x.target.value })} />
                <div style={{ display: "grid", gap: 6 }}>
                  <input aria-label="Başlık" value={s.title} maxLength={300} onChange={(x) => setSource(i, { ...s, title: x.target.value })} />
                  <input aria-label="Bağlantı" value={s.url} maxLength={2000} onChange={(x) => setSource(i, { ...s, url: x.target.value })} data-bio-f={`src-url-${i}`} />
                </div>
                <input aria-label="Yayıncı" value={s.publisher ?? ""} maxLength={200} onChange={(x) => setSource(i, { ...s, publisher: x.target.value || null })} />
                <select aria-label="Tür" value={s.kind} onChange={(x) => setSource(i, { ...s, kind: x.target.value as BioSource["kind"] })}>
                  {BIO_SOURCE_KINDS.map((k) => <option key={k} value={k}>{BIO_SOURCE_KIND_LABEL[k]}</option>)}
                </select>
                <input aria-label="Sayfa sürümü" placeholder="oldid" value={s.revisionId ?? ""} maxLength={20} onChange={(x) => setSource(i, { ...s, revisionId: x.target.value || null })} />
                <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => set("sources", c.sources.filter((_, j) => j !== i))}>Sil</button>
              </div>
            ))}
            <button type="button" className={`${base.btn} ${base.ghost}`} style={{ marginTop: 8 }}
              onClick={() => set("sources", [...c.sources, { id: `s${c.sources.length + 1}`, title: "", publisher: null, kind: "encyclopedia", url: "https://", accessedOn: null, revisionId: null, license: null, licenseUrl: null }])}>
              + Kaynak
            </button>
          </div>
        </>
      )}

      {d.history.length ? (
        <details style={{ marginTop: 12 }}>
          <summary>Geçmiş ({d.history.length})</summary>
          <ul className={css.small}>{d.history.map((h, i) => <li key={i}>{fmt(h.at)} · {ACTION_LABEL[h.action] ?? h.action} · sürüm {h.revision}</li>)}</ul>
        </details>
      ) : null}

      <div className={css.edBar}>
        {dirty ? <span className={base.tag} style={{ background: "#fff4e6", color: "#8a4b0b" }} data-bio-editor-dirty>Kaydedilmemiş değişiklik</span> : null}
        <button type="button" className={`${base.btn} ${base.ghost}`} disabled={busy || dirty || d.contentStatus === "owner_reviewed"} onClick={() => setConfirm("review")} data-bio-editor-review>İncelendi olarak işaretle…</button>
        {d.publishStatus === "published"
          ? <button type="button" className={`${base.btn} ${base.danger}`} disabled={busy || dirty} onClick={() => setConfirm("unpublish")} data-bio-editor-unpublish>Yayından kaldır</button>
          : <button type="button" className={`${base.btn} ${base.ghost}`} disabled={busy || dirty || d.contentStatus !== "owner_reviewed"} onClick={() => setConfirm("publish")} data-bio-editor-publish-btn
              title={d.contentStatus !== "owner_reviewed" ? "Yayın için önce owner incelemesi gerekir" : undefined}>Yayımla…</button>}
        <button type="button" className={`${base.btn} ${base.save}`} disabled={busy || !dirty} onClick={() => (d.publishStatus === "published" || d.contentStatus === "owner_reviewed" ? setConfirm("save") : void save())} data-bio-editor-save>Kaydet</button>
        {d.publishStatus !== "published" && d.contentStatus !== "owner_reviewed" ? <small className={css.small} data-bio-publish-why>Yayın için owner incelemesi gerekir (kaynak kontrolü tek başına yetmez).</small> : null}
      </div>

      {confirm ? (
        <div className={base.ovl} role="dialog" aria-modal="true" aria-labelledby="bio-cf-h">
          <div className={base.mdl}>
            <h3 id="bio-cf-h">{CONFIRM_TITLE[confirm]}</h3>
            <p>{confirm === "publish"
              ? "Yalnız harita kaydı yayımlı olan kişilerde, eğitim yetkisi açık eğitmenler bu metni görür. Kaynak kontrolünü ve lisans durumunu doğruladığınızdan emin olun."
              : confirm === "review"
                ? "Bu metni owner olarak incelediğinizi kaydedersiniz; yayın bu kayıttan sonra açılır. İçerik daha sonra değişirse inceleme düşer ve yeniden onay gerekir."
                : confirm === "save"
                  ? (d.publishStatus === "published"
                    ? "Bu hayat hikâyesi yayında. İçerik değişirse kayıt YAYINDAN KALDIRILIR ve owner incelemesi düşer; eğitmenler yeniden onaylayıp yayımlayana kadar metni göremez."
                    : "İçerik değişirse mevcut owner incelemesi düşer; yayın için yeniden inceleme gerekir.")
                  : "Eğitmenler bu hayat hikâyesini artık görmez. İçerik silinmez."}</p>
            {confirm === "publish" || confirm === "review" ? (
              <p className={css.small} data-bio-confirm-counts>
                İddia doğrulama kaydı: {c.factChecks.filter((f) => f.status === "tek_kaynak").length} tek kaynaklı iddia · {c.factChecks.filter((f) => f.status === "belirsiz").length} belirsiz · {c.openQuestions.length} açık soru (ayrıntı: İnceleme özeti).
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => setConfirm(null)}>Vazgeç</button>
              <button type="button" className={`${base.btn} ${confirm === "unpublish" ? base.danger : base.save}`} disabled={busy}
                onClick={() => void (confirm === "save" ? save() : act(confirm))} data-bio-editor-confirm>
                {CONFIRM_ACTION[confirm]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
