"use client";

/**
 * AŞAMA 2 / W1 — DY-008: Word hazırlamadan önce Tam Rapor / Özel Rapor seçimi.
 *  - Tam Rapor: kaydı olan tüm bölümler (Ücretlendirme HARİÇ; isteğe bağlı eklenir).
 *  - Özel Rapor: bölümler tek tek seçilir; kaydı olmayan bölüm seçilemez.
 *  - Ücretlendirme her iki modda VARSAYILAN SEÇİLİ DEĞİL.
 *  - Human Design: yalnız danışana BAĞLI kayıtlı profesyonel rapor varsa (HD izni ile).
 *  - Numeroloji: kayıtlı analizlerin danışan bağı olmadığından yalnız doğum bilgisinden özet.
 * Seçenekler GET /api/clients/[id]/word-report (salt-okunur) ile gelir.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { formatDateTimeAbsolute } from "@/lib/i18n/format";

export type WordReportRequest = {
  reportKind: "full" | "custom";
  sections?: string[];
  includeCharges: boolean;
  hdReportId?: string;
};

type Counts = Record<"notlar" | "seanslar" | "randevular" | "taslar" | "odevler" | "analizler" | "numeroloji" | "ucretlendirme", number>;
type Options = {
  counts: Counts;
  humanDesign: { permitted: boolean; reports: { id: string; createdAt: string }[] };
};

const CUSTOM_SECTIONS = ["notlar", "seanslar", "randevular", "taslar", "odevler", "analizler", "humanDesign", "numeroloji", "yolculuk"] as const;
type CustomSection = (typeof CUSTOM_SECTIONS)[number];

export default function WordReportDialog({
  open,
  clientId,
  busy,
  onClose,
  onGenerate,
}: {
  open: boolean;
  clientId: string;
  busy: boolean;
  onClose: () => void;
  onGenerate: (req: WordReportRequest) => void;
}) {
  const t = useTranslations("clients.detail.wordDialog");
  const titleId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"full" | "custom">("full");
  const [charges, setCharges] = useState(false);
  const [picked, setPicked] = useState<Set<CustomSection>>(new Set());
  const [hdReportId, setHdReportId] = useState<string>("");
  const [opts, setOpts] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState(false);

  useModalBehavior(open, onClose);

  useEffect(() => {
    if (!open) return;
    // Pencere her açılışta yeniden mount edilir (çağıran koşullu render eder) → durum sıfırdır.
    let cancelled = false;
    (async () => {
      try {
        const token = readSessionToken();
        const res = await fetch(`/api/clients/${clientId}/word-report`, {
          headers: { "x-user-id": readYasamUser()?.id ?? "", ...(token ? { "x-session-token": token } : {}) },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as (Options & { ok?: boolean }) | null;
        if (cancelled) return;
        if (!res.ok || !json?.ok) { setLoadError(true); return; }
        setOpts(json);
        const c = json.counts;
        const hasHd = json.humanDesign.permitted && json.humanDesign.reports.length > 0;
        const initial = new Set<CustomSection>();
        for (const s of CUSTOM_SECTIONS) {
          if (s === "humanDesign" ? hasHd : s === "yolculuk" ? true : (c[s as keyof Counts] ?? 0) > 0) initial.add(s);
        }
        setPicked(initial);
        setHdReportId(json.humanDesign.reports[0]?.id ?? "");
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, clientId]);

  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const counts = opts?.counts;
  const hdReports = opts?.humanDesign.reports ?? [];
  const hdAvailable = !!opts?.humanDesign.permitted && hdReports.length > 0;
  const availableOf = (s: CustomSection): boolean => {
    if (!counts) return false;
    if (s === "humanDesign") return hdAvailable;
    if (s === "yolculuk") return counts.seanslar + counts.randevular + counts.taslar + counts.odevler + counts.analizler > 0;
    return (counts[s as keyof Counts] ?? 0) > 0;
  };
  const countLabel = (s: CustomSection): string => {
    if (!counts) return "";
    if (s === "humanDesign") return hdAvailable ? t("hdCount", { count: hdReports.length }) : opts?.humanDesign.permitted ? t("hdNone") : t("hdNoPermission");
    if (s === "yolculuk") return availableOf(s) ? t("timeline") : t("empty");
    if (s === "numeroloji") return counts.numeroloji > 0 ? t("numerologyBirth") : t("numerologyNoBirth");
    if (s === "notlar") return counts.notlar > 0 ? t("hasNotes") : t("empty");
    const n = counts[s as keyof Counts] ?? 0;
    return n > 0 ? t("count", { count: n }) : t("empty");
  };

  const toggle = (s: CustomSection) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const submit = () => {
    const includeHd = kind === "full" ? hdAvailable : picked.has("humanDesign") && hdAvailable;
    const req: WordReportRequest = {
      reportKind: kind,
      includeCharges: charges,
      ...(includeHd && hdReportId ? { hdReportId } : {}),
    };
    if (kind === "custom") {
      req.sections = [...CUSTOM_SECTIONS.filter((s) => picked.has(s) && availableOf(s)), ...(charges ? ["ucretlendirme"] : [])];
    }
    onGenerate(req);
  };

  const radioCls = (active: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${active ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white hover:bg-slate-50"}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overscroll-contain bg-slate-950/46 p-3 backdrop-blur-[6px] sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-1.5rem)] w-[min(560px,100%)] flex-col overflow-hidden rounded-[22px] border border-white/85 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <h3 id={titleId} className="text-[18px] font-black text-slate-900">{t("title")}</h3>
          <p className="mt-1 text-[13px] text-slate-500">{t("subtitle")}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div role="radiogroup" aria-label={t("kindLabel")} className="grid gap-2 sm:grid-cols-2">
            <label className={radioCls(kind === "full")}>
              <input ref={firstRef} type="radio" name="dy-word-kind" className="mt-1" checked={kind === "full"} onChange={() => setKind("full")} />
              <span>
                <span className="block text-[14px] font-extrabold text-slate-900">{t("full")}</span>
                <span className="block text-[12px] text-slate-500">{t("fullHint")}</span>
              </span>
            </label>
            <label className={radioCls(kind === "custom")}>
              <input type="radio" name="dy-word-kind" className="mt-1" checked={kind === "custom"} onChange={() => setKind("custom")} />
              <span>
                <span className="block text-[14px] font-extrabold text-slate-900">{t("custom")}</span>
                <span className="block text-[12px] text-slate-500">{t("customHint")}</span>
              </span>
            </label>
          </div>

          {loadError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{t("loadError")}</p>}
          {!opts && !loadError && <p className="text-[13px] text-slate-500">{t("loading")}</p>}

          {opts && kind === "custom" && (
            <fieldset className="rounded-2xl border border-slate-200 p-3">
              <legend className="px-1 text-[12px] font-extrabold uppercase tracking-wide text-slate-500">{t("sectionsLegend")}</legend>
              <p className="mb-2 text-[12px] text-slate-500">{t("alwaysIncluded")}</p>
              <ul className="space-y-1.5">
                {CUSTOM_SECTIONS.map((s) => {
                  const avail = availableOf(s);
                  return (
                    <li key={s}>
                      <label className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[14px] ${avail ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-55"}`}>
                        <input type="checkbox" disabled={!avail} checked={avail && picked.has(s)} onChange={() => toggle(s)} />
                        <span className="font-bold text-slate-800">{t(`section.${s}`)}</span>
                        <span className="ml-auto text-[12px] text-slate-500">{countLabel(s)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          {opts && hdAvailable && hdReports.length > 1 && (kind === "full" || picked.has("humanDesign")) && (
            <label className="block text-[13px]">
              <span className="mb-1 block font-bold text-slate-700">{t("hdPick")}</span>
              <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]" value={hdReportId} onChange={(e) => setHdReportId(e.target.value)}>
                {hdReports.map((r) => (
                  <option key={r.id} value={r.id}>{formatDateTimeAbsolute(r.createdAt)}</option>
                ))}
              </select>
            </label>
          )}

          {opts && (
            <label className={`flex items-center gap-2.5 rounded-2xl border border-slate-200 px-3 py-2.5 text-[14px] ${counts && counts.ucretlendirme > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}>
              <input type="checkbox" disabled={!counts || counts.ucretlendirme === 0} checked={charges} onChange={(e) => setCharges(e.target.checked)} />
              <span className="font-bold text-slate-800">{t("includeCharges")}</span>
              <span className="ml-auto text-[12px] text-slate-500">{counts ? (counts.ucretlendirme > 0 ? t("count", { count: counts.ucretlendirme }) : t("empty")) : ""}</span>
            </label>
          )}

          {opts && <p className="text-[12px] text-slate-500">{t("numerologyNote")}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button type="button" className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button type="button" className="btn-primary disabled:opacity-60" disabled={busy || !opts} onClick={submit}>
            {busy ? t("generating") : t("generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
