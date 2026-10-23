"use client";

/**
 * AŞAMA 2 / W1 — DY-008: Word hazırlamadan önce Tam Rapor / Özel Rapor seçimi.
 *  - Tam Rapor: kaydı olan tüm bölümler (Ücretlendirme HARİÇ; isteğe bağlı eklenir).
 *  - Özel Rapor: bölümler tek tek seçilir; kaydı olmayan bölüm seçilemez.
 *  - Ücretlendirme her iki modda VARSAYILAN SEÇİLİ DEĞİL.
 *  - Human Design: yalnız danışana BAĞLI kayıtlı profesyonel rapor varsa (HD izni ile).
 *  - Numeroloji (DY-005/006): yalnız danışana açıkça BAĞLANMIŞ kayıtlı analizler listelenir; uzman
 *    seçerse kaydedildiği haliyle aktarılır (varsayılan: seçilmedi → doğum bilgisinden temel özet).
 *  - BUG-005: Anamnez ve Beslenme özeti ayrı, VARSAYILAN KAPALI onay kutularıdır (Tam Rapor dahil
 *    otomatik eklenmez). Anamnez yalnız tamamlanmış form + açık rıza kaydı varsa seçilebilir.
 * Seçenekler GET /api/clients/[id]/word-report (salt-okunur) ile gelir.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { formatDateTimeAbsolute } from "@/lib/i18n/format";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

export type WordReportRequest = {
  reportKind: "full" | "custom";
  sections?: string[];
  includeCharges: boolean;
  hdReportId?: string;
  /** DY-005/006: danışana bağlı, açıkça seçilen kayıtlı Numeroloji analizi. */
  numerologyRecordId?: string;
  /** BUG-005: açık seçim (varsayılan kapalı). */
  includeAnamnez?: boolean;
  anamnezId?: string;
  includeBeslenme?: boolean;
};

type AnamnezOpt = { id: string; title: string | null; kind: string; assessment_date: string | null; completed_at: string | null };

type LinkedNumerology = { id: string; name: string; surname: string; birth_date: string | null; created_at: string | null };

type Counts = Record<"notlar" | "seanslar" | "randevular" | "taslar" | "odevler" | "analizler" | "numeroloji" | "ucretlendirme", number>;
type Options = {
  counts: Counts;
  humanDesign: { permitted: boolean; reports: { id: string; createdAt: string }[] };
  numerology?: { permitted?: boolean; records?: LinkedNumerology[] };
  anamnez?: { available?: boolean; consent?: boolean | null; completed?: AnamnezOpt[] };
  beslenme?: { hasData?: boolean };
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
  const [numerologyRecordId, setNumerologyRecordId] = useState<string>("");
  const [withAnamnez, setWithAnamnez] = useState(false);
  const [anamnezId, setAnamnezId] = useState<string>("");
  const [withBeslenme, setWithBeslenme] = useState(false);
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
          if (s === "humanDesign" ? hasHd : s === "yolculuk" ? true : s === "numeroloji" ? (c.numeroloji > 0 || (json.numerology?.records?.length ?? 0) > 0) : (c[s as keyof Counts] ?? 0) > 0) initial.add(s);
        }
        setPicked(initial);
        setHdReportId(json.humanDesign.reports[0]?.id ?? "");
        setAnamnezId(json.anamnez?.completed?.[0]?.id ?? "");
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
  const numRecords = opts?.numerology?.records ?? [];
  const anamnezForms = opts?.anamnez?.completed ?? [];
  const anamnezConsent = opts?.anamnez?.consent === true;
  const anamnezSelectable = anamnezForms.length > 0 && anamnezConsent;
  const beslenmeSelectable = opts?.beslenme?.hasData === true;
  const anamnezHint = !anamnezForms.length ? t("anamnezNone") : !anamnezConsent ? t("anamnezNoConsent") : t("anamnezCount", { count: anamnezForms.length });
  const availableOf = (s: CustomSection): boolean => {
    if (!counts) return false;
    if (s === "humanDesign") return hdAvailable;
    if (s === "yolculuk") return counts.seanslar + counts.randevular + counts.taslar + counts.odevler + counts.analizler > 0;
    if (s === "numeroloji") return counts.numeroloji > 0 || numRecords.length > 0;
    return (counts[s as keyof Counts] ?? 0) > 0;
  };
  const countLabel = (s: CustomSection): string => {
    if (!counts) return "";
    if (s === "humanDesign") return hdAvailable ? t("hdCount", { count: hdReports.length }) : opts?.humanDesign.permitted ? t("hdNone") : t("hdNoPermission");
    if (s === "yolculuk") return availableOf(s) ? t("timeline") : t("empty");
    if (s === "numeroloji") return numRecords.length > 0 ? t("numerologyLinked", { count: numRecords.length }) : counts.numeroloji > 0 ? t("numerologyBirth") : t("numerologyNoBirth");
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
    const includeNum = kind === "full" || picked.has("numeroloji");
    if (includeNum && numerologyRecordId && numRecords.some((r) => r.id === numerologyRecordId)) req.numerologyRecordId = numerologyRecordId;
    if (withAnamnez && anamnezSelectable) {
      req.includeAnamnez = true;
      if (anamnezId && anamnezForms.some((f) => f.id === anamnezId)) req.anamnezId = anamnezId;
    }
    if (withBeslenme && beslenmeSelectable) req.includeBeslenme = true;
    if (kind === "custom") {
      req.sections = [...CUSTOM_SECTIONS.filter((s) => picked.has(s) && availableOf(s)), ...(charges ? ["ucretlendirme"] : [])];
    }
    onGenerate(req);
  };

  const radioCls = (active: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${active ? "border-[#2c5aa0] bg-[#eaf0f8]" : "border-[#d4dae3] bg-[#f8f9fb] hover:bg-[#f2f4f7]"}`;

  return (
    <div className={`${dyp.kOverlay} fixed inset-0 z-[100] flex items-center justify-center overscroll-contain p-3 sm:p-4`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${dyp.kModal} flex max-h-[calc(100dvh-1.5rem)] w-[min(560px,100%)] flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${dyp.kModalHead} shrink-0`}>
          <h3 id={titleId} className={dyp.kTitle}>{t("title")}</h3>
          <p className={`${dyp.kDesc} mt-1`}>{t("subtitle")}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div role="radiogroup" aria-label={t("kindLabel")} className="grid gap-2 sm:grid-cols-2">
            <label className={radioCls(kind === "full")}>
              <input ref={firstRef} type="radio" name="dy-word-kind" className="mt-1 accent-[#2c5aa0]" checked={kind === "full"} onChange={() => setKind("full")} />
              <span>
                <span className="block text-[14px] font-extrabold text-[#0f1d36]">{t("full")}</span>
                <span className="block text-[12px] text-[#55637a]">{t("fullHint")}</span>
              </span>
            </label>
            <label className={radioCls(kind === "custom")}>
              <input type="radio" name="dy-word-kind" className="mt-1 accent-[#2c5aa0]" checked={kind === "custom"} onChange={() => setKind("custom")} />
              <span>
                <span className="block text-[14px] font-extrabold text-[#0f1d36]">{t("custom")}</span>
                <span className="block text-[12px] text-[#55637a]">{t("customHint")}</span>
              </span>
            </label>
          </div>

          {loadError && <p role="alert" className={dyp.kAlertDanger}>{t("loadError")}</p>}
          {!opts && !loadError && <p className="text-[13px] text-[#55637a]">{t("loading")}</p>}

          {opts && kind === "custom" && (
            <fieldset className={dyp.kCardMuted}>
              <legend className="px-1 text-[11.5px] font-extrabold uppercase tracking-wide text-[#55637a]">{t("sectionsLegend")}</legend>
              <p className="mb-2 text-[12px] text-[#55637a]">{t("alwaysIncluded")}</p>
              <ul className="space-y-1.5">
                {CUSTOM_SECTIONS.map((s) => {
                  const avail = availableOf(s);
                  return (
                    <li key={s}>
                      <label className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[14px] ${avail ? "cursor-pointer hover:bg-white" : "cursor-not-allowed opacity-55"}`}>
                        <input type="checkbox" className="accent-[#0f6e6e]" disabled={!avail} checked={avail && picked.has(s)} onChange={() => toggle(s)} />
                        <span className="font-bold text-[#1f3050]">{t(`section.${s}`)}</span>
                        <span className="ml-auto text-[12px] text-[#55637a]">{countLabel(s)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          {opts && hdAvailable && hdReports.length > 1 && (kind === "full" || picked.has("humanDesign")) && (
            <label className="block text-[13px]">
              <span className={`${dyp.kLabel} mb-1 block`}>{t("hdPick")}</span>
              <select className={`${dyp.kInput} w-full`} value={hdReportId} onChange={(e) => setHdReportId(e.target.value)}>
                {hdReports.map((r) => (
                  <option key={r.id} value={r.id}>{formatDateTimeAbsolute(r.createdAt)}</option>
                ))}
              </select>
            </label>
          )}

          {opts && (
            <fieldset className={dyp.kAlertWarn}>
              <legend className="px-1 text-[12px] font-extrabold uppercase tracking-wide text-[#6e4700]">{t("sensitiveLegend")}</legend>
              <p className="mb-2 text-[12px] text-[#6e4700]">{t("sensitiveNote")}</p>
              <label className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[14px] ${anamnezSelectable ? "cursor-pointer hover:bg-white" : "cursor-not-allowed opacity-55"}`}>
                <input type="checkbox" className="accent-[#0f6e6e]" disabled={!anamnezSelectable} checked={anamnezSelectable && withAnamnez} onChange={(e) => setWithAnamnez(e.target.checked)} />
                <span className="font-bold text-[#1f3050]">{t("anamnez")}</span>
                <span className="ml-auto text-[12px] text-[#55637a]">{anamnezHint}</span>
              </label>
              {anamnezSelectable && withAnamnez && anamnezForms.length > 1 && (
                <select aria-label={t("anamnezPick")} className={`${dyp.kInput} mt-1 w-full`} value={anamnezId} onChange={(e) => setAnamnezId(e.target.value)}>
                  {anamnezForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {(f.title?.trim() || t(`anamnezKind.${f.kind === "update" ? "update" : "initial"}`))}{f.completed_at ? ` · ${formatDateTimeAbsolute(f.completed_at)}` : ""}
                    </option>
                  ))}
                </select>
              )}
              <label className={`mt-1 flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[14px] ${beslenmeSelectable ? "cursor-pointer hover:bg-white" : "cursor-not-allowed opacity-55"}`}>
                <input type="checkbox" className="accent-[#0f6e6e]" disabled={!beslenmeSelectable} checked={beslenmeSelectable && withBeslenme} onChange={(e) => setWithBeslenme(e.target.checked)} />
                <span className="font-bold text-[#1f3050]">{t("beslenme")}</span>
                <span className="ml-auto text-[12px] text-[#55637a]">{beslenmeSelectable ? t("beslenmeHint") : t("empty")}</span>
              </label>
            </fieldset>
          )}

          {opts && numRecords.length > 0 && (kind === "full" || picked.has("numeroloji")) && (
            <label className="block text-[13px]">
              <span className={`${dyp.kLabel} mb-1 block`}>{t("numerologyPick")}</span>
              <select className={`${dyp.kInput} w-full`} value={numerologyRecordId} onChange={(e) => setNumerologyRecordId(e.target.value)}>
                <option value="">{t("numerologyPickNone")}</option>
                {numRecords.map((r) => (
                  <option key={r.id} value={r.id}>
                    {`${r.name} ${r.surname}`.trim()}{r.birth_date ? ` · ${r.birth_date}` : ""}{r.created_at ? ` · ${formatDateTimeAbsolute(r.created_at)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {opts && (
            <label className={`${dyp.kCardMuted} flex items-center gap-2.5 text-[14px] ${counts && counts.ucretlendirme > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}>
              <input type="checkbox" className="accent-[#0f6e6e]" disabled={!counts || counts.ucretlendirme === 0} checked={charges} onChange={(e) => setCharges(e.target.checked)} />
              <span className="font-bold text-[#1f3050]">{t("includeCharges")}</span>
              <span className="ml-auto text-[12px] text-[#55637a]">{counts ? (counts.ucretlendirme > 0 ? t("count", { count: counts.ucretlendirme }) : t("empty")) : ""}</span>
            </label>
          )}

          {opts && <p className="text-[12px] text-[#55637a]">{t("numerologyNote")}</p>}
        </div>

        <div className={`${dyp.kModalFoot} flex shrink-0 justify-end gap-2`}>
          <button type="button" className={dyp.kBtnSecondary} onClick={onClose}>{t("cancel")}</button>
          <button type="button" className={dyp.kBtnSave} disabled={busy || !opts} onClick={submit}>
            {busy ? t("generating") : t("generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
