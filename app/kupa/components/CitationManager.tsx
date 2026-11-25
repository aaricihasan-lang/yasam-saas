"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import {
  createCitation,
  createSource,
  deleteCitation,
  listCitations,
  listSources,
  updateCitation,
  type CuppingCitation,
  type CuppingCitationEntity,
  type CuppingSource,
} from "../lib/api";
import { kupaBtnGhost, kupaBtnPrimary, kupaInput, kupaRowAction, kupaRowActionDanger, kupaRowActions } from "./KupaShell";
import { KupaConfirmDialog } from "./ConfirmDialog";
import { SourceNameField } from "../protokoller/components/SourceNameField";
import { useConfirmLeave, useReportDirty } from "../protokoller/hooks/protocolDirty";
import { findReusableSourceByName } from "@/lib/cupping/ownSources";
import { openFormDirty } from "@/app/kupa/lib/formDirty";

/**
 * KUPA & HACAMAT — PAYLAŞILAN kaynak-atıf (citation) paneli.
 *
 * DB tarafı 6 TİPLİ junction'dır (referential integrity), ama UI TEK bu bileşenle yönetilir
 * (point/topic/point-topic/technique/knowledge/safety). Atıf = kaynak + locator + evidence_class + note.
 *
 * FINAL-A1 — hazır kaynak KATALOĞU açılır listesi ("— kaynak seç —") KALDIRILDI (ürün kararı: ortak
 * yönlendirici katalog yok). Protokol "Kaynak" alanıyla AYNI desen: kaynak SERBEST yazılır; öneri yalnız
 * uzmanın KENDİ daha önce yazdığı kaynak adlarıdır (SourceNameField / lib/cupping/ownSources —
 * aktarılmış/sistem kaynakları önerilmez). Kayıtta aynı adlı mevcut kaynak yeniden kullanılır, yoksa
 * yeni kaynak oluşturulur; veri modeli (source_id) DEĞİŞMEZ. Kaydedilmemiş form sayfa koruması bildirir.
 */

// Kanıt sınıfı KODLARI kanoniktir (DB, lib/cupping/vocab CUPPING_EVIDENCE_CLASSES); görünen etiket
// messages/<dil>/cupping.json → cupping.citation.evidence.<kod>.
const EVIDENCE_OPTIONS = [
  "traditional",
  "historical",
  "modern_clinical",
  "systematic_review",
  "safety_guidance",
  "expert_educational",
] as const;
const isEvidence = (v: string): v is (typeof EVIDENCE_OPTIONS)[number] => (EVIDENCE_OPTIONS as readonly string[]).includes(v);

type FormState = { source_text: string; locator: string; evidence_class: string; note: string };
const EMPTY: FormState = { source_text: "", locator: "", evidence_class: "", note: "" };

export function CuppingCitationManager({
  entity,
  entityId,
}: {
  entity: CuppingCitationEntity;
  entityId: string;
}) {
  const [sources, setSources] = useState<CuppingSource[]>([]);
  const [citations, setCitations] = useState<CuppingCitation[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  // Formun açıldığı andaki değerler (kirli karşılaştırma tabanı): yeni → boş, düzenleme → atıf değerleri.
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const confirmLeave = useConfirmLeave();
  const dirty = openFormDirty(form, baseline);
  useReportDirty(`citation-${entity}`, dirty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CuppingCitation | null>(null);
  const t = useTranslations("cupping.citation");
  const tc = useTranslations("cupping.common");
  const errText = useKupaErrorText();

  const sourceName = useCallback(
    (id: string) => sources.find((s) => s.id === id)?.source_name ?? t("unknownSource"),
    [sources, t],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [srcs, cits] = await Promise.all([listSources(), listCitations(entity, entityId)]);
        if (cancelled) return;
        setSources(srcs);
        setCitations(cits);
      } catch (e) {
        if (!cancelled) setError(errText(e, t("loadError")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız kayıt değişiminde yeniden yükle (dil değişimi tetiklemez)
  }, [entity, entityId]);

  const reset = () => {
    setForm(EMPTY);
    setBaseline(EMPTY);
    setEditingId(null);
  };

  // Vazgeç / başka atıfı düzenle: gerçek değişiklik varsa önce sorulur (değişiklik yoksa doğrudan).
  const cancelEdit = async () => {
    if (dirty && !(await confirmLeave())) return;
    reset();
  };

  /** Serbest kaynak adı → source_id (aynı adlı mevcut kaynak yeniden kullanılır; yoksa oluşturulur). */
  const resolveSourceId = async (text: string): Promise<string | null> => {
    const existing = findReusableSourceByName(sources, text);
    if (existing) return existing.id;
    const created = await createSource({ source_name: text });
    if (!created || !created.id) return null; // demo hesabı (persist=0)
    setSources((cur) => [...cur, created]);
    return created.id;
  };

  const handleSave = async () => {
    setError(null);
    const sourceText = form.source_text.trim();
    if (!editingId && !sourceText) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        const updated = await updateCitation(entity, editingId, {
          locator: form.locator,
          evidence_class: form.evidence_class || null,
          note: form.note,
        });
        setCitations((cur) => cur.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const sourceId = await resolveSourceId(sourceText);
        if (!sourceId) {
          setError(tc("demoNoCreate"));
          return;
        }
        const created = await createCitation(entity, {
          source_id: sourceId,
          entityId, // sunucu bunu ilgili tablonun gerçek FK kolonuna map eder
          locator: form.locator,
          evidence_class: form.evidence_class || null,
          note: form.note,
        });
        setCitations((cur) => [...cur, created]);
      }
      reset();
    } catch (e) {
      setError(errText(e, tc("saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (c: CuppingCitation) => {
    if (dirty && !(await confirmLeave())) return;
    const next: FormState = {
      source_text: sourceName(c.source_id),
      locator: (c.locator as string) ?? "",
      evidence_class: (c.evidence_class as string) ?? "",
      note: (c.note as string) ?? "",
    };
    setEditingId(c.id);
    setForm(next);
    setBaseline(next);
  };

  // HAC-UX-6: citation "kaldır" = junction/ilişki satırını siler (kaynak KATALOĞUNU değil).
  // Hafif onay yeterli; ayrıca server 0-satır sonucu = SAHTE BAŞARI YOK.
  const performRemove = async () => {
    const c = removeTarget;
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const deleted = await deleteCitation(entity, c.id);
      if (deleted > 0) {
        setCitations((cur) => cur.filter((x) => x.id !== c.id));
        if (editingId === c.id) reset();
        setRemoveTarget(null);
      } else {
        // Server hiçbir satır silmedi (kayıt yok / bu hesaba ait değil / demo no-op).
        setRemoveTarget(null);
        setError(t("removeNoop"));
        try {
          const cits = await listCitations(entity, entityId);
          setCitations(cits);
        } catch {
          /* yeniden yükleme hatası sessiz — mevcut liste korunur */
        }
      }
    } catch (e) {
      setRemoveTarget(null);
      setError(errText(e, t("removeFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {t("title")}
      </h4>

      {error ? (
        <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Bağlı kaynaklar listesi */}
      <div className="mb-3 space-y-1.5">
        {loading ? (
          <p className="text-[11px] text-slate-400">{tc("loading")}</p>
        ) : citations.length === 0 ? (
          <p className="text-[11px] text-slate-400">{t("empty")}</p>
        ) : (
          citations.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {sourceName(c.source_id)}
                  {c.locator ? <span className="font-normal text-slate-500"> · {String(c.locator)}</span> : null}
                </p>
                <p className="text-[10px] text-slate-400">
                  {c.evidence_class ? (isEvidence(String(c.evidence_class)) ? t(`evidence.${String(c.evidence_class)}`) : String(c.evidence_class)) : "—"}
                  {c.note ? ` · ${String(c.note)}` : ""}
                </p>
              </div>
              <div className={kupaRowActions}>
                <button
                  type="button"
                  onClick={() => void handleEdit(c)}
                  className={kupaRowAction}
                >
                  {tc("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveTarget(c)}
                  disabled={busy}
                  className={kupaRowActionDanger}
                >
                  {t("remove")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ekle / düzenle formu */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Hazır katalog YOK — serbest yazı; öneri yalnız uzmanın kendi geçmiş kaynakları. Düzenlemede
            kaynak değişmez (yalnız sayfa/kanıt/not) → alan kilitli. */}
        <div className="sm:col-span-2">
          <SourceNameField
            label={t("sourceLabel")}
            placeholder={t("sourcePlaceholder")}
            value={form.source_text}
            onChange={(v) => setForm((f) => ({ ...f, source_text: v }))}
            sources={sources}
            disabled={!!editingId}
            testId="kupa-citation-source-name"
          />
        </div>
        <select
          value={form.evidence_class}
          onChange={(e) => setForm((f) => ({ ...f, evidence_class: e.target.value }))}
          aria-label={t("evidenceAria")}
          className={kupaInput}
        >
          <option value="">{t("evidenceEmpty")}</option>
          {EVIDENCE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {t(`evidence.${v}`)}
            </option>
          ))}
        </select>
        <input
          value={form.locator}
          onChange={(e) => setForm((f) => ({ ...f, locator: e.target.value }))}
          placeholder={t("locator")}
          aria-label={t("locator")}
          className={kupaInput}
        />
        <input
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder={t("note")}
          aria-label={t("note")}
          className={kupaInput}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleSave} disabled={busy} className={kupaBtnPrimary}>
          {editingId ? t("update") : t("link")}
        </button>
        {editingId || dirty ? (
          <button type="button" onClick={() => void cancelEdit()} className={kupaBtnGhost}>
            {tc("cancel")}
          </button>
        ) : null}
      </div>

      <KupaConfirmDialog
        open={removeTarget !== null}
        title={t("removeTitle")}
        description={t("removeConfirm", { name: removeTarget ? sourceName(removeTarget.source_id) : "" })}
        confirmLabel={t("remove")}
        busy={busy}
        onConfirm={performRemove}
        onClose={() => {
          if (!busy) setRemoveTarget(null);
        }}
      />
    </div>
  );
}
