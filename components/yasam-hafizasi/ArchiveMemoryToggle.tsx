"use client";

/**
 * Kişisel Arşiv → "Yaşam Hafızası'na dahil et" kontrolü (açık opt-in).
 *
 * Bir arşiv kaydı Mesleki Hafıza'ya YALNIZ uzman açıkça onaylarsa girer (safe-non-pii sınıflandırma +
 * sunucunun türettiği içerik özeti). İçerik sonradan değişirse kayıt otomatik olarak Hafıza'dan düşer
 * ve yeniden onay istenir. Yalnız başlık / not / kategori / etiketler aranır; dosya içerikleri
 * (Word/PDF/video) ASLA indekslenmez.
 *
 * Kullanıcının Yaşam Hafızası veya Kişisel Arşiv izni yoksa / Hafıza kapalıysa bileşen HİÇ görünmez.
 */

import { useCallback, useEffect, useState } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { runInEffect } from "@/lib/runInEffect";

type State = "included" | "needs-review" | "excluded";
type Status = { kind: "loading" } | { kind: "hidden" } | { kind: "ready"; state: State; hasIndexableContent: boolean };

const CONFIRM_REASON = "Uzman onayı: kayıt danışana ait kimlik veya özel bilgi içermiyor.";

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = { "x-user-id": readYasamUser()?.id ?? "" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/**
 * Kayıt veya içerik değişince ebeveyn `key` ile YENİDEN MOUNT eder (durum sıfırlanır; effect yalnız
 * sunucudan güncel durumu okur — senkron setState yok).
 */
export default function ArchiveMemoryToggle({ archiveId }: { archiveId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/yasam-hafizasi/archive-classification?archiveId=${encodeURIComponent(archiveId)}`, {
        headers: headers(),
        signal,
      });
      if (!res.ok) { setStatus({ kind: "hidden" }); return; }
      const json = (await res.json().catch(() => null)) as { ok?: boolean; state?: State; hasIndexableContent?: boolean } | null;
      if (!json || json.ok !== true || !json.state) { setStatus({ kind: "hidden" }); return; }
      setStatus({ kind: "ready", state: json.state, hasIndexableContent: json.hasIndexableContent === true });
    } catch {
      if (!signal?.aborted) setStatus({ kind: "hidden" });
    }
  }, [archiveId]);

  useEffect(() => {
    const ctrl = new AbortController();
    runInEffect(() => void load(ctrl.signal));
    return () => ctrl.abort();
  }, [load]);

  const submit = useCallback(async (include: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/yasam-hafizasi/archive-classification", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(include
          ? { archiveId, classification: "safe-non-pii", reason: CONFIRM_REASON }
          : { archiveId, classification: "restricted" }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { code?: string } | null;
        setError(json?.code === "YH_ARC_NO_INDEXABLE_CONTENT"
          ? "Bu kayıtta aranabilir başlık/not bulunmuyor."
          : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
        return;
      }
      setConfirming(false);
      setChecked(false);
      await load();
    } finally {
      setBusy(false);
    }
  }, [archiveId, load]);

  if (status.kind !== "ready") return null;
  const { state, hasIndexableContent } = status;

  return (
    <div className="mt-4 rounded-3xl border border-sky-200/90 bg-sky-50/60 p-5">
      <p className="text-[11px] font-black uppercase tracking-widest text-sky-700">Yaşam Hafızası</p>
      <p className="mt-2 text-sm font-semibold text-slate-800" aria-live="polite">
        {state === "included" && "Bu kayıt Mesleki Hafızanızda aranabilir."}
        {state === "needs-review" && "Kayıt değiştiği için Hafızadan çıkarıldı. Yeniden dahil etmek için onaylayın."}
        {state === "excluded" && "Bu kayıt Mesleki Hafızanıza dahil değil."}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Yalnız başlık, not, kategori ve etiketler aranır. Dosya içerikleri aranmaz.
      </p>

      {state === "included" ? (
        <button type="button" className="btn-secondary mt-3 px-3 py-1.5 text-sm" disabled={busy} onClick={() => void submit(false)}>
          Hafızadan çıkar
        </button>
      ) : !hasIndexableContent ? (
        <p className="mt-3 text-xs text-slate-500">Hafızaya eklemek için kayda başlık veya not ekleyin.</p>
      ) : confirming ? (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>Bu kayıt danışana ait kimlik veya özel bilgi (ad, telefon, adres, sağlık geçmişi vb.) içermiyor.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={busy || !checked} onClick={() => void submit(true)}>
              Onayla ve dahil et
            </button>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy} onClick={() => { setConfirming(false); setChecked(false); }}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-primary mt-3 px-3 py-1.5 text-sm" disabled={busy} onClick={() => setConfirming(true)}>
          Yaşam Hafızası&apos;na dahil et
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{error}</p> : null}
    </div>
  );
}
