"use client";

/**
 * Danışan Yolculuğu kaydı ile SINIRLI kimlik eşleştirmesi — aday arama (Aşama 7B).
 *   • Arama sunucuda, YALNIZ uzmanın erişebildiği merkezî danışanlarda (Türkçe karakter / büyük-küçük /
 *     boşluk duyarsız). Kesin eşleşme varsayılmaz: aynı ad + soyad + doğum tarihli kayıtlar ayrı ayrı listelenir.
 *   • Hiçbir şey otomatik bağlanmaz: her aday için "Danışan Ön İzleme" ve açık "Bu Danışanla Eşleştir".
 */

import { useState } from "react";
import { astroFetch } from "../_lib/api";
import ClientPreviewModal from "./ClientPreviewModal";

export type ClientCandidate = {
  id: string;
  ref: string;
  name: string | null;
  birthDate: string | null;
  createdAt: string | null;
  linkedProfileCount: number;
  nameExact: boolean;
};

function fmtDay(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR");
}

export default function ClientCandidateSearch({
  initialName,
  initialBirthDate,
  currentClientId,
  busy,
  onChoose,
}: {
  initialName: string;
  initialBirthDate: string;
  currentClientId: string | null;
  busy?: boolean;
  onChoose: (c: ClientCandidate) => void;
}) {
  const [name, setName] = useState(initialName);
  // FINAL: doğum tarihi İSTEĞE BAĞLI daraltıcıdır ve başlangıçta BOŞTUR (eskiden profilin tarihiyle dolu gelir ve ad
  // aramasına sessizce "VE" koşulu olarak eklenirdi → başka doğum tarihli kişiler gizlenirdi). Profil tarihi tek tıkla eklenebilir.
  const [birthDate, setBirthDate] = useState("");
  const [state, setState] = useState<{ items: ClientCandidate[] | null; error: string | null; loading: boolean; used?: { name: string; birthDate: string } }>({ items: null, error: null, loading: false });
  const [preview, setPreview] = useState<ClientCandidate | null>(null);

  async function search() {
    setState({ items: null, error: null, loading: true });
    const sp = new URLSearchParams();
    if (name.trim()) sp.set("name", name.trim());
    if (birthDate) sp.set("birthDate", birthDate);
    const r = await astroFetch<{ candidates: ClientCandidate[] }>(`/api/admin/astroloji/clients/candidates?${sp.toString()}`);
    setState({ items: r.ok ? r.data.candidates : null, error: r.ok ? null : r.error, loading: false, used: { name: name.trim(), birthDate } });
  }

  const choose = (c: ClientCandidate) => {
    setPreview(null);
    onChoose(c);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3" data-testid="astro-candidate-search">
      <p className="text-xs text-emerald-900">Danışan Yolculuğu kayıtlarınızda olası eşleşmeleri arayın. Aynı ad ve doğum tarihli birden çok kişi olabilir; ön izlemeyle doğrulayıp açıkça seçin.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          maxLength={100}
          placeholder="Ad soyad"
          aria-label="Aday ad soyad"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} aria-label="Doğum tarihi (isteğe bağlı daraltma)" title="İsteğe bağlı: yalnız bu doğum tarihli kayıtları gösterir" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void search()} disabled={state.loading} className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-sm text-emerald-800 disabled:opacity-60">
          {state.loading ? "Aranıyor…" : "Ara"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span>Doğum tarihi isteğe bağlıdır; boş bırakılırsa yalnız ad/soyad ile aranır.</span>
        {initialBirthDate && birthDate !== initialBirthDate && (
          <button type="button" onClick={() => setBirthDate(initialBirthDate)} className="text-emerald-800 underline" data-testid="astro-candidate-use-profile-date">
            Profilin doğum tarihiyle daralt ({fmtDay(initialBirthDate)})
          </button>
        )}
        {birthDate && (
          <button type="button" onClick={() => setBirthDate("")} className="text-slate-700 underline" data-testid="astro-candidate-clear-date">
            Tarih filtresini kaldır
          </button>
        )}
      </div>
      {state.error && <p className="text-xs text-rose-700">{state.error}</p>}
      {state.items && state.items.length === 0 && (
        <p className="text-xs text-slate-600" data-testid="astro-candidates-empty">
          Danışan Yolculuğu&apos;nda eşleşen kayıt bulunamadı
          {state.used?.name ? ` (ad/soyad: “${state.used.name}”` : " ("}
          {state.used?.birthDate ? `${state.used?.name ? ", " : ""}doğum tarihi: ${fmtDay(state.used.birthDate)})` : ")"}.
          {state.used?.birthDate ? " Tarih filtresini kaldırıp yeniden deneyebilirsiniz." : ""}
        </p>
      )}
      {state.items && state.items.length > 0 && (
        <ul className="flex flex-col gap-1.5" data-testid="astro-candidates">
          {state.items.length > 1 && <li className="text-xs font-medium text-amber-800">{state.items.length} olası kayıt — doğru kişiyi ön izlemeyle kontrol edin.</li>}
          {state.items.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium text-slate-800">
                  {c.name ?? "Adsız danışan"} <span className="font-mono text-xs text-slate-500">#{c.ref}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Doğum: {fmtDay(c.birthDate)} · Kayıt: {fmtDay(c.createdAt)}
                  {c.linkedProfileCount > 0 ? ` · ${c.linkedProfileCount} Astroloji profilinize bağlı` : ""}
                  {c.id === currentClientId ? " · ŞU AN EŞLEŞİK" : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button type="button" onClick={() => setPreview(c)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700">
                  Danışan Ön İzleme
                </button>
                <button type="button" disabled={busy || c.id === currentClientId} onClick={() => choose(c)} className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs text-white disabled:opacity-50">
                  Bu Danışanla Eşleştir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <ClientPreviewModal
          clientId={preview.id}
          onClose={() => setPreview(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                Vazgeç
              </button>
              <button type="button" disabled={busy || preview.id === currentClientId} onClick={() => choose(preview)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                Bu Danışanla Eşleştir
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
