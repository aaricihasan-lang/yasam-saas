"use client";

/**
 * Kalıcı profil silme onay akışı.
 *   • Tekli: 2 ayrı "Evet" (1: kimlik + analiz sayıları · 2: geri alınamaz uyarısı).
 *   • Toplu: 3 ayrı "Evet"; her adımda seçili profil sayısı; son adım açıkça geri alınamaz kalıcı silme.
 *   • İsim yazdırma / metin girme YOK. Seçim değişirse akış baştan başlar (bileşen seçime anahtarlıdır).
 *   • Sunucu da aynı onay sayısını ve onaylanan durumu zorlar; çift tık / tekrar güvenlidir (busy + sunucu kilidi).
 *   • Bu işlem KVKK kapsamlı silme değildir; kişinin diğer modüllerdeki kayıtları silinmez.
 */

import { useEffect, useRef, useState } from "react";
import { astroFetch } from "../_lib/api";

type Preview = {
  mode: "single" | "bulk";
  requiredConfirmations: number;
  profileCount: number;
  totals: { ownAnalyses: number; sharedPreserved: number };
  profiles: { id: string; label: string; archived: boolean; ownAnalyses: number; sharedPreserved: number }[];
  confirmToken: string;
};

export type DeleteResult = { deletedProfiles: number; deletedAnalyses: number; preservedSharedAnalyses: number };

export default function ProfileDeleteFlow({
  mode,
  profileIds,
  onClose,
  onDeleted,
}: {
  mode: "single" | "bulk";
  profileIds: string[];
  onClose: () => void;
  onDeleted: (r: DeleteResult) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void astroFetch<Preview>("/api/admin/astroloji/profiles/delete/preview", { method: "POST", body: { mode, profileIds } }).then((r) => {
      if (!alive) return;
      setPreview(r.ok ? r.data : null);
      setError(r.ok ? null : r.error);
      setStep(1);
    });
    return () => {
      alive = false;
    };
  }, [mode, profileIds, nonce]);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, step]);

  async function finalDelete() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const r = await astroFetch<DeleteResult>("/api/admin/astroloji/profiles/delete", {
      method: "POST",
      body: { mode, profileIds, confirmToken: preview.confirmToken, confirmations: preview.requiredConfirmations },
    });
    setBusy(false);
    if (r.ok) {
      onDeleted(r.data);
      return;
    }
    setError(r.error);
    setPreview(null);
  }

  const required = preview?.requiredConfirmations ?? (mode === "single" ? 2 : 3);
  const n = preview?.profileCount ?? profileIds.length;
  const last = step === required;
  const single = mode === "single";
  const p0 = preview?.profiles[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-6" data-testid="astro-delete-flow">
      <div role="alertdialog" aria-modal="true" aria-labelledby="astro-delete-title" className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
          <h2 id="astro-delete-title" className="text-base font-semibold text-rose-900">
            {single ? "Profili kalıcı sil" : `${n} profili kalıcı sil`}
          </h2>
          <p className="text-xs text-rose-800" data-testid="astro-delete-step">
            Onay {Math.min(step, required)} / {required}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm text-slate-700">
          {!preview ? (
            error ? (
              <div className="flex flex-col gap-2">
                <p className="text-rose-700">{error}</p>
                <button type="button" onClick={() => setNonce((x) => x + 1)} className="self-start rounded-lg border border-slate-300 px-3 py-1 text-xs">
                  Baştan başlat
                </button>
              </div>
            ) : (
              <p className="text-slate-400">Hazırlanıyor…</p>
            )
          ) : step === 1 ? (
            <div className="flex flex-col gap-2">
              {single && p0 ? (
                <>
                  <p>
                    Silinecek profil: <strong>{p0.label}</strong>
                    {p0.archived ? " (arşivde)" : ""}
                  </p>
                  <p>
                    Bu profile ait kayıtlı analiz: <strong>{p0.ownAnalyses}</strong> — profille birlikte silinir.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Seçili profil sayısı: <strong>{n}</strong>
                  </p>
                  <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs text-slate-600">
                    {preview.profiles.map((p) => (
                      <li key={p.id}>
                        {p.label}
                        {p.archived ? " (arşivde)" : ""} — {p.ownAnalyses} analiz
                      </li>
                    ))}
                  </ul>
                  <p>
                    Bu profillere ait kayıtlı analiz: <strong>{preview.totals.ownAnalyses}</strong> — profillerle birlikte silinir.
                  </p>
                </>
              )}
              <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-900">
                Korunacak ortak analiz: <strong>{preview.totals.sharedPreserved}</strong> — başka profillerin sinastri / composite kayıtları silinmez; içerikleri (bu kişinin kayıt anındaki bilgileri dahil) değişmeden kalır.
              </p>
            </div>
          ) : !last ? (
            <p>
              <strong>{n}</strong> profil ve bunlara ait <strong>{preview.totals.ownAnalyses}</strong> kayıtlı analiz silinecek; <strong>{preview.totals.sharedPreserved}</strong> ortak analiz korunacak. Devam etmek istediğinizden emin misiniz?
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-rose-800">
                {single ? "Bu işlem geri alınamaz." : `${n} profil KALICI olarak silinecek. Bu işlem geri alınamaz.`}
              </p>
              <p>Profil, doğum bilgisi revizyonları, önbellekteki hesap sonuçları, uzman notları ve kendi kayıtlı analizleri kalıcı olarak silinir; arşivden geri getirilemez.</p>
              <p className="text-xs text-slate-500">
                Bu işlem yalnız Astroloji kayıtlarını siler. Kişinin Danışan Yolculuğu ve diğer modüllerdeki kayıtları silinmez; bu bir KVKK kapsamlı kişisel veri silme işlemi değildir.
              </p>
            </div>
          )}
          {preview && error && <p className="mt-2 text-rose-700">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60">
            Vazgeç
          </button>
          {preview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (last ? void finalDelete() : setStep((s) => s + 1))}
              className={`rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-60 ${last ? "bg-rose-700" : "bg-slate-800"}`}
              data-testid="astro-delete-yes"
            >
              {busy ? "Siliniyor…" : last ? "Evet, kalıcı olarak sil" : "Evet, devam et"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
