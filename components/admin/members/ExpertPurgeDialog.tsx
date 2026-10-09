"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import PasswordInput from "@/components/ui/PasswordInput";
import { PURGE_FINAL_PHRASE, purgeEmailMatches } from "@/lib/admin/expertPurge";
import { normalizeBulkPhrase } from "@/lib/ui/bulkDeleteGuard";

export type PurgeTarget = { id: string; fullName: string; email: string };

export type PurgeResult = { deletedRows: number; storageRemoved: number; storageFailures: number };

type Props = {
  target: PurgeTarget | null;
  /** x-admin-id + x-session-token başlıklarını üreten fonksiyon (sayfanın mevcut yardımcısı). */
  headers: () => Record<string, string>;
  onClose: () => void;
  onPurged: (target: PurgeTarget, result: PurgeResult) => void;
};

const cancelBtn =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
const continueBtn =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-black text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50";
const inputCls =
  "mt-2 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-[16px] font-semibold text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 sm:text-sm";

/**
 * OWNER-ONLY arşiv uzman KALICI silme — 3 AYRI aşama (her biri ayrı ekran):
 *   1) Uyarı: "Bu uzman ve ilişkili verileri kalıcı olarak silmek üzeresiniz."
 *   2) Uzmanın e-posta adresini elle yazma (yanlış uzmanı silme riskine karşı)
 *   3) Son onay: "KALICI OLARAK SİL" yazma + owner parolası → "Kalıcı Olarak Sil"
 * Gerçek istek yalnız 3. aşamada, tek sefer gönderilir (ref kilidi + buton disabled).
 * Yetki sunucuda (route + DB) yeniden doğrulanır; bu bileşen yalnız UI'dır.
 */
export function ExpertPurgeDialog({ target, headers, onClose, onPurged }: Props) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submitRef = useRef(false);
  // Çift tıklama kalkanı: aşama değişiminden hemen sonraki tıklama yok sayılır.
  const stageAtRef = useRef(0);
  const advance = (next: 2 | 3) => {
    if (Date.now() - stageAtRef.current < 450) return;
    stageAtRef.current = Date.now();
    setStage(next);
  };
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage(1);
    setEmail("");
    setPhrase("");
    setPassword("");
    setError("");
    setSubmitting(false);
    submitRef.current = false;
    // Kalkan her açılışta yeniden başlar: açan tıklamanın çift tıklaması "Devam Et"e düşmez.
    stageAtRef.current = Date.now();
  }, [open, target?.id]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitRef.current) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, stage, onClose]);

  if (!target || typeof document === "undefined") return null;

  const emailOk = purgeEmailMatches(email, target.email);
  const phraseOk = normalizeBulkPhrase(phrase) === normalizeBulkPhrase(PURGE_FINAL_PHRASE);
  const canSubmit = emailOk && phraseOk && password.trim().length > 0 && !submitting;

  async function submit() {
    if (!target || !canSubmit || submitRef.current) return;
    if (Date.now() - stageAtRef.current < 450) return;
    submitRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}/purge`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: password.trim(), confirmEmail: email.trim(), finalPhrase: phrase }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        deletedRows?: number;
        storageRemoved?: number;
        storageFailures?: number;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Kalıcı silme başarısız (HTTP ${res.status}). Hiçbir veri silinmedi.`);
        submitRef.current = false;
        setSubmitting(false);
        return;
      }
      onPurged(target, {
        deletedRows: Number(json.deletedRows ?? 0),
        storageRemoved: Number(json.storageRemoved ?? 0),
        storageFailures: Number(json.storageFailures ?? 0),
      });
    } catch {
      setError("Ağ hatası: kalıcı silmenin sonucu doğrulanamadı. Arşiv listesini yenileyip kontrol edin.");
      submitRef.current = false;
      setSubmitting(false);
    }
  }

  let body: React.ReactNode;
  if (stage === 1) {
    body = (
      <>
        <h3 className="text-lg font-black leading-snug text-slate-950">
          Bu uzman ve ilişkili verileri kalıcı olarak silmek üzeresiniz.
        </h3>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
          <p className="font-black text-slate-900">{target.fullName}</p>
          <p className="break-all font-semibold text-slate-600">{target.email}</p>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] font-semibold leading-relaxed text-slate-700">
          <li>Uzman hesabı ve tüm oturumları</li>
          <li>Uzmanın danışanları, kayıtları, kütüphaneleri, raporları ve diğer tüm iş verisi</li>
          <li>Uzmana ait yüklenmiş dosyalar (fotoğraf, belge, PDF…)</li>
        </ul>
        <p className="mt-3 text-[13px] font-medium text-slate-500">
          Yasal/denetim amaçlı değiştirilemez kayıtlar (yönetici işlem geçmişi vb.) korunur.
        </p>
        <p className="mt-2 text-sm font-black text-rose-700">Bu işlem geri alınamaz.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} className={cancelBtn}>Vazgeç</button>
          <button type="button" onClick={() => advance(2)} className={continueBtn} data-testid="purge-step1-continue">
            Devam Et
          </button>
        </div>
      </>
    );
  } else if (stage === 2) {
    body = (
      <>
        <h3 className="text-lg font-black leading-snug text-slate-950">Doğrulama — uzmanın e-posta adresini yazın</h3>
        <p className="mt-2 text-[13px] font-medium text-slate-600">
          Yanlış uzmanı silmemek için silinecek hesabın e-posta adresini aynen yazın:
        </p>
        <p className="mt-2 select-all break-all rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/70 px-3 py-2 text-center font-mono text-sm font-black text-rose-800">
          {target.email}
        </p>
        <label className="mt-3 block text-[13px] font-bold text-slate-600">
          E-posta adresi
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            data-testid="purge-email"
            className={inputCls}
          />
        </label>
        {email.trim() && !emailOk ? (
          <p className="mt-1 text-xs font-bold text-rose-700">E-posta silinecek hesapla eşleşmiyor.</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} className={cancelBtn}>Vazgeç</button>
          <button type="button" disabled={!emailOk} onClick={() => advance(3)} className={continueBtn} data-testid="purge-step2-continue">
            Devam Et
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h3 className="text-lg font-black leading-snug text-rose-700">Son Onay — Bu işlem geri alınamaz.</h3>
        <p className="mt-2 text-[13px] font-medium text-slate-600">
          <b>{target.fullName}</b> ({target.email}) hesabı ve tüm ilişkili verileri kalıcı olarak silinecek.
        </p>
        <label className="mt-3 block text-[13px] font-bold text-slate-600">
          Onaylamak için “{PURGE_FINAL_PHRASE}” yazın
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={submitting}
            data-testid="purge-phrase"
            className={inputCls}
          />
        </label>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">Büyük/küçük harf ve ı/i farkı önemsizdir.</p>
        <label className="mt-3 block text-[13px] font-bold text-slate-600">
          Sistem sahibi parolası
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={submitting}
            data-testid="purge-password"
            className={inputCls}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={submitting} className={cancelBtn}>Vazgeç</button>
          <button type="button" disabled={!canSubmit} onClick={() => void submit()} className={dangerBtn} data-testid="purge-submit">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {submitting ? "Siliniyor…" : "Kalıcı Olarak Sil"}
          </button>
        </div>
      </>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10040] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={() => { if (!submitRef.current) onClose(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="expert-purge-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-[22px] border border-white/90 bg-white p-5 shadow-2xl ring-1 ring-rose-100 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span id="expert-purge-title" className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            UZMANI KALICI SİL
          </span>
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Adım {stage}/3</span>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}
