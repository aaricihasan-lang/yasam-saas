"use client";

/**
 * FAZ 14 — GERÇEK DANIŞAN için sade izin/yetki BEYANI. Islak imza / tarama / dosya YOK: eğitmen kısa bilgilendirmeyi okur ve
 * "gerekli izne veya hukuki dayanağa sahibim" beyanını AKTİF olarak onaylar. Tarih, eğitmen, beyan metni sürümü + SHA ve kapsam
 * sunucuda kayda geçer. Varsayılan sunum TAKMA AD; açık isim ve doğum bilgisi AYRI yetki işaretleriyle. Beyan metni hukuk + owner
 * onaylı değilse bu yol KAPALIDIR (sunucu 409) — eğitmen kurgusal eğitim haritası ekleyebilir.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { privCall, useEduApiError } from "./privApi";

type DeclText = { version: string; title: string; body: string; sha256: string };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

export function DeclarationForm({ hdClientId, clientLabel, onSaved, onCancel }: {
  hdClientId: string; clientLabel: string; onSaved: (consentId: string) => void; onCancel: () => void;
}) {
  const t = useTranslations("hd.education");
  const apiErr = useEduApiError();
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

  if (state === "loading") return <p className={base.empty} aria-live="polite">{t("decl.loading")}</p>;
  if (state === "closed") {
    return (
      <div className={`${oz.result} ${oz.resultWarn}`} role="status" data-edu-decl-closed>
        <span>
          {t.rich("decl.closed", { link: (c) => <Link className={base.ext} href="/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal">{c}</Link> })}
        </span>
      </div>
    );
  }
  if (state === "error" || !text) return <p className={base.err} role="alert">{t("decl.error")}</p>;
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
    setErr(r.ok ? t("decl.saveFailed") : apiErr(r));
  }

  return (
    <div className={oz.declBox} data-edu-decl-form>
      <h3 className={oz.declTitle}>{t("decl.title")}</h3>
      <p className={oz.hint}>{t.rich("decl.hint", { client: clientLabel, b: (c) => <b>{c}</b> })}</p>
      <div className={oz.declText} data-edu-decl-text>{text.body}</div>
      <div className={oz.form2}>
        <label className={oz.field}>{t("decl.consenter")}
          <select value={relation} onChange={(e) => setRelation(e.target.value as "danisan" | "yasal_temsilci")} data-edu-decl-relation>
            <option value="danisan">{t("form.relationSelf")}</option>
            <option value="yasal_temsilci">{t("form.relationLegal")}</option>
          </select>
        </label>
        <label className={oz.field}>{t("decl.consenterName")}
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} data-edu-decl-name />
        </label>
      </div>
      <label className={oz.declareSmall}>
        <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} data-edu-decl-named />
        <span>{t.rich("decl.named", { b: (c) => <b>{c}</b> })}</span>
      </label>
      <label className={oz.declareSmall}>
        <input type="checkbox" checked={birth} onChange={(e) => setBirth(e.target.checked)} data-edu-decl-birth />
        <span>{t.rich("decl.birth", { b: (c) => <b>{c}</b> })}</span>
      </label>
      <label className={oz.declare}>
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} data-edu-decl-accept />
        <span><b>{t("decl.accept")}</b></span>
      </label>
      {err ? <p className={base.err} role="alert" data-edu-decl-error>{err}</p> : null}
      <div className={base.actions}>
        <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={onCancel} disabled={busy}>{t("common.cancel")}</button>
        <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={save} disabled={busy || !accept || !nameOk} data-edu-decl-save>
          {busy ? t("edit.saving") : t("decl.save")}
        </button>
      </div>
      <p className={oz.hint}>{t("decl.footer")}</p>
    </div>
  );
}
