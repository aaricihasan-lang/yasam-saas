"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { saveNumerologyAnalysis } from "../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";

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
  const [busy, setBusy] = useState(false);
  const isDemo = readYasamUser()?.is_demo_account === true;

  const disabled = busy || !motorOutput || !firstName.trim() || !lastName.trim() || !birthDateDisplay.trim();

  // Demo hesapta kayıt butonu gösterilmez
  if (isDemo) return null;

  async function handleClick() {
    if (!motorOutput) return;

    setBusy(true);
    const { error, id } = await saveNumerologyAnalysis({
      name: firstName.trim(),
      surname: lastName.trim(),
      birthDate: birthDateDisplay.trim(),
      motor: motorOutput,
    });
    setBusy(false);

    if (error) {
      showToast({
        title: "Kayıt yapılamadı",
        message: error,
        type: "error",
      });
      return;
    }

    if (id) {
      console.log("[numeroloji] Kayıt id:", id);
    }

    showToast({
      message: "Analiz kaydedildi",
      type: "success",
    });
  }

  return (
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
      {busy ? "Kaydediliyor…" : "KAYDET"}
    </button>
  );
}
