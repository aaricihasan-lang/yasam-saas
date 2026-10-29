"use client";

// H · Güvenli silme. 1–2 kayıt: İKİ aşama (uyarı → son onay). 3+ kayıt: ÜÇ aşama (uyarı → "N KAYDI SİL" yazma → son onay).
// Kural lib/ui/bulkDeleteGuard ile aynıdır ve SUNUCUDA ayrıca doğrulanır (confirmCount + ifade; hepsi-ya-hiçbiri).
// Başarı yalnız sunucu `deleted` sayısını döndürünce gösterilir. Silinen yalnız eğitim arşivi kaydıdır.
import { useEffect, useRef, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import oz from "@/app/_premium/hd-education/ozelArsiv.module.css";
import { BULK_PHRASE_HINT, bulkDeletePhrase, bulkPhraseMatches, requiresBulkDeleteGuard } from "@/lib/ui/bulkDeleteGuard";
import { privCall, type Side } from "./privApi";

export function Modal({ labelId, children, onClose, wide = false }: { labelId: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className={base.ovl} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`${base.mdl} ${wide ? oz.mdlWide : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelId} data-edu-modal>
        {children}
      </div>
    </div>
  );
}

export function DeleteFlow({ side, endpoint, items, onDone, onCancel }: {
  side: Side; endpoint: string; items: { id: string; title: string }[]; onDone: (deleted: number) => void; onCancel: () => void;
}) {
  const n = items.length;
  const triple = requiresBulkDeleteGuard(n);
  const total = triple ? 3 : 2;
  const phrase = bulkDeletePhrase(n);
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const finalStep = step === total;

  async function submit() {
    setBusy(true); setErr(null);
    const r = await privCall<{ deleted: number }>(side, endpoint, { method: "POST", body: { ids: items.map((x) => x.id), confirmCount: n, ...(triple ? { confirmPhrase: typed } : {}) } });
    setBusy(false);
    if (r.ok && r.body.deleted === n) onDone(n);
    else setErr(r.ok ? "Sunucu beklenmeyen bir sonuç döndürdü; hiçbir kayıt silinmemiş olabilir. Listeyi yenileyin." : r.error);
  }

  return (
    <Modal labelId="edu-del-title" onClose={busy ? () => undefined : onCancel}>
      <p className={oz.mStep} data-edu-delete-step={step}>Adım {step} / {total}{finalStep ? " · Son onay" : ""}</p>
      {step === 1 ? (
        <>
          <h2 id="edu-del-title">{n === 1 ? "Bu eğitim kaydı kaldırılsın mı?" : `${n} eğitim kaydı kaldırılsın mı?`}</h2>
          <p>{n === 1 ? <><b>{items[0].title}</b> özel eğitim arşivinden kaldırılacak.</> : <>Seçili {n} kayıt özel eğitim arşivinden kaldırılacak.</>}</p>
          <ul className={oz.keep}>
            <li><span className={oz.keepMark} aria-hidden="true">✓</span><span>Danışanın asıl Human Design haritası <b>silinmez</b></span></li>
            <li><span className={oz.keepMark} aria-hidden="true">✓</span><span>Danışan ve Danışan Yolculuğu kaydı <b>silinmez</b></span></li>
            <li><span className={oz.keepMark} aria-hidden="true">✓</span><span>Diğer analizler, izin kaydı ve Hazır Eğitim Haritaları <b>etkilenmez</b></span></li>
          </ul>
        </>
      ) : null}
      {triple && step === 2 ? (
        <>
          <h2 id="edu-del-title">Doğrulama</h2>
          <p>Devam etmek için aşağıya <b>{phrase}</b> yazın.</p>
          <label className={oz.field}>
            Doğrulama ifadesi
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-edu-delete-phrase aria-describedby="edu-del-hint" />
            <span id="edu-del-hint" className={oz.hint}>{BULK_PHRASE_HINT}</span>
          </label>
        </>
      ) : null}
      {finalStep ? (
        <>
          <h2 id="edu-del-title">Kalıcı olarak kaldır</h2>
          <p>{n === 1 ? "Kayıt" : `${n} kayıt`} ve eğitim notları geri alınamaz şekilde silinir; eski bağlantılar çalışmaz. Sistem yalnız asgari işlem izi tutar (içerik tutulmaz).</p>
        </>
      ) : null}
      {err ? <p className={base.err} role="alert" data-edu-error>{err}</p> : null}
      <div className={base.actions}>
        <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => (step === 1 ? onCancel() : setStep(step - 1))} disabled={busy}>
          {step === 1 ? "Vazgeç" : "Geri"}
        </button>
        {finalStep ? (
          <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={submit} disabled={busy} data-edu-delete-confirm>
            {busy ? "Kaldırılıyor…" : "Kalıcı olarak kaldır"}
          </button>
        ) : (
          <button type="button" className={`${base.btn} ${base.danger} ${oz.touch}`} onClick={() => setStep(step + 1)}
            disabled={triple && step === 2 && !bulkPhraseMatches(typed, phrase)} data-edu-delete-next>
            Devam et
          </button>
        )}
      </div>
    </Modal>
  );
}

/** İki aşamalı genel onay (izni geri çekme / izin silme / anahtar kapatma). */
export function TwoStepConfirm({ title, body1, body2, confirmLabel, danger = true, onConfirm, onCancel, children }: {
  title: string; body1: React.ReactNode; body2: React.ReactNode; confirmLabel: string; danger?: boolean;
  onConfirm: () => Promise<string | null>; onCancel: () => void; children?: React.ReactNode;
}) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal labelId="edu-2s-title" onClose={busy ? () => undefined : onCancel}>
      <p className={oz.mStep} data-edu-confirm-step={step}>Adım {step} / 2{step === 2 ? " · Son onay" : ""}</p>
      <h2 id="edu-2s-title">{title}</h2>
      {step === 1 ? <div>{body1}</div> : <div>{body2}</div>}
      {step === 1 ? children : null}
      {err ? <p className={base.err} role="alert" data-edu-error>{err}</p> : null}
      <div className={base.actions}>
        <button type="button" className={`${base.btn} ${base.ghost} ${oz.touch}`} onClick={() => (step === 1 ? onCancel() : setStep(1))} disabled={busy}>{step === 1 ? "Vazgeç" : "Geri"}</button>
        {step === 1 ? (
          <button type="button" className={`${base.btn} ${danger ? base.danger : base.save} ${oz.touch}`} onClick={() => setStep(2)} data-edu-confirm-next>Devam et</button>
        ) : (
          <button type="button" className={`${base.btn} ${danger ? base.danger : base.save} ${oz.touch}`} disabled={busy} data-edu-confirm-final
            onClick={async () => { setBusy(true); setErr(null); const e = await onConfirm(); setBusy(false); if (e) setErr(e); }}>
            {busy ? "İşleniyor…" : confirmLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}
