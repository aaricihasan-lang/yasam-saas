"use client";

/**
 * Ürün & Stok kategori ekranlarının ortak "Satış Geçmişi" bölümü.
 *
 * Owner kararı (21.10.2026) — iki işlem AYRIDIR ve birbirinin yerine kullanılamaz:
 *   • Satışı İptal Et → satış iptal edilir, stokta hâlâ bulunan ürünlerin miktarı geri eklenir
 *                       (mevcut atomik iptal RPC'si; yalnız henüz iptal edilmemiş satışlar).
 *   • Listeden Sil    → satış YALNIZ görünür listeden kaldırılır; stok, satış durumu ve
 *                       finansal kayıtlar değişmez; "Listeden silinenler" görünümünden geri alınır.
 *
 * Seçim satışın gerçek kimliğiyle (saleId) yapılır — liste sırası (indeks) kullanılmaz.
 * Toplamlar: net = tamamlanmış satışlar (listeden silinenler DAHİL, iptal edilenler HARİÇ).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { runInEffect } from "@/lib/runInEffect";
import { fmtMoney } from "@/lib/urun-stok/dogaltasStockLogic";
import {
  CANCEL_CONFIRM_MESSAGE,
  HIDE_CONFIRM_MESSAGE,
  UNHIDE_CONFIRM_MESSAGE,
  confirmNotes,
  isCancelled,
  isHidden,
  netSalesSummary,
  planCancel,
  planHide,
  planUnhide,
  recordLabel,
  type HistoryRecordLike,
} from "@/lib/urun-stok/salesVisibility";

const btnBase =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45";

export function recordKey(rec: HistoryRecordLike, index: number): string {
  return rec.saleId ? `sale:${rec.saleId}` : `local:${index}`;
}

export default function SalesHistorySection<T extends HistoryRecordLike>({
  records,
  isDemo,
  headClassName = "text-slate-700",
  extraSummary,
  onCancel,
  onHide,
  onUnhide,
  onDetail,
  onNotice,
  loadIssue = null,
}: {
  records: readonly T[];
  isDemo: boolean;
  headClassName?: string;
  extraSummary?: (completed: T[]) => ReactNode;
  onCancel: (eligible: T[]) => Promise<void>;
  onHide: (eligible: T[]) => Promise<void>;
  onUnhide: (eligible: T[]) => Promise<void>;
  onDetail: (rec: T) => void;
  onNotice: (message: string) => void;
  /** Satış Öncesi Hata #3: geçmiş eksik yüklendiyse açıklama — toplamlar kesin sonuç olarak gösterilmez. */
  loadIssue?: string | null;
}) {
  const deleteConfirm = useDeleteConfirm();
  const { confirm } = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const keyed = useMemo(() => records.map((rec, i) => ({ rec, key: recordKey(rec, i) })), [records]);
  const summary = useMemo(() => netSalesSummary(records), [records]);
  const completed = useMemo(() => records.filter((r) => !isCancelled(r)), [records]);
  const visible = useMemo(
    () => keyed.filter(({ rec }) => (showArchive ? isHidden(rec) : !isHidden(rec))),
    [keyed, showArchive],
  );
  const selectedRecs = useMemo(
    () => visible.filter(({ key }) => selected.has(key)).map(({ rec }) => rec),
    [visible, selected],
  );
  const cancelPlan = useMemo(() => planCancel(selectedRecs, isDemo), [selectedRecs, isDemo]);
  const hidePlan = useMemo(() => planHide(selectedRecs, isDemo), [selectedRecs, isDemo]);
  const unhidePlan = useMemo(() => planUnhide(selectedRecs), [selectedRecs]);

  // Liste değişince (yeni satış / iptal / gizleme) artık görünmeyen seçimler düşer.
  useEffect(() => {
    const live = new Set(visible.map((v) => v.key));
    runInEffect(() =>
      setSelected((prev) => {
        let changed = false;
        const next = new Set<string>();
        for (const k of prev) {
          if (live.has(k)) next.add(k);
          else changed = true;
        }
        return changed ? next : prev;
      }),
    );
  }, [visible]);

  async function run(task: () => Promise<void>) {
    if (busyRef.current) return; // çift tıklama → tek işlem
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const withNotes = (base: string, notes: string) => (notes ? `${base}\n\n${notes}` : base);

  async function handleCancel() {
    if (!selectedRecs.length) return onNotice("İşlem için satış seçin.");
    if (!cancelPlan.eligible.length) {
      return onNotice("Seçilen satışlar zaten iptal edilmiş; yeniden iptal edilemez.");
    }
    const ok = await deleteConfirm({
      title: "Satışı İptal Et",
      message: withNotes(CANCEL_CONFIRM_MESSAGE, confirmNotes(cancelPlan)),
      names: cancelPlan.eligible.map(recordLabel),
      count: cancelPlan.eligible.length,
      noun: "satış",
      confirmText: "Satışı İptal Et",
      secondConfirmText: "Satışı İptal Et",
      irreversible: true,
    });
    if (!ok) return;
    await run(async () => {
      await onCancel(cancelPlan.eligible);
      setSelected(new Set());
    });
  }

  async function handleHide() {
    if (!selectedRecs.length) return onNotice("İşlem için satış seçin.");
    if (!hidePlan.eligible.length) return onNotice("Seçilen satışlar zaten listeden silinmiş.");
    const ok = await deleteConfirm({
      title: "Listeden Sil",
      message: withNotes(HIDE_CONFIRM_MESSAGE, confirmNotes(hidePlan)),
      names: hidePlan.eligible.map(recordLabel),
      count: hidePlan.eligible.length,
      noun: "satış kaydı",
      confirmText: "Listeden Sil",
      secondConfirmText: "Listeden Sil",
      irreversible: false,
    });
    if (!ok) return;
    await run(async () => {
      await onHide(hidePlan.eligible);
      setSelected(new Set());
    });
  }

  async function handleUnhide() {
    if (!selectedRecs.length) return onNotice("Geri almak için satış seçin.");
    if (!unhidePlan.eligible.length) return onNotice("Seçilen satışlar zaten listede.");
    const names = unhidePlan.eligible.map(recordLabel);
    const ok = await confirm({
      title: "Listeye Geri Al",
      message: `${withNotes(UNHIDE_CONFIRM_MESSAGE, confirmNotes(unhidePlan))}\n\n${names.length} kayıt:\n${names.slice(0, 10).map((n) => `• ${n}`).join("\n")}${names.length > 10 ? `\n… ve ${names.length - 10} kayıt daha` : ""}`,
      confirmText: "Listeye Geri Al",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    await run(async () => {
      await onUnhide(unhidePlan.eligible);
      setSelected(new Set());
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v.key));
  const cancelReason = !selectedRecs.length
    ? "Önce satış seçin"
    : !cancelPlan.eligible.length
      ? "Seçilen satışlar zaten iptal edilmiş"
      : "";

  return (
    <div className="w-full min-w-0">
      {loadIssue ? (
        <div role="alert" data-testid="sales-history-incomplete" className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
          <p className="font-black text-red-800">Satış geçmişi eksik yüklendi — kısmi liste</p>
          <p className="mt-1">{loadIssue}</p>
        </div>
      ) : (
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-base font-black" data-testid="sales-net-summary">
        <span>Net Satış: {fmtMoney(summary.netSale)}</span>
        <span>Net Kâr: {fmtMoney(summary.netProfit)}</span>
        <span>Tamamlanan: {summary.completed}</span>
        <span className="text-rose-700">İptal edilen: {summary.cancelled}</span>
        {extraSummary ? extraSummary(completed) : null}
      </div>
      )}
      <p className="mb-3 text-xs font-semibold text-slate-500">
        Net toplamlara iptal edilen satışlar dahil edilmez. Listeden silinen satışlar iptal edilmediği için
        toplamlarda kalır{summary.hidden > 0 ? ` (${summary.hidden} kayıt listeden silinmiş)` : ""}.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!showArchive ? (
          <>
            <button
              type="button"
              className={`${btnBase} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
              disabled={busy || !cancelPlan.eligible.length}
              title={cancelReason || "Satışı iptal eder; stokta bulunan ürünlerin miktarı geri eklenir"}
              onClick={() => void handleCancel()}
            >
              Satışı İptal Et
            </button>
            <button
              type="button"
              className={`${btnBase} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
              disabled={busy || !hidePlan.eligible.length}
              title={!selectedRecs.length ? "Önce satış seçin" : "Yalnız görünür listeden kaldırır; stok değişmez"}
              onClick={() => void handleHide()}
            >
              Listeden Sil
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${btnBase} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
            disabled={busy || !unhidePlan.eligible.length}
            onClick={() => void handleUnhide()}
          >
            Listeye Geri Al
          </button>
        )}
        {!isDemo ? (
          <button
            type="button"
            className={`${btnBase} border-transparent bg-transparent text-slate-600 underline`}
            onClick={() => {
              setSelected(new Set());
              setShowArchive((v) => !v);
            }}
          >
            {showArchive ? "← Satış geçmişine dön" : `Listeden silinenler (${summary.hidden})`}
          </button>
        ) : null}
        {selectedRecs.length > 0 ? (
          <span className="text-sm font-bold text-slate-600">{selectedRecs.length} satış seçili</span>
        ) : null}
      </div>
      {!showArchive && cancelReason && selectedRecs.length > 0 ? (
        <p className="mb-2 text-sm font-semibold text-rose-700">{cancelReason}; yalnız “Listeden Sil” kullanılabilir.</p>
      ) : null}
      {showArchive ? (
        <p className="mb-2 text-sm font-semibold text-slate-600">
          Listeden silinen satışlar. Geri almak stok ve satış durumunu değiştirmez.
        </p>
      ) : null}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-base">
          <thead>
            <tr className={`text-sm font-black uppercase ${headClassName}`}>
              <th className="p-2">No</th>
              <th className="p-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  aria-label="Görünen tüm satışları seç"
                  checked={allVisibleSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((v) => v.key)) : new Set())}
                />
              </th>
              <th className="p-2 text-left">Tarih</th>
              <th className="p-2 text-left">Ürün</th>
              <th className="p-2 text-left">Durum</th>
              <th className="p-2 text-left">Maliyet</th>
              <th className="p-2 text-left">Satış</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm font-semibold text-slate-500">
                  {showArchive ? "Listeden silinmiş satış yok." : "Gösterilecek satış yok."}
                </td>
              </tr>
            ) : (
              visible.map(({ rec, key }, i) => (
                <tr key={key} className="border-t" data-sale-key={key}>
                  <td className="p-2 text-center">{i + 1}</td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      aria-label={`Seç: ${recordLabel(rec)}`}
                      checked={selected.has(key)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(key);
                          else n.delete(key);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="p-2 whitespace-nowrap">{rec.timestamp}</td>
                  <td className="p-2 font-semibold">
                    {rec.name}
                    {(rec.otherCategoryItems ?? 0) > 0 ? (
                      <span className="block text-xs font-bold text-amber-700">
                        + başka kategoriden {rec.otherCategoryItems} ürün (işlemler satışın tamamına uygulanır)
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {isCancelled(rec) ? (
                      <span className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-black text-rose-800">İptal edildi</span>
                    ) : (
                      <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">Tamamlandı</span>
                    )}
                  </td>
                  <td className="p-2">{fmtMoney(rec.total_cost)}</td>
                  <td className="p-2">{fmtMoney(rec.sale_price)}</td>
                  <td className="p-2">
                    <button type="button" className="font-black underline" onClick={() => onDetail(rec)}>
                      Detay
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
