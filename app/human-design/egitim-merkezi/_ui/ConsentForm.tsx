"use client";

/**
 * E · Danışan izin kaydı (FAZ 7). Sunucudaki KULLANIMA ONAYLI izin metni (sürüm + SHA-256) gösterilir; onaylı metin yoksa form AÇILMAZ.
 * "Kutu işaretlemek yetmez": imzalı kopya (PDF/PNG/JPEG ≤2 MB) zorunlu. Varsayılan takma ad; açık isim ayrı teyit + imzalı yöntem.
 * Dosya türü / boyutu istemcide ön denetlenir; asıl doğrulama (imza baytları, boyut, SHA) SUNUCUDA ve DB'de yapılır.
 * Metin hukuken kesinleşmiş gibi sunulmaz: "TASLAK" ibaresi taşıyan metin açıkça işaretlenir.
 */
import { useEffect, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { PRIV_EVIDENCE_MAX_BYTES, PRIV_METHOD_LABEL, type PrivConsentMethod } from "@/lib/human-design/education/private/privateContract";
import { privCall } from "./privApi";

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
    if (!MIMES[f.type]) { setFileErr("Yalnız PDF, PNG veya JPEG yüklenebilir."); return; }
    if (f.size > PRIV_EVIDENCE_MAX_BYTES) { setFileErr("Dosya 2 MB sınırını aşıyor."); return; }
    if (f.size < 64) { setFileErr("Dosya çok küçük veya boş."); return; }
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
    if (r.ok && r.body.id) onSaved(r.body.id); else setErr(r.ok ? "Sunucu izin kimliği döndürmedi; izin kaydedilmedi." : r.error);
  }

  if (textState === "loading") return <p className={base.empty} aria-live="polite">İzin metni yükleniyor…</p>;
  if (textState === "unapproved") {
    return (
      <div className={`${oz.result} ${oz.resultWarn}`} role="alert" data-edu-consent-unapproved>
        <span>Kullanıma onaylı izin metni henüz yok (hukuk incelemesi ve sistem sahibi onayı bekleniyor). Bu nedenle izin kaydedilemez ve harita eklenemez.</span>
      </div>
    );
  }
  if (textState === "error" || !text) return <p className={base.err} role="alert">İzin metni yüklenemedi. Sayfayı yenileyin.</p>;
  const draft = /^\s*TASLAK/i.test(text.body);

  return (
    <div className={oz.consentGrid} data-edu-consent-form>
      <article className={base.panel}>
        <div className={oz.cmpHead}>
          <h2>İzin metni ({text.version.replace("hd-egitim-izin-", "")})</h2>
          {draft ? <span className={`${base.tag} ${base.tWarn} ${base.big}`} data-edu-text-draft>Taslak · hukuk incelemesi bekliyor</span> : null}
        </div>
        <div className={oz.legal} tabIndex={0} aria-label="İzin metni">{text.body}</div>
        <p className={oz.sha}>Sürüm {text.version} · SHA-256 {text.sha256}</p>
      </article>
      <article className={base.panel}>
        <h2 className={base.h2}>İzin bilgileri</h2>
        <p className={base.lead}>Danışan: {clientLabel}</p>
        <div className={oz.form2}>
          <label className={oz.field}>İzni veren (ad soyad)
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" data-edu-consenter />
          </label>
          <label className={oz.field}>İzni veren kişi
            <select value={relation} onChange={(e) => setRelation(e.target.value as "danisan" | "yasal_temsilci")}>
              <option value="danisan">Danışanın kendisi</option><option value="yasal_temsilci">Yasal temsilcisi</option>
            </select>
          </label>
          <label className={oz.field}>İzin tarihi
            <input type="date" value={givenOn} max={today()} onChange={(e) => setGivenOn(e.target.value)} data-edu-given-on />
          </label>
          <label className={oz.field}>İzin yöntemi
            <select value={method} onChange={(e) => setMethod(e.target.value as PrivConsentMethod)} data-edu-method>
              {(Object.keys(PRIV_METHOD_LABEL) as PrivConsentMethod[]).map((m) => <option key={m} value={m}>{PRIV_METHOD_LABEL[m]}</option>)}
            </select>
          </label>
        </div>
        <fieldset className={oz.fieldset}>
          <legend className={oz.legend}>Sunum kapsamı</legend>
          <div className={oz.stack}>
            <label className={`${oz.radio} ${scope === "anonim" ? oz.radioOn : ""}`}>
              <input type="radio" name="edu-scope" checked={scope === "anonim"} onChange={() => setScope("anonim")} data-edu-scope="anonim" />
              <span><b>Anonim (takma ad)</b><small>Önerilen · danışanın adı eğitimde hiçbir yerde görünmez</small></span>
            </label>
            <label className={`${oz.radio} ${scope === "acik_isim" ? oz.radioOn : ""}`}>
              <input type="radio" name="edu-scope" checked={scope === "acik_isim"} onChange={() => setScope("acik_isim")} data-edu-scope="acik_isim" />
              <span><b>Açık isim</b><small>Ayrı açık isim onayı + imzalı yöntem gerekir; e-posta onayı yetmez</small></span>
            </label>
          </div>
          {scope === "acik_isim" ? (
            <label className={oz.chk}><input type="checkbox" checked={namedOk} onChange={(e) => setNamedOk(e.target.checked)} data-edu-named-ok />
              <span>Danışan, adının eğitimde gösterilmesine imzalı belgede <b>ayrıca</b> onay verdi.</span></label>
          ) : null}
          {scope === "acik_isim" && method === "kayitli_eposta" ? <p className={oz.fieldErr}>Açık isim için kayıtlı e-posta yöntemi yeterli değil.</p> : null}
          <label className={oz.chk}><input type="checkbox" checked={birth} onChange={(e) => setBirth(e.target.checked)} data-edu-birth />
            <span>Doğum tarihi, saati ve yeri eğitimde gösterilebilir (ayrı izin; işaretlenmezse bu bilgiler sunucudan hiç gönderilmez).</span></label>
        </fieldset>
        <div className={oz.upload}>
          <div><b>İmzalı izin kopyası</b><small>{file ? `${file.name} · ${MIMES[file.mime]} · ${(file.size / 1024).toFixed(0)} KB` : "PDF, PNG veya JPEG · en fazla 2 MB · yalnız siz ve sistem sahibi indirebilir"}</small></div>
          <input id="edu-evidence" className={oz.fileInput} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => void pickFile(e.target.files?.[0])} data-edu-evidence />
          <label htmlFor="edu-evidence" className={oz.fileLabel}>{file ? "Dosyayı değiştir" : "Dosya seç"}</label>
        </div>
        {fileErr ? <p className={oz.fieldErr} role="alert">{fileErr}</p> : null}
        <p className={`${base.note} ${base.warn}`}>Bir kutunun işaretlenmesi tek başına izin kanıtı değildir. İmzalı kopya olmadan izin kaydedilemez.</p>
        {err ? <p className={base.err} role="alert" data-edu-error>{err}</p> : null}
        <div className={base.actions}>
          <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={onCancel} disabled={busy}>Vazgeç</button>
          <button type="button" className={`${base.btn} ${base.save} ${oz.touch}`} onClick={save} disabled={!canSave} data-edu-consent-save>{busy ? "Kaydediliyor…" : "İzni kaydet"}</button>
        </div>
      </article>
    </div>
  );
}
