"use client";

import { useTranslations } from "next-intl";
import { useStockServerText } from "./useStockServerText";
import { useStockFormat } from "./useStockFormat";

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
import { fmtMoney as libFmtMoney } from "@/lib/urun-stok/dogaltasStockLogic";
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
  const t = useTranslations("stock.history");
  const ss = useStockServerText();

  const { fmtMoney } = useStockFormat({ fmtMoney: libFmtMoney });
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
  // QA K3-03: TR'de lib metinleri (confirmNotes + *_CONFIRM_MESSAGE) birebir; diğer dillerde aynı sayımlarla çevrilmiş not.
  // F1-R3: diğer dillerde uygun olmama gerekçeleri de (ilk 5 kayıt, lib ile aynı) listelenir.
  const notesFor = (
    plan: { eligible: { otherCategoryItems?: number }[]; ineligible: { rec: { name?: string; timestamp?: string }; reason: string }[] },
    trNotes: string,
  ) => {
    if (ss.isSourceLocale) return trNotes;
    const notes: string[] = [];
    const multi = plan.eligible.filter((r) => (r.otherCategoryItems ?? 0) > 0).length;
    if (multi > 0) notes.push(t("noteMulti", { count: multi }));
    if (plan.ineligible.length > 0) notes.push(ss.ineligibleNote(plan.ineligible));
    return notes.join("\n\n");
  };

  async function handleCancel() {
    if (!selectedRecs.length) return onNotice(t("pickSale"));
    if (!cancelPlan.eligible.length) {
      return onNotice(t("alreadyCancelled"));
    }
    const ok = await deleteConfirm({
      title: t("cancelSale"),
      message: withNotes(ss.constant(CANCEL_CONFIRM_MESSAGE, t("confirmCancel")), notesFor(cancelPlan, confirmNotes(cancelPlan))),
      names: cancelPlan.eligible.map(recordLabel),
      count: cancelPlan.eligible.length,
      noun: t("nounSale"),
      confirmText: t("cancelSale"),
      secondConfirmText: t("cancelSale"),
      irreversible: true,
    });
    if (!ok) return;
    await run(async () => {
      await onCancel(cancelPlan.eligible);
      setSelected(new Set());
    });
  }

  async function handleHide() {
    if (!selectedRecs.length) return onNotice(t("pickSale"));
    if (!hidePlan.eligible.length) return onNotice(t("alreadyHidden"));
    const ok = await deleteConfirm({
      title: t("removeFromList"),
      message: withNotes(ss.constant(HIDE_CONFIRM_MESSAGE, t("confirmHide")), notesFor(hidePlan, confirmNotes(hidePlan))),
      names: hidePlan.eligible.map(recordLabel),
      count: hidePlan.eligible.length,
      noun: t("nounSaleRecord"),
      confirmText: t("removeFromList"),
      secondConfirmText: t("removeFromList"),
      irreversible: false,
    });
    if (!ok) return;
    await run(async () => {
      await onHide(hidePlan.eligible);
      setSelected(new Set());
    });
  }

  async function handleUnhide() {
    if (!selectedRecs.length) return onNotice(t("pickToRestore"));
    if (!unhidePlan.eligible.length) return onNotice(t("alreadyListed"));
    const names = unhidePlan.eligible.map(recordLabel);
    const ok = await confirm({
      title: t("restore"),
      message: `${withNotes(ss.constant(UNHIDE_CONFIRM_MESSAGE, t("confirmUnhide")), notesFor(unhidePlan, confirmNotes(unhidePlan)))}\n\n${t("restoreList", { count: String(names.length), list: names.slice(0, 10).map((n) => `• ${n}`).join("\n") })}${names.length > 10 ? t("andMore", { count: String(names.length - 10) }) : ""}`,
      confirmText: t("restore"),
      cancelText: t("cancel"),
    });
    if (!ok) return;
    await run(async () => {
      await onUnhide(unhidePlan.eligible);
      setSelected(new Set());
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v.key));
  const cancelReason = !selectedRecs.length
    ? t("pickFirst")
    : !cancelPlan.eligible.length
      ? t("alreadyCancelledShort")
      : "";

  return (
    <div className="w-full min-w-0">
      {loadIssue ? (
        <div role="alert" data-testid="sales-history-incomplete" className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
          <p className="font-black text-red-800">{t("incompleteTitle")}</p>
          <p className="mt-1">{loadIssue}</p>
        </div>
      ) : (
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-base font-black" data-testid="sales-net-summary">
        <span>{t("netSale", { value: fmtMoney(summary.netSale) })}</span>
        <span>{t("netProfit", { value: fmtMoney(summary.netProfit) })}</span>
        <span>{t("completed", { count: String(summary.completed) })}</span>
        <span className="text-rose-700">{t("cancelled", { count: String(summary.cancelled) })}</span>
        {extraSummary ? extraSummary(completed) : null}
      </div>
      )}
      <p className="mb-3 text-xs font-semibold text-slate-500">
        {t("totalsNote", { hidden: summary.hidden > 0 ? t("hiddenCount", { count: String(summary.hidden) }) : "" })}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!showArchive ? (
          <>
            <button
              type="button"
              className={`${btnBase} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
              disabled={busy || !cancelPlan.eligible.length}
              title={cancelReason || t("cancelTitle")}
              onClick={() => void handleCancel()}
            >
              {t("cancelSale")}
            </button>
            <button
              type="button"
              className={`${btnBase} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
              disabled={busy || !hidePlan.eligible.length}
              title={!selectedRecs.length ? t("pickFirst") : t("hideTitle")}
              onClick={() => void handleHide()}
            >
              {t("removeFromList")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${btnBase} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
            disabled={busy || !unhidePlan.eligible.length}
            onClick={() => void handleUnhide()}
          >
            {t("restore")}
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
            {showArchive ? t("backToHistory") : t("hiddenList", { count: String(summary.hidden) })}
          </button>
        ) : null}
        {selectedRecs.length > 0 ? (
          <span className="text-sm font-bold text-slate-600">{t("selectedCount", { count: String(selectedRecs.length) })}</span>
        ) : null}
      </div>
      {!showArchive && cancelReason && selectedRecs.length > 0 ? (
        <p className="mb-2 text-sm font-semibold text-rose-700">{t("onlyHide", { reason: cancelReason })}</p>
      ) : null}
      {showArchive ? (
        <p className="mb-2 text-sm font-semibold text-slate-600">
          {t("archiveNote")}
        </p>
      ) : null}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-base">
          <thead>
            <tr className={`text-sm font-black uppercase ${headClassName}`}>
              <th className="p-2">{t("col.no")}</th>
              <th className="p-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  aria-label={t("selectAllAria")}
                  checked={allVisibleSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((v) => v.key)) : new Set())}
                />
              </th>
              <th className="p-2 text-left">{t("col.date")}</th>
              <th className="p-2 text-left">{t("col.product")}</th>
              <th className="p-2 text-left">{t("col.status")}</th>
              <th className="p-2 text-left">{t("col.cost")}</th>
              <th className="p-2 text-left">{t("col.sale")}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm font-semibold text-slate-500">
                  {showArchive ? t("emptyArchive") : t("empty")}
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
                      aria-label={t("selectAria", { label: recordLabel(rec) })}
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
                        {t("otherCategory", { count: String(rec.otherCategoryItems) })}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {isCancelled(rec) ? (
                      <span className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-black text-rose-800">{t("statusCancelled")}</span>
                    ) : (
                      <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">{t("statusCompleted")}</span>
                    )}
                  </td>
                  <td className="p-2">{fmtMoney(rec.total_cost)}</td>
                  <td className="p-2">{fmtMoney(rec.sale_price)}</td>
                  <td className="p-2">
                    <button type="button" className="font-black underline" onClick={() => onDetail(rec)}>
                      {t("detail")}
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
