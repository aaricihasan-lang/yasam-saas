"use client";

/**
 * Profil ↔ merkezî danışan kimlik eşleştirmesi (Aşama 7B). Yalnız kimlik tanıma amaçlıdır:
 * Danışan Yolculuğu'na harita / hesap / yorum / not / rapor AKTARILMAZ.
 *   • Eşleştir: aday ara → ön izle → "Bu Danışanla Eşleştir" (açık onay).
 *   • Başka danışana yeniden bağlama: ayrıca mevcut ve yeni danışanı gösteren onay adımı.
 *   • Kaldır: onay adımı; profil, revizyonlar ve kayıtlı analizler SİLİNMEZ.
 *   • Bağlı danışan artık bulunamıyorsa (silinmiş / erişim dışı) uyarı + bağı kaldırma.
 * Sunucu her adımda yeniden doğrular (uzman sahipliği, tenant, ekrandaki mevcut bağ = expectedClientId).
 */

import { useState } from "react";
import { astroFetch } from "../_lib/api";
import ClientCandidateSearch, { type ClientCandidate } from "./ClientCandidateSearch";
import ClientPreviewModal from "./ClientPreviewModal";

type Props = {
  profileId: string;
  profileLabel: string;
  birthDate: string | null;
  clientId: string | null;
  clientName: string | null;
  clientMissing: boolean;
  onChanged: () => void;
};

function nameFromLabel(label: string): string {
  return label.split(/\s[—–-]\s/)[0]?.trim() ?? label;
}

export default function ClientLinkPanel({ profileId, profileLabel, birthDate, clientId, clientName, clientMissing, onChanged }: Props) {
  const [mode, setMode] = useState<"idle" | "search" | "unlink">("idle");
  const [pending, setPending] = useState<ClientCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  async function link(c: ClientCandidate, confirmRelink: boolean) {
    setBusy(true);
    setError(null);
    const r = await astroFetch(`/api/admin/astroloji/profiles/${profileId}/client`, {
      method: "PUT",
      body: { clientId: c.id, expectedClientId: clientId, confirmRelink },
    });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "RELINK_CONFIRM_REQUIRED") {
        setPending(c);
        return;
      }
      setError(r.error);
      return;
    }
    setPending(null);
    setMode("idle");
    onChanged();
  }

  async function unlink() {
    if (!clientId) return;
    setBusy(true);
    setError(null);
    const r = await astroFetch(`/api/admin/astroloji/profiles/${profileId}/client?expectedClientId=${clientId}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMode("idle");
    onChanged();
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" aria-label="Danışan eşleştirmesi" data-testid="astro-client-link">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Danışan Yolculuğu eşleştirmesi</span>
          {clientId && !clientMissing ? (
            <p className="text-emerald-800">
              Eşleşik: <strong>{clientName ?? "Adsız danışan"}</strong>
            </p>
          ) : clientMissing ? (
            <p className="text-amber-800">Eşleşik danışan kaydı artık bulunamıyor (silinmiş ya da erişim dışı). Astroloji kayıtlarınız etkilenmedi.</p>
          ) : (
            <p className="text-slate-600">Eşleştirme yok (bağımsız profil).</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {clientId && !clientMissing && (
            <button type="button" onClick={() => setPreview(true)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700">
              Danışan Ön İzleme
            </button>
          )}
          <button type="button" onClick={() => { setMode(mode === "search" ? "idle" : "search"); setPending(null); }} className="rounded-lg border border-emerald-400 bg-white px-2.5 py-1 text-xs text-emerald-800">
            {clientId ? "Başka danışanla değiştir" : "Danışanla eşleştir"}
          </button>
          {clientId && (
            <button type="button" onClick={() => setMode("unlink")} className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs text-rose-700">
              Eşleştirmeyi kaldır
            </button>
          )}
        </div>
      </div>

      {mode === "unlink" && clientId && (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-white p-2 sm:flex-row sm:items-center sm:justify-between" role="alertdialog" aria-label="Eşleştirmeyi kaldır onayı">
          <p className="text-xs text-rose-800">Eşleştirme kaldırılsın mı? Profil, revizyonlar ve kayıtlı analizler silinmez; yalnız danışan bağı kopar.</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setMode("idle")} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs">
              Vazgeç
            </button>
            <button type="button" disabled={busy} onClick={() => void unlink()} className="rounded-lg bg-rose-700 px-2.5 py-1 text-xs text-white disabled:opacity-60">
              Evet, kaldır
            </button>
          </div>
        </div>
      )}

      {mode === "search" && !pending && (
        <ClientCandidateSearch initialName={nameFromLabel(profileLabel)} initialBirthDate={birthDate ?? ""} currentClientId={clientMissing ? null : clientId} busy={busy} onChoose={(c) => void link(c, false)} />
      )}

      {pending && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2" role="alertdialog" aria-label="Yeniden eşleştirme onayı" data-testid="astro-relink-confirm">
          <p className="text-xs text-amber-900">
            Bu profil şu an <strong>{clientMissing ? "bulunamayan bir danışanla" : clientName ? `${clientName} ile` : "başka bir danışanla"}</strong> eşleşik. <strong>{pending.name ?? "Seçilen danışan"}</strong> (#{pending.ref}) ile değiştirmek istediğinize emin misiniz? Önceki kayıtlı analizlerin içeriği değişmez.
          </p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs">
              Vazgeç
            </button>
            <button type="button" disabled={busy} onClick={() => void link(pending, true)} className="rounded-lg bg-amber-700 px-2.5 py-1 text-xs text-white disabled:opacity-60">
              Evet, bu danışanla eşleştir
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-700">{error}</p>}
      {preview && clientId && <ClientPreviewModal clientId={clientId} onClose={() => setPreview(false)} />}
    </section>
  );
}
