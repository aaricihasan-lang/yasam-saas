"use client";

import { useTranslations } from "next-intl";
import { useCatalogWriteError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import { useState } from "react";
import { AROMATERAPI_REASON_MAX_LEN } from "@/lib/aromaterapi/writeTypes";
import { transitionRevisionStatus } from "@/lib/aromaterapi/methodWrite";

/**
 * C3D-B2B — Revizyon durum geçişi aksiyonları. İzinli geçişler (RPC otoritesi):
 * draft→verified, draft→archived, verified→archived. "Doğrula" seçilirse seride varsa
 * önceki verified revizyon aynı işlemde otomatik arşivlenir. reason zorunlu; expected_updated_at
 * optimistic concurrency. Demo'da gizli (salt-okunur).
 */

// I18N: etiket katalog anahtarı (aromatherapy.catalog.method.status.<labelKey>); kanonik hedef durum değişmez.
type Target = { status: string; labelKey: "verify" | "archive"; tone: "emerald" | "slate" };

function targetsFor(current: string): Target[] {
  if (current === "draft") {
    return [
      { status: "verified", labelKey: "verify", tone: "emerald" },
      { status: "archived", labelKey: "archive", tone: "slate" },
    ];
  }
  if (current === "verified") {
    return [{ status: "archived", labelKey: "archive", tone: "slate" }];
  }
  return [];
}

export function MethodStatusActions({
  seriesId,
  revisionId,
  currentStatus,
  expectedUpdatedAt,
  isDemo,
  onDone,
}: {
  seriesId: string;
  revisionId: string;
  currentStatus: string;
  expectedUpdatedAt: string;
  isDemo: boolean;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const ts = useTranslations("aromatherapy.catalog.method.status");
  const writeError = useCatalogWriteError();

  if (isDemo) return null;
  const targets = targetsFor(currentStatus);
  if (targets.length === 0) return null;

  async function confirm() {
    if (!target || submitting) return;
    if (reason.trim() === "") {
      setErrorCode("AROMA_WRITE_REASON_INVALID");
      return;
    }
    setSubmitting(true);
    setErrorCode(null);
    const result = await transitionRevisionStatus(seriesId, revisionId, {
      target_status: target.status,
      expected_updated_at: expectedUpdatedAt,
      reason,
    });
    setSubmitting(false);
    if (result.ok) {
      setTarget(null);
      setReason("");
      onDone();
      return;
    }
    setErrorCode(result.errorCode);
  }

  if (target) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <p className="text-[13px] font-black text-slate-800">
          {target.status === "verified" ? ts("verifyTitle") : ts("archiveTitle")}
        </p>
        {target.status === "verified" ? (
          <p className="mt-0.5 text-[11.5px] font-medium text-slate-500">
            {ts("verifyHint")}
          </p>
        ) : null}
        <label className="mt-2 block text-[11px] font-black uppercase tracking-wide text-slate-500">
          {ts("reason")} <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErrorCode(null);
          }}
          rows={2}
          maxLength={AROMATERAPI_REASON_MAX_LEN}
          placeholder={ts("reasonPh")}
          className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
        />
        {errorCode ? (
          <p role="alert" className="mt-1 text-[12px] font-bold text-rose-600">{writeError(errorCode)}</p>
        ) : null}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => { setTarget(null); setReason(""); setErrorCode(null); }} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-slate-300">
            {ts("cancel")}
          </button>
          <button type="button" onClick={confirm} disabled={submitting} className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[13px] font-black text-white shadow-md transition ${submitting ? "cursor-not-allowed bg-emerald-300" : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105"}`}>
            {submitting ? ts("processing") : ts("confirm")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((t) => (
        <button
          key={t.status}
          type="button"
          onClick={() => { setTarget(t); setErrorCode(null); }}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border px-4 text-[13px] font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-2 ${
            t.tone === "emerald"
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 focus-visible:ring-emerald-300/60"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 focus-visible:ring-slate-300/60"
          }`}
        >
          {ts(t.labelKey)}
        </button>
      ))}
    </div>
  );
}
