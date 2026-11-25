"use client";

/**
 * E · Danışan izin kaydı (FAZ 7). Sunucudaki KULLANIMA ONAYLI izin metni (sürüm + SHA-256) gösterilir; onaylı metin yoksa form AÇILMAZ.
 * "Kutu işaretlemek yetmez": imzalı kopya (PDF/PNG/JPEG ≤2 MB) zorunlu. Varsayılan takma ad; açık isim ayrı teyit + imzalı yöntem.
 * Dosya türü / boyutu istemcide ön denetlenir; asıl doğrulama (imza baytları, boyut, SHA) SUNUCUDA ve DB'de yapılır.
 * Metin hukuken kesinleşmiş gibi sunulmaz: "TASLAK" ibaresi taşıyan metin açıkça işaretlenir.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_EVIDENCE_MAX_BYTES, PRIV_METHOD_LABEL, type PrivConsentMethod } from "@/lib/human-design/education/private/privateContract";
import { privCall, useEduApiError } from "./privApi";
import { useEduLabel } from "./labels";

type Text = { version: string; title: string; body: string; sha256: string };
const MIMES: Record<string, string> = { "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPEG" };
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function ConsentForm({ hdClientId, clientLabel, onSaved, onCancel }: {
  hdClientId: string; clientLabel: string; onSaved: (consentId: string) => void; onCancel: () => void;
}) {
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const apiErr = useEduApiError();
  const [text, setText] = useState<Text | null>(null);
  const [textState, setTextState] = useState<"loading" | "ok" | "unapproved" | "error">("loading");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<"danisan" | "yasal_temsilci">("danisan");
  const [givenOn, setGivenOn] = useState(today());
  const [method, setMethod] = useState<PrivConsentMethod>("islak_imza_tarama");
  const [scope, setScope] = useState<"anonim" | "acik_isim">("anonim");
  const [namedOk, setNamedOk] = useState(false);
  const [birth, setBirth] = useState(false);
  const [file, setFile] = useState<{ name: string; mime: string; size: number; b64: string } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void privCall<{ text: Text }>("trainer", "/api/hd/education/private/consent-text").then((r) => {
      if (!live) return;
      if (r.ok) { setText(r.body.text); setTextState("ok"); } else setTextState(r.status === 409 ? "unapproved" : "error");
    });
    return () => { live = false; };
  }, []);

  async function pickFile(f: File | undefined) {
    setFileErr(null); setFile(null);
    if (!f) return;
    if (!MIMES[f.type]) { setFileErr(t("consent.fileType")); return; }
    if (f.size > PRIV_EVIDENCE_MAX_BYTES) { setFileErr(t("consent.fileSize")); return; }
    if (f.size < 64) { setFileErr(t("consent.fileSmall")); return; }
    setFile({ name: f.name, mime: f.type, size: f.size, b64: toBase64(await f.arrayBuffer()) });
  }

  const namedBlocked = scope === "acik_isim" && (method === "kayitli_eposta" || !namedOk);
  const canSave = textState === "ok" && name.trim().length >= 2 && !!file && !!givenOn && givenOn <= today() && !namedBlocked && !busy;

  async function save() {
    if (!text || !file) return;
    setBusy(true); setErr(null);
    const r = await privCall<{ id: string }>("trainer", "/api/hd/education/private/consents", { method: "POST", body: {
      hdClientId, consenterName: name.trim(), relation, displayScope: scope, includeBirthData: birth, namedConfirmed: scope === "acik_isim" && namedOk,
      textVersion: text.version, textSha256: text.sha256, givenOn, method, evidenceMime: file.mime, evidenceBase64: file.b64,
    } });
    setBusy(false);
    if (r.ok && r.body.id) onSaved(r.body.id); else setErr(r.ok ? t("consent.noId") : apiErr(r));
  }

  if (textState === "loading") return <p className={base.empty} aria-live="polite">{t("consent.textLoading")}</p>;
  if (textState === "unapproved") {
    return (
      <div className={`${oz.result} ${oz.resultWarn}`} role="alert" data-edu-consent-unapproved>
        <span>{t("consent.unapproved")}</span>
      </div>
    );
  }
  if (textState === "error" || !text) return <p className={base.err} role="alert">{t("consent.textError")}</p>;
  const draft = /^\s*TASLAK/i.test(text.body);

  return (
    <div className={oz.consentGrid} data-edu-consent-form>
      <article className={base.panel}>
        <div className={oz.cmpHead}>
          <h2>{t("consent.textTitle", { version: text.version.replace("hd-egitim-izin-", "") })}</h2>
          {draft ? <span className={`${base.tag} ${base.tWarn} ${base.big}`} data-edu-text-draft>{t("consent.draftTag")}</span> : null}
        </div>
        <div className={oz.legal} tabIndex={0} aria-label={t("consent.textAria")}>{text.body}</div>
        <p className={oz.sha}>{t("consent.sha", { version: text.version, sha: text.sha256 })}</p>
      </article>
      <article className={base.panel}>
        <h2 className={base.h2}>{t("consent.infoTitle")}</h2>
        <p className={base.lead}>{t("consent.client", { client: clientLabel })}</p>
        <div className={oz.form2}>
          <label className={oz.field}>{t("consent.consenterName")}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" data-edu-consenter />
          </label>
          <label className={oz.field}>{t("consent.consenterWho")}
            <select value={relation} onChange={(e) => setRelation(e.target.value as "danisan" | "yasal_temsilci")}>
              <option value="danisan">{t("form.relationSelf")}</option><option value="yasal_temsilci">{t("form.relationLegal")}</option>
            </select>
          </label>
          <label className={oz.field}>{t("detail.consentDate")}
            <input type="date" value={givenOn} max={today()} onChange={(e) => setGivenOn(e.target.value)} data-edu-given-on />
          </label>
          <label className={oz.field}>{t("consent.method")}
            <select value={method} onChange={(e) => setMethod(e.target.value as PrivConsentMethod)} data-edu-method>
              {(Object.keys(PRIV_METHOD_LABEL) as PrivConsentMethod[]).map((m) => <option key={m} value={m}>{label("privMethod", m, PRIV_METHOD_LABEL[m])}</option>)}
            </select>
          </label>
        </div>
        <fieldset className={oz.fieldset}>
          <legend className={oz.legend}>{t("consent.scope")}</legend>
          <div className={oz.stack}>
            <label className={`${oz.radio} ${scope === "anonim" ? oz.radioOn : ""}`}>
              <input type="radio" name="edu-scope" checked={scope === "anonim"} onChange={() => setScope("anonim")} data-edu-scope="anonim" />
              <span><b>{t("consent.anon")}</b><small>{t("consent.anonHint")}</small></span>
            </label>
            <label className={`${oz.radio} ${scope === "acik_isim" ? oz.radioOn : ""}`}>
              <input type="radio" name="edu-scope" checked={scope === "acik_isim"} onChange={() => setScope("acik_isim")} data-edu-scope="acik_isim" />
              <span><b>{t("detail.scopeNamed")}</b><small>{t("consent.namedHint")}</small></span>
            </label>
          </div>
          {scope === "acik_isim" ? (
            <label className={oz.chk}><input type="checkbox" checked={namedOk} onChange={(e) => setNamedOk(e.target.checked)} data-edu-named-ok />
              <span>{t.rich("consent.namedOk", { b: (c) => <b>{c}</b> })}</span></label>
          ) : null}
          {scope === "acik_isim" && method === "kayitli_eposta" ? <p className={oz.fieldErr}>{t("consent.namedEmail")}</p> : null}
          <label className={oz.chk}><input type="checkbox" checked={birth} onChange={(e) => setBirth(e.target.checked)} data-edu-birth />
            <span>{t("consent.birth")}</span></label>
        </fieldset>
        <div className={oz.upload}>
          <div><b>{t("consent.evidenceTitle")}</b><small>{file ? `${file.name} · ${MIMES[file.mime]} · ${(file.size / 1024).toFixed(0)} KB` : t("consent.evidenceHint")}</small></div>
          <input id="edu-evidence" className={oz.fileInput} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => void pickFile(e.target.files?.[0])} data-edu-evidence />
          <label htmlFor="edu-evidence" className={oz.fileLabel}>{file ? t("consent.changeFile") : t("consent.chooseFile")}</label>
        </div>
        {fileErr ? <p className={oz.fieldErr} role="alert">{fileErr}</p> : null}
        <p className={`${base.note} ${base.warn}`}>{t("consent.boxNote")}</p>
        {err ? <p className={base.err} role="alert" data-edu-error>{err}</p> : null}
        <div className={base.actions}>
          <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={onCancel} disabled={busy}>{t("common.cancel")}</button>
          <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={save} disabled={!canSave} data-edu-consent-save>{busy ? t("edit.saving") : t("consent.save")}</button>
        </div>
      </article>
    </div>
  );
}
