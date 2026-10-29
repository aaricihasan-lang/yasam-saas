"use client";

/**
 * FAZ 14 — GERÇEK DANIŞAN için sade izin/yetki BEYANI. Islak imza / tarama / dosya YOK: eğitmen kısa bilgilendirmeyi okur ve
 * "gerekli izne veya hukuki dayanağa sahibim" beyanını AKTİF olarak onaylar. Tarih, eğitmen, beyan metni sürümü + SHA ve kapsam
 * sunucuda kayda geçer. Varsayılan sunum TAKMA AD; açık isim ve doğum bilgisi AYRI yetki işaretleriyle. Beyan metni hukuk + owner
 * onaylı değilse bu yol KAPALIDIR (sunucu 409) — eğitmen kurgusal eğitim haritası ekleyebilir.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { privCall } from "./privApi";

type DeclText = { version: string; title: string; body: string; sha256: string };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

export function DeclarationForm({ hdClientId, clientLabel, onSaved, onCancel }: {
  hdClientId: string; clientLabel: string; onSaved: (consentId: string) => void; onCancel: () => void;
}) {
  const [text, setText] = useState<DeclText | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "closed" | "error">("loading");
  const [relation, setRelation] = useState<"danisan" | "yasal_temsilci">("danisan");
  const [name, setName] = useState(clientLabel);
  const [named, setNamed] = useState(false);
  const [birth, setBirth] = useState(false);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void privCall<{ text: DeclText }>("trainer", "/api/hd/education/private/declaration-text").then((r) => {
      if (!live) return;
      if (r.ok) { setText(r.body.text); setState("ok"); }
      else setState(r.code === "DECLARATION_NOT_APPROVED" ? "closed" : "error");
    });
    return () => { live = false; };
  }, []);

  if (state === "loading") return <p className={base.empty} aria-live="polite">Beyan metni yükleniyor…</p>;
  if (state === "closed") {
    return (
      <div className={`${oz.result} ${oz.resultWarn}`} role="status" data-edu-decl-closed>
        <span>
          Gerçek danışan haritası ekleme, beyan metninin hukuk değerlendirmesi ve sistem sahibi onayı tamamlanınca açılacak.
          Şimdilik <Link className={base.ext} href="/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal">kurgusal eğitim haritası</Link> ekleyebilirsiniz.
        </span>
      </div>
    );
  }
  if (state === "error" || !text) return <p className={base.err} role="alert">Beyan metni yüklenemedi. Sayfayı yenileyin.</p>;
  const nameOk = name.trim().length >= 2 && name.trim().length <= 200;

  async function save() {
    if (!text || !accept || !nameOk || busy) return;
    setBusy(true); setErr(null);
    const r = await privCall<{ id: string }>("trainer", "/api/hd/education/private/consents", { method: "POST", body: {
      hdClientId, consenterName: name.trim(), relation, displayScope: named ? "acik_isim" : "anonim", includeBirthData: birth, namedConfirmed: named,
      textVersion: text.version, textSha256: text.sha256, givenOn: today(), method: "egitmen_beyani",
    } });
    setBusy(false);
    if (r.ok && r.body.id) { onSaved(r.body.id); return; }
    setErr(r.ok ? "Beyan kaydedilemedi." : r.error);
  }

  return (
    <div className={oz.declBox} data-edu-decl-form>
      <h3 className={oz.declTitle}>Eğitim amaçlı kullanım beyanı</h3>
      <p className={oz.hint}>Danışan: <b>{clientLabel}</b> · Varsayılan gösterim <b>takma ad</b>; doğum bilgisi <b>gösterilmez</b>.</p>
      <div className={oz.declText} data-edu-decl-text>{text.body}</div>
      <div className={oz.form2}>
        <label className={oz.field}>İzni veren
          <select value={relation} onChange={(e) => setRelation(e.target.value as "danisan" | "yasal_temsilci")} data-edu-decl-relation>
            <option value="danisan">Danışanın kendisi</option>
            <option value="yasal_temsilci">Yasal temsilcisi</option>
          </select>
        </label>
        <label className={oz.field}>İzni verenin adı
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} data-edu-decl-name />
        </label>
      </div>
      <label className={oz.declareSmall}>
        <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} data-edu-decl-named />
        <span>Danışanın <b>adının</b> eğitimde gösterilmesi için ayrıca yetkim var (işaretlenmezse takma ad).</span>
      </label>
      <label className={oz.declareSmall}>
        <input type="checkbox" checked={birth} onChange={(e) => setBirth(e.target.checked)} data-edu-decl-birth />
        <span>Danışanın <b>doğum tarihi, saati ve yerinin</b> gösterilmesi için ayrıca yetkim var.</span>
      </label>
      <label className={oz.declare}>
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} data-edu-decl-accept />
        <span><b>Bu haritayı eğitim amacıyla kullanmak için gerekli izne veya hukuki dayanağa sahip olduğumu beyan ederim.</b></span>
      </label>
      {err ? <p className={base.err} role="alert" data-edu-decl-error>{err}</p> : null}
      <div className={base.actions}>
        <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={onCancel} disabled={busy}>Vazgeç</button>
        <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={save} disabled={busy || !accept || !nameOk} data-edu-decl-save>
          {busy ? "Kaydediliyor…" : "Beyanı onayla"}
        </button>
      </div>
      <p className={oz.hint}>Beyanınız; tarih, beyan metni sürümü ve seçtiğiniz kapsamla kaydedilir. Danışan izni geri çektiğinde kayıt anında kapanır.</p>
    </div>
  );
}
