"use client";

import { useMemo, useState } from "react";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { listNumerologyAnalyses, saveNumerologyAnalysis } from "../helpers/numerolojiKayit";
import { findDuplicateRecords, type DuplicateCandidate } from "../helpers/duplicateRecord";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import { DuplicateRecordDialog } from "./DuplicateRecordDialog";

type Props = {
  firstName: string;
  lastName: string;
  birthDateDisplay: string;
  motorOutput: NumerolojiMotorOut | null;
  className?: string;
  variant?: "default" | "premium";
};

export function SaveAnalysisButton({
  firstName,
  lastName,
  birthDateDisplay,
  motorOutput,
  className = "",
  variant = "default",
}: Props) {
  const { showToast } = useToast();
  // Çift kayıt koruması: senkron kilit + başarıdan sonra aynı analiz (imza) değişmedikçe
  // buton "Kaydedildi ✓" olarak pasif kalır (tekrar tık → ikinci insert olmaz).
  const { run, pending: busy } = useSubmitLock();
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  // D2: açık uyarı — "duplicate" (eşleşen kayıtlar) ya da "checkFailed" (liste okunamadı); bekleyen kayıt
  // imza + motor anlık görüntüsüyle tutulur. Kontrol yapılamazsa OTOMATİK kayıt yapılmaz.
  const [dialog, setDialog] = useState<
    { mode: "duplicate" | "checkFailed"; sig: string; motor: NumerolojiMotorOut; matches: DuplicateCandidate[] } | null
  >(null);
  const [phase, setPhase] = useState<"check" | "save" | null>(null);
  const isDemo = readYasamUser()?.is_demo_account === true;

  const signature = useMemo(
    () =>
      JSON.stringify([
        firstName.trim(),
        lastName.trim(),
        birthDateDisplay.trim(),
        motorOutput ?? null,
      ]),
    [firstName, lastName, birthDateDisplay, motorOutput],
  );
  const alreadySaved = savedSignature !== null && savedSignature === signature;

  const disabled =
    busy || dialog !== null || alreadySaved || !motorOutput || !firstName.trim() || !lastName.trim() || !birthDateDisplay.trim();

  // Demo hesapta kayıt butonu gösterilmez
  if (isDemo) return null;

  /** Önceki kayıtları denetler: eşleşmeler | "failed" (liste okunamadı / zaman aşımı) | undefined (kilitli). */
  async function checkDuplicates(): Promise<DuplicateCandidate[] | "failed" | undefined> {
    try {
      return await run(async () => {
        setPhase("check");
        try {
          const list = await listNumerologyAnalyses();
          if (list.error) return "failed" as const;
          return findDuplicateRecords(list.data, { name: firstName, surname: lastName, birthDate: birthDateDisplay });
        } finally {
          setPhase(null);
        }
      });
    } catch {
      return "failed";
    }
  }

  /** Denetim sonucuna göre: eşleşme yok → kaydet; eşleşme → uyarı; denetlenemedi → "kontrol edilemedi" uyarısı. */
  async function proceed(sig: string, motor: NumerolojiMotorOut, result: DuplicateCandidate[] | "failed") {
    if (result === "failed") {
      setDialog({ mode: "checkFailed", sig, motor, matches: [] });
      return;
    }
    if (result.length > 0) {
      setDialog({ mode: "duplicate", sig, motor, matches: result });
      return;
    }
    setDialog(null);
    await save(sig, motor);
  }

  async function handleClick() {
    if (!motorOutput || alreadySaved) return;
    const sig = signature;
    const motor = motorOutput;
    // D2: aynı ad + soyad + doğum tarihiyle kayıt var mı? Kayıttan ÖNCE denetlenir.
    const result = await checkDuplicates();
    if (result === undefined) return; // kilitliyken ikinci tık: yok say
    await proceed(sig, motor, result);
  }

  async function save(sig: string, motor: NumerolojiMotorOut) {
    let error: string | null | undefined;
    try {
      const result = await run(async () => {
        setPhase("save");
        try {
          return await saveNumerologyAnalysis({
            name: firstName.trim(),
            surname: lastName.trim(),
            birthDate: birthDateDisplay.trim(),
            motor,
          });
        } finally {
          setPhase(null);
        }
      });
      if (!result) return; // kilitliyken ikinci tık: yok say
      error = result.error;
    } catch (e) {
      error = e instanceof Error ? e.message : "Bilinmeyen hata";
    }

    if (error) {
      showToast({
        title: "Kayıt yapılamadı",
        message: error,
        type: "error",
      });
      return;
    }

    setSavedSignature(sig);
    showToast({
      message: "Analiz kaydedildi",
      type: "success",
    });
  }

  return (
    <>
    <DuplicateRecordDialog
      open={dialog !== null}
      mode={dialog?.mode ?? "duplicate"}
      matches={dialog?.matches ?? []}
      saving={phase === "save"}
      checking={phase === "check"}
      onCancel={() => {
        if (phase === null) setDialog(null);
      }}
      onRetry={async () => {
        const d = dialog;
        if (!d || phase !== null) return;
        const result = await checkDuplicates();
        if (result === undefined) return;
        await proceed(d.sig, d.motor, result);
      }}
      onSaveAnyway={async () => {
        const d = dialog;
        if (!d || phase !== null) return;
        await save(d.sig, d.motor);
        setDialog(null);
      }}
    />
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={
        variant === "premium"
          ? `min-w-[140px] flex-1 rounded-2xl border border-violet-300/70 bg-gradient-to-r from-white via-violet-50/90 to-amber-50/80 px-8 py-4 text-base font-black uppercase tracking-[0.12em] text-violet-900 shadow-[0_10px_28px_-8px_rgba(91,33,182,0.35)] ring-1 ring-violet-200/60 transition duration-200 hover:scale-[1.02] hover:border-amber-300/60 hover:shadow-[0_14px_36px_-6px_rgba(91,33,182,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:scale-100 disabled:border-slate-200 disabled:bg-slate-100/80 disabled:text-slate-400 disabled:shadow-none sm:flex-none ${className}`
          : `rounded-2xl border border-violet-300/80 bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-violet-900 shadow-sm ring-1 ring-violet-100/80 transition hover:border-amber-300/70 hover:bg-amber-50/90 hover:text-amber-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100/80 disabled:text-slate-400 disabled:shadow-none disabled:ring-slate-100 sm:w-auto ${className}`
      }
    >
      {busy ? (phase === "check" ? "Kontrol ediliyor…" : "Kaydediliyor…") : alreadySaved ? "Kaydedildi ✓" : "KAYDET"}
    </button>
    </>
  );
}
