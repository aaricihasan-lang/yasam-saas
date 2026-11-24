"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { SourceNameField } from "./SourceNameField";
import { useConfirmLeave, useReportDirty } from "../hooks/protocolDirty";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnGhost, kupaBtnSuccess, kupaInput, kupaRowAction, kupaRowActionDanger, kupaRowActions } from "@/app/kupa/components/KupaShell";
import { createProtocolEntry, updateProtocolEntry, deleteProtocolEntry, type CuppingProtocolEntry } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell, ProtocolEmpty } from "./ProtocolSectionShell";
import { InlineLongText } from "./InlineLongText";
import { MasterPickerDialog } from "./MasterPickerDialog";

type Draft = { title: string; content: string; source_id: string; source_label: string; locator: string; point_ids: string[] };
const EMPTY: Draft = { title: "", content: "", source_id: "", source_label: "", locator: "", point_ids: [] };

/**
 * BİLGİLER — UNIFIED tek akış. Kaynaklı/kaynaksız, ilk gün/6 ay sonra: TÜM entry'ler
 * AYNI kart chrome'u. Eski ikili not/kaynak sınıf ayrımı ve formal/personal ayrımı YOK;
 * rozet/renk farkı YOK. create/update atomik RPC route'una gider (optimistic YOK).
 */
export function EntriesSection({ protocolId, doc }: { protocolId: string; doc: ProtocolDocument }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("cupping.protocols.entries");
  const tc = useTranslations("cupping.common");
  const errText = useKupaErrorText();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pointPickerOpen, setPointPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const confirmLeave = useConfirmLeave();
  // WT6: açık formun başlangıç anlık görüntüsü → kirli mi? (kaydedilmemiş-değişiklik koruması)
  const [initialDraft, setInitialDraft] = useState<Draft>(EMPTY);
  const dirty = formOpen && JSON.stringify(draft) !== JSON.stringify(initialDraft);
  useReportDirty("entries", dirty);
  async function cancelForm() {
    if (dirty && !(await confirmLeave())) return;
    setFormOpen(false);
  }

  const entries = [...doc.entries].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  async function openNew() {
    if (dirty && !(await confirmLeave())) return;
    setEditingId(null);
    setDraft(EMPTY);
    setInitialDraft(EMPTY);
    setFormOpen(true);
  }
  async function openEdit(e: CuppingProtocolEntry) {
    if (dirty && !(await confirmLeave())) return;
    const next: Draft = {
      title: e.title ?? "",
      content: e.content ?? "",
      source_id: e.source_id ?? "",
      source_label: e.source_label ?? "",
      locator: e.locator ?? "",
      point_ids: e.point_ids ?? [],
    };
    setEditingId(e.id);
    setDraft(next);
    setInitialDraft(next);
    setFormOpen(true);
  }

  async function save() {
    if (busyRef.current) return; // çift tık → tek kayıt
    if (!draft.content.trim()) {
      showToast({ message: t("contentRequired"), type: "warning" });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const common = {
        title: draft.title.trim() || null,
        content: draft.content.trim(),
        source_id: draft.source_id || null,
        source_label: draft.source_label.trim() || null,
        locator: draft.locator.trim() || null,
      };
      if (editingId) {
        // Bölge bağları YALNIZ kullanıcı seçimi değiştirdiyse gönderilir. Yalnız metin düzeltmesi
        //   sunucudaki bağlara DOKUNMAZ (eksik/eski istemci durumu bağları silemez).
        const original = doc.entries.find((x) => x.id === editingId)?.point_ids ?? [];
        const pointsChanged =
          original.length !== draft.point_ids.length || original.some((pid, i) => pid !== draft.point_ids[i]);
        await updateProtocolEntry(editingId, pointsChanged ? { ...common, point_ids: draft.point_ids } : common);
      } else {
        await createProtocolEntry({ protocol_id: protocolId, ...common, point_ids: draft.point_ids });
      }
      setFormOpen(false);
      try {
        await doc.reload.entries(); // server canonical (point_ids dahil)
        showToast({ message: tc("saved"), type: "success" });
      } catch {
        // Kayıt BAŞARILI; yalnız liste tazelenemedi → "kaydedilemedi" denmez (mükerrer kayıt riski).
        showToast({ message: t("savedNoRefresh"), type: "warning" });
      }
    } catch (e) {
      // Atomik hata → mevcut veri DEĞİŞMEZ (server rollback). UI state'i de değiştirmedik.
      showToast({ message: errText(e, tc("saveFailed")), type: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function remove(e: CuppingProtocolEntry) {
    const ok = await confirm({ title: t("delete.title"), message: t("delete.message"), confirmText: tc("delete"), cancelText: tc("cancel"), tone: "danger" });
    if (!ok) return;
    try {
      await deleteProtocolEntry(e.id);
      await doc.reload.entries();
      showToast({ message: t("delete.done"), type: "success" });
    } catch (err) {
      showToast({ message: errText(err, t("delete.failed")), type: "error" });
    }
  }

  return (
    <ProtocolSectionShell
      title={t("title")}
      description={t("description")}
      action={
        <button type="button" onClick={openNew} className={kupaBtnPrimary}>
          {t("add")}
        </button>
      }
    >
      {entries.length === 0 && !formOpen ? (
        <ProtocolEmpty message={t("empty")} />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-100 bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {e.title ? <p className="text-sm font-bold text-slate-800">{e.title}</p> : null}
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{e.content}</p>
                </div>
                <div className={kupaRowActions}>
                  <button type="button" className={kupaRowAction} onClick={() => openEdit(e)}>
                    {tc("edit")}
                  </button>
                  <button type="button" className={kupaRowActionDanger} onClick={() => remove(e)}>
                    {tc("delete")}
                  </button>
                </div>
              </div>
              {e.point_ids && e.point_ids.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.point_ids.map((pid) => (
                    <span key={pid} className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{doc.pointName(pid)}</span>
                  ))}
                </div>
              ) : null}
              {e.source_id ? (
                <p className="mt-2 text-[11px] text-slate-400">{t("sourcePrefix")} {doc.sourceName(e.source_id)}{e.locator ? ` · ${e.locator}` : ""}</p>
              ) : e.source_label ? (
                <p className="mt-2 text-[11px] text-slate-400">{e.source_label}{e.locator ? ` · ${e.locator}` : ""}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          <div className="space-y-2">
            <input className={kupaInput} placeholder={t("form.titlePlaceholder")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label={t("form.titleAria")} />
            <InlineLongText label={t("form.contentLabel")} value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} rows={4} placeholder={t("form.contentPlaceholder")} />
            {/* İlgili bölgeler */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">{t("form.points")}</span>
                <button type="button" className={kupaRowAction} onClick={() => setPointPickerOpen(true)}>
                  {t("form.addPoint")}
                </button>
              </div>
              {draft.point_ids.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {draft.point_ids.map((pid) => (
                    <span key={pid} className="inline-flex items-center gap-1 rounded-md bg-amber-50 py-0.5 pl-2 text-[11px] text-amber-700">
                      {doc.pointName(pid)}
                      <button type="button" aria-label={t("form.removePointAria", { name: doc.pointName(pid) })} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-base text-amber-500 hover:bg-rose-50 hover:text-rose-600 lg:h-8 lg:w-8" onClick={() => setDraft({ ...draft, point_ids: draft.point_ids.filter((x) => x !== pid) })}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">{t("form.optional")}</p>
              )}
            </div>
            {/* Kaynak (opsiyonel) — SADE serbest metin. Ayrı katalog picker/modal YOK.
                Mevcut kayıtlı kaynağa bağlı entry düzenlenirken (source_id) chip gösterilir;
                "Kaldır" ile serbest metne geçilir. Yeni entry'de yalnız serbest metin + öneri. */}
            {draft.source_id ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <span className="text-[11px] font-semibold text-slate-500">{t("sourcePrefix")}</span>
                <span className="text-[13px] font-medium text-slate-700">{doc.sourceName(draft.source_id)}</span>
                <button type="button" className={kupaRowActionDanger} onClick={() => setDraft({ ...draft, source_id: "" })}>
                  {t("form.removeSource")}
                </button>
              </div>
            ) : (
              <SourceNameField
                label={t("form.sourceLabel")}
                placeholder={t("form.sourcePlaceholder")}
                value={draft.source_label}
                onChange={(v) => setDraft((d) => ({ ...d, source_label: v }))}
                sources={doc.masterSources}
                testId="kupa-entry-source"
              />
            )}
            <input className={kupaInput} placeholder={t("form.locatorPlaceholder")} value={draft.locator} onChange={(e) => setDraft({ ...draft, locator: e.target.value })} aria-label={t("form.locatorAria")} />
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={save}>
                {busy ? tc("saving") : tc("save")}
              </button>
              <button type="button" className={kupaBtnGhost} onClick={() => void cancelForm()}>
                {tc("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MasterPickerDialog
        open={pointPickerOpen}
        title={t("pickerTitle")}
        items={doc.masterPoints.map((p) => ({ id: p.id, label: p.name, meta: p.anatomical_region ?? undefined }))}
        selectedIds={draft.point_ids}
        emptyMessage={t("pickerEmpty")}
        onPick={(pid) => setDraft((d) => (d.point_ids.includes(pid) ? d : { ...d, point_ids: [...d.point_ids, pid] }))}
        onClose={() => setPointPickerOpen(false)}
      />
    </ProtocolSectionShell>
  );
}
