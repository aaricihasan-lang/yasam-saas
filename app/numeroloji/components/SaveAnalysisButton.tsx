"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { saveNumerologyAnalysis } from "../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";

type Props = {
  firstName: string;
  lastName: string;
  birthDateDisplay: string;
  motorOutput: NumerolojiMotorOut | null;
  className?: string;
};

export function SaveAnalysisButton({ firstName, lastName, birthDateDisplay, motorOutput, className = "" }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const disabled = busy || !motorOutput || !firstName.trim() || !lastName.trim() || !birthDateDisplay.trim();

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
      className={`rounded-2xl border border-violet-300/80 bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-violet-900 shadow-sm ring-1 ring-violet-100/80 transition hover:border-amber-300/70 hover:bg-amber-50/90 hover:text-amber-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100/80 disabled:text-slate-400 disabled:shadow-none disabled:ring-slate-100 sm:w-auto ${className}`}
    >
      {busy ? "Kaydediliyor…" : "KAYDET"}
    </button>
  );
}
