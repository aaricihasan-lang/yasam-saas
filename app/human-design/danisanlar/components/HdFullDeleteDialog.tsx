"use client";

// HUMAN DESIGN "SİL" — TEK silme işlemi, İKİ normal onay (owner kararı 2026-10-17).
//   • Profil bağlamı (target.kind "profile"): seçilen danışanın bu hesaptaki BÜTÜN Human Design kayıtları
//     (profil, tüm analizler, Word raporları ve görselleri). Danışan Yolculuğu ana kaydı ve diğer modüller korunur.
//   • Profilsiz eski analiz (target.kind "analysis"): o analiz + ona ait Word raporları (başka HD kaydı yoktur).
//   1) Kapsam + kesin sayılar (sunucu önizlemesi) → Vazgeç / Devam Et
//   2) Son onay ("Bu işlem geri alınamaz") → Vazgeç / Evet, Sil
// Silme isteği yalnız 2. adımda, tek kez gönderilir (çift tıklama kilidi); sunucu önizlemedeki sayılardan
// fazla kayıt bulursa hiçbir şey silmez (409). ESC / dışarı tıklama / Android geri = VAZGEÇ (asla silme).
// "Silindi" yalnız sunucudan gerçek başarı gelince gösterilir.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteHdClient, previewHdClientDelete } from "../helpers/hdClients";
import { deleteComputedChart, notifyHdProfileDeleted, previewHdAnalysisDelete } from "@/lib/human-design/api/chartsClient";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { useHdBodyScrollLock } from "../../components/useHdBodyScrollLock";

export type HdFullDeleteResult = { deletedAnalyses: number; deletedReports: number; storageWarning: boolean };
export type HdDeleteTarget = { kind: "profile"; hdClientId: string } | { kind: "analysis"; chartId: string };

type Scope = { analyses: number; reports: number; journeyLinked: boolean };

export function HdFullDeleteDialog({
  target,
  name,
  onDeleted,
  onCancel,
}: {
  target: HdDeleteTarget;
  name: string;
  onDeleted: (r: HdFullDeleteResult) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [scope, setScope] = useState<Scope | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Kesin kapsam açılışta sunucudan okunur (salt okuma) — iki adımda da gösterilir.
  const targetKey = target.kind === "profile" ? target.hdClientId : target.chartId;
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (target.kind === "profile") {
        const r = await previewHdClientDelete(target.hdClientId);
        if (!alive) return;
        if (r.scope) setScope(r.scope);
        else setError(`Silinecek kayıtlar belirlenemedi; hiçbir şey silinmedi. ${r.error ?? ""}`.trim());
      } else {
        const r = await previewHdAnalysisDelete(target.chartId);
        if (!alive) return;
        if (r.scope) setScope({ analyses: 1, reports: r.scope.reports, journeyLinked: false });
        else setError(`Silinecek kayıtlar belirlenemedi; hiçbir şey silinmedi. ${r.error ?? ""}`.trim());
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  async function confirmDelete() {
    if (!scope || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    if (target.kind === "profile") {
      const res = await deleteHdClient(target.hdClientId, { analyses: scope.analyses, reports: scope.reports });
      sending.current = false;
      setBusy(false);
      // Sonuç ne olursa olsun listeler sunucudan yenilensin (kısmi silme / ağ hatası görünür kalsın).
      notifyHdProfileDeleted(target.hdClientId);
      if (res.error) {
        setError(`Silinemedi: ${res.error}`);
        return;
      }
      onDeleted({
        deletedAnalyses: res.deletedAnalyses ?? 0,
        deletedReports: res.deletedReports ?? 0,
        storageWarning: !!res.warnings?.includes("storage_cleanup_failed"),
      });
      return;
    }
    const res = await deleteComputedChart(target.chartId, scope.reports);
    sending.current = false;
    setBusy(false);
    if (!res.ok) {
      setError(`Silinemedi: ${res.error ?? ""}`.trim());
      return;
    }
    onDeleted({ deletedAnalyses: 1, deletedReports: res.deletedReports ?? 0, storageWarning: !!res.warnings?.includes("storage_cleanup_failed") });
  }

  const counts = scope ? (
    <p className="m-0 text-slate-700" data-hd-full-delete-counts>
      Silinecek: <strong>{scope.analyses} Human Design analizi</strong> ve <strong>{scope.reports} Word raporu</strong>.
    </p>
  ) : !error ? (
    <p className="m-0 text-slate-500">Silinecek kayıtlar kontrol ediliyor…</p>
  ) : null;

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
          <p className="m-0 text-[11px] font-black uppercase tracking-widest text-rose-600">{step === 1 ? "Onay 1 / 2" : "Son onay"}</p>
          <h2 id="hd-full-del-title" className="m-0 mt-1 text-base font-black text-slate-900">Human Design kayıtlarını sil</h2>
          <p className="m-0 mt-1 break-words text-sm font-bold text-slate-800">{name}</p>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-slate-700">
          {step === 1 ? (
            <p className="m-0">
              Bu danışana ait bütün Human Design analizleri, haritaları ve raporları kalıcı olarak silinecek. Danışan Yolculuğu&apos;ndaki ana kayıt korunacaktır. Devam etmek istiyor musunuz?
            </p>
          ) : (
            <p className="m-0 font-bold text-rose-700">
              {name} için tüm Human Design kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?
            </p>
          )}
          {counts}
          {error ? (
            <p role="alert" className="m-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={cancel} disabled={busy} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" data-hd-full-delete-cancel>
            Vazgeç
          </button>
          {step === 1 ? (
            <button type="button" onClick={() => setStep(2)} disabled={!scope} className="h-9 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50" data-hd-full-delete-next>
              Devam Et
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={!scope || busy}
              className="h-9 rounded-xl bg-rose-600 px-4 text-sm font-black text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-hd-full-delete-confirm
            >
              {busy ? "Siliniyor…" : "Evet, Sil"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
