"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnGhost, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pointPickerOpen, setPointPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const entries = [...doc.entries].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  function openNew() {
    setEditingId(null);
    setDraft(EMPTY);
    setFormOpen(true);
  }
  function openEdit(e: CuppingProtocolEntry) {
    setEditingId(e.id);
    setDraft({
      title: e.title ?? "",
      content: e.content ?? "",
      source_id: e.source_id ?? "",
      source_label: e.source_label ?? "",
      locator: e.locator ?? "",
      point_ids: e.point_ids ?? [],
    });
    setFormOpen(true);
  }

  async function save() {
    if (!draft.content.trim()) {
      showToast({ message: "Bilgi içeriği gerekli.", type: "warning" });
      return;
    }
    setBusy(true);
    try {
      const common = {
        title: draft.title.trim() || null,
        content: draft.content.trim(),
        source_id: draft.source_id || null,
        source_label: draft.source_label.trim() || null,
        locator: draft.locator.trim() || null,
        point_ids: draft.point_ids,
      };
      if (editingId) await updateProtocolEntry(editingId, common);
      else await createProtocolEntry({ protocol_id: protocolId, ...common });
      await doc.reload.entries(); // server canonical (point_ids dahil)
      setFormOpen(false);
      showToast({ message: editingId ? "Bilgi güncellendi." : "Bilgi eklendi.", type: "success" });
    } catch (e) {
      // Atomik hata → mevcut veri DEĞİŞMEZ (server rollback). UI state'i de değiştirmedik.
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: CuppingProtocolEntry) {
    const ok = await confirm({ title: "Bilgiyi Sil", message: "Bu bilgi kaydı silinsin mi?", confirmText: "Sil", cancelText: "Vazgeç", tone: "danger" });
    if (!ok) return;
    try {
      await deleteProtocolEntry(e.id);
      await doc.reload.entries();
      showToast({ message: "Bilgi silindi.", type: "success" });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : "Silinemedi.", type: "error" });
    }
  }

  return (
    <ProtocolSectionShell
      title="Bilgiler"
      description="Bu protokole ait tüm bilgiler tek akışta — kaynaklı ya da kaynaksız, aynı biçimde."
      action={
        <button type="button" onClick={openNew} className={kupaBtnPrimary}>
          + Yeni Bilgi
        </button>
      }
    >
      {entries.length === 0 && !formOpen ? (
        <ProtocolEmpty message="Bu protokole ait bilgi kaydı henüz yok." />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-100 bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {e.title ? <p className="text-sm font-bold text-slate-800">{e.title}</p> : null}
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{e.content}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => openEdit(e)}>
                    Düzenle
                  </button>
                  <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => remove(e)}>
                    Sil
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
                <p className="mt-2 text-[11px] text-slate-400">Kaynak: {doc.sourceName(e.source_id)}{e.locator ? ` · ${e.locator}` : ""}</p>
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
            <input className={kupaInput} placeholder="Başlık (opsiyonel)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Başlık" />
            <InlineLongText label="İçerik *" value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} rows={4} placeholder="Bu protokolle ilgili bilgi…" />
            {/* İlgili bölgeler */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">İlgili Bölgeler</span>
                <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => setPointPickerOpen(true)}>
                  + Bölge
                </button>
              </div>
              {draft.point_ids.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {draft.point_ids.map((pid) => (
                    <span key={pid} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                      {doc.pointName(pid)}
                      <button type="button" aria-label="Kaldır" className="text-amber-500 hover:text-rose-600" onClick={() => setDraft({ ...draft, point_ids: draft.point_ids.filter((x) => x !== pid) })}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">Opsiyonel.</p>
              )}
            </div>
            {/* Kaynak (opsiyonel) — SADE serbest metin. Ayrı katalog picker/modal YOK.
                Mevcut kayıtlı kaynağa bağlı entry düzenlenirken (source_id) chip gösterilir;
                "Kaldır" ile serbest metne geçilir. Yeni entry'de yalnız serbest metin + öneri. */}
            {draft.source_id ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <span className="text-[11px] font-semibold text-slate-500">Kaynak:</span>
                <span className="text-[13px] font-medium text-slate-700">{doc.sourceName(draft.source_id)}</span>
                <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setDraft({ ...draft, source_id: "" })}>
                  Kaldır
                </button>
              </div>
            ) : (
              <input
                className={kupaInput}
                list="kupa-entry-source-suggestions"
                placeholder="Kaynak / kimden öğrendim — örn. Süleyman Gök kitabı, Ahmet Hoca eğitimi (opsiyonel)"
                value={draft.source_label}
                onChange={(e) => setDraft({ ...draft, source_label: e.target.value })}
                aria-label="Kaynak / kimden öğrendim"
              />
            )}
            <datalist id="kupa-entry-source-suggestions">
              {doc.masterSources.map((s) => (
                <option key={s.id} value={s.source_name} />
              ))}
            </datalist>
            <input className={kupaInput} placeholder="Sayfa / bölüm (opsiyonel)" value={draft.locator} onChange={(e) => setDraft({ ...draft, locator: e.target.value })} aria-label="Sayfa / bölüm" />
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={save}>
                {editingId ? "Bilgiyi Kaydet" : "Bilgiyi Ekle"}
              </button>
              <button type="button" className={kupaBtnGhost} onClick={() => setFormOpen(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MasterPickerDialog
        open={pointPickerOpen}
        title="İlgili Bölge Ekle"
        items={doc.masterPoints.map((p) => ({ id: p.id, label: p.name, meta: p.anatomical_region ?? undefined }))}
        selectedIds={draft.point_ids}
        emptyMessage="Henüz bölge (nokta) kaydı bulunmuyor."
        onPick={(pid) => setDraft((d) => (d.point_ids.includes(pid) ? d : { ...d, point_ids: [...d.point_ids, pid] }))}
        onClose={() => setPointPickerOpen(false)}
      />
    </ProtocolSectionShell>
  );
}
