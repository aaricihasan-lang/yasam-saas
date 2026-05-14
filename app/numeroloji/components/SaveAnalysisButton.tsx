"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantIdFromStorage, saveNumerologyAnalysis } from "../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";

type Props = {
  fullName: string;
  birthDateDisplay: string;
  motorOutput: NumerolojiMotorOut;
  clientId?: string | null;
  /** true: kayıt sonrası detay sayfasına git */
  navigateToDetail?: boolean;
};

export function SaveAnalysisButton({
  fullName,
  birthDateDisplay,
  motorOutput,
  clientId,
  navigateToDetail = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setMessage(null);
    const tenantId = getTenantIdFromStorage();
    if (!tenantId) {
      setMessage("Kaydetmek için giriş yapmalısınız (tenant bilgisi yok).");
      return;
    }
    if (!fullName.trim()) {
      setMessage("Ad soyad boş olamaz.");
      return;
    }

    setBusy(true);
    const { error, id } = await saveNumerologyAnalysis({
      tenantId,
      clientId: clientId ?? null,
      fullName,
      birthDate: birthDateDisplay,
      motor: motorOutput,
    });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("Analiz kaydedildi.");
    if (navigateToDetail) {
      if (id) router.push(`/numeroloji/liste/${id}`);
      else router.push("/numeroloji/liste");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-xl border border-emerald-200/90 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Kaydediliyor…" : "Analizi Kaydet"}
      </button>
      {message ? (
        <p className="max-w-xs text-right text-[11px] font-medium text-slate-600" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
