"use client";

// "HUMAN DESIGN KAYDINI TAMAMEN SİL" — üç aşamalı onay (owner kararı 2026-10-16).
//   1) Kapsam: hangi danışan, neler silinir / neler KORUNUR (Danışan Yolculuğu + diğer modüller).
//   2) Kesin sayılar (sunucu önizlemesi: analiz + Word raporu) ve kalıcılık uyarısı.
//   3) Danışan adını YAZARAK son onay (Türkçe büyük/küçük harf ve boşluk duyarsız).
// Silme isteği yalnız 3. adımda, tek kez gönderilir (çift tıklama kilidi); sunucu onaydaki sayılardan
// fazla kayıt bulursa hiçbir şey silmez (409). ESC / dışarı tıklama / Android geri = VAZGEÇ (asla silme).
// "Silindi" yalnız sunucudan gerçek başarı gelince gösterilir.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteHdClient, previewHdClientDelete, type HdClientDeleteScope } from "../helpers/hdClients";
import { notifyHdProfileDeleted } from "@/lib/human-design/api/chartsClient";
import { normalizeHdPersonName } from "@/lib/human-design/api/hdIdentity";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { useHdBodyScrollLock } from "../../components/useHdBodyScrollLock";

export type HdFullDeleteResult = { deletedAnalyses: number; deletedReports: number; storageWarning: boolean };

export function HdFullDeleteDialog({
  hdClientId,
  name,
  onDeleted,
  onCancel,
}: {
  hdClientId: string;
  name: string;
  onDeleted: (r: HdFullDeleteResult) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scope, setScope] = useState<HdClientDeleteScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const cancel = () => {
    if (!sending.current) onCancel();
  };
  useHdModalA11y(ref, cancel);
  useHdBodyScrollLock();

  // Android / tarayıcı GERİ: pencere açıkken bir geçmiş girdisi eklenir; geri hareketi yalnız pencereyi
  // KAPATIR (vazgeç) — silme isteği asla gönderilmez, sayfadan da çıkılmaz.
  useEffect(() => {
    const marker = { hdFullDelete: true };
    window.history.pushState(marker, "");
    const onPop = () => cancel();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state && (window.history.state as { hdFullDelete?: boolean }).hdFullDelete) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toStep2() {
    setBusy(true);
    setError(null);
    const r = await previewHdClientDelete(hdClientId);
    setBusy(false);
    if (!r.scope) {
      setError(`Silinecek kayıtlar belirlenemedi; hiçbir şey silinmedi. ${r.error ?? ""}`.trim());
      return;
    }
    setScope(r.scope);
    setStep(2);
  }

  const nameOk = normalizeHdPersonName(typed) !== "" && normalizeHdPersonName(typed) === normalizeHdPersonName(name);

  async function confirmDelete() {
    if (!scope || !nameOk || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const res = await deleteHdClient(hdClientId, { analyses: scope.analyses, reports: scope.reports });
    sending.current = false;
    setBusy(false);
    // Sonuç ne olursa olsun listeler sunucudan yenilensin (kısmi silme / ağ hatası görünür kalsın).
    notifyHdProfileDeleted(hdClientId);
    if (res.error) {
      setError(`Silinemedi: ${res.error}`);
      return;
    }
    onDeleted({
      deletedAnalyses: res.deletedAnalyses ?? 0,
      deletedReports: res.deletedReports ?? 0,
      storageWarning: !!res.warnings?.includes("storage_cleanup_failed"),
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-slate-900/55 px-4 py-6 sm:items-center">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hd-full-del-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white shadow-2xl focus:outline-none"
        data-hd-full-delete={step}
      >
        <div className="border-b border-rose-100 bg-rose-50/70 px-5 py-4">
          <p className="m-0 text-[11px] font-black uppercase tracking-widest text-rose-600">Adım {step} / 3</p>
          <h2 id="hd-full-del-title" className="m-0 mt-1 text-base font-black text-slate-900">Human Design kaydını tamamen sil</h2>
          <p className="m-0 mt-1 break-words text-sm font-bold text-slate-800">{name}</p>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-slate-700">
          {step === 1 ? (
            <>
              <p className="m-0">Bu danışanın bu hesaptaki <strong>bütün Human Design kayıtları</strong> silinecek:</p>
              <ul className="m-0 list-disc space-y-0.5 pl-5">
                <li>Human Design profili ve doğum bilgileri</li>
                <li>Tüm Human Design analizleri ve kayıtlı profesyonel haritalar</li>
                <li>Bu analizlere ait Word raporları ve rapor görselleri</li>
              </ul>
              <p className="m-0 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
                <strong>Korunur:</strong> Danışan Yolculuğu&apos;ndaki danışan kaydı, diğer modüllerdeki (Numeroloji, Gökyüzü Atlası, Refleksoloji vb.) veriler ve başka danışanlar.
              </p>
            </>
          ) : step === 2 && scope ? (
            <>
              <p className="m-0" data-hd-full-delete-counts>
                Kalıcı olarak silinecek: <strong>{scope.analyses} Human Design analizi</strong> ve <strong>{scope.reports} Word raporu</strong>.
              </p>
              {scope.journeyLinked ? (
                <p className="m-0 text-emerald-800">Danışan Yolculuğu kaydı silinmez; yalnız Human Design bağlantısı kalkar.</p>
              ) : null}
              <p className="m-0 font-bold text-rose-700">Bu işlem geri alınamaz. Silinen Human Design bilgileri daha sonra yeni analizde geri gelmez.</p>
            </>
          ) : (
            <>
              <label htmlFor="hd-full-del-name" className="block font-bold text-slate-800">
                Onaylamak için danışanın adını yazın: <span className="font-black">{name}</span>
              </label>
              <input
                id="hd-full-del-name"
                type="text"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-10 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                data-hd-full-delete-name
              />
            </>
          )}
          {error ? (
            <p role="alert" className="m-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={cancel} disabled={busy} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" data-hd-full-delete-cancel>
            Vazgeç
          </button>
          {step === 1 ? (
            <button type="button" onClick={() => void toStep2()} disabled={busy} className="h-9 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60" data-hd-full-delete-next>
              {busy ? "Kontrol ediliyor…" : "Devam et"}
            </button>
          ) : step === 2 ? (
            <button type="button" onClick={() => setStep(3)} className="h-9 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50" data-hd-full-delete-next>
              Anladım, devam et
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={!nameOk || busy}
              className="h-9 rounded-xl bg-rose-600 px-4 text-sm font-black text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-hd-full-delete-confirm
            >
              {busy ? "Siliniyor…" : "Kalıcı olarak sil"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
