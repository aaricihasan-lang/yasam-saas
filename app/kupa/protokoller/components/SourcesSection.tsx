"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnGhost, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";
import { addProtocolSource, updateProtocolSource, deleteProtocolSource, type CuppingProtocolSourceLink } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell, ProtocolEmpty } from "./ProtocolSectionShell";

export function SourcesSection({ protocolId, doc }: { protocolId: string; doc: ProtocolDocument }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [locator, setLocator] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = [...doc.sources].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  function reset() {
    setSourceId("");
    setLocator("");
    setNote("");
    setEditingId(null);
    setFormOpen(false);
  }

  async function add() {
    if (!sourceId) {
      showToast({ message: "Bir kaynak seçin.", type: "warning" });
      return;
    }
    // Kullanıcı dostu duplicate ön-kontrolü (aynı kaynak + aynı locator UNIQUE).
    const loc = locator.trim();
    if (rows.some((r) => r.source_id === sourceId && (r.locator ?? "") === loc)) {
      showToast({ message: "Bu kaynak aynı sayfa/bölüm ile zaten eklenmiş.", type: "warning" });
      return;
    }
    setBusy(true);
    try {
      await addProtocolSource({ protocol_id: protocolId, source_id: sourceId, locator: loc || null, note: note.trim() || null, sort_order: rows.length });
      await doc.reload.sources();
      reset();
      showToast({ message: "Kaynak eklendi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Eklenemedi.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(r: CuppingProtocolSourceLink) {
    setBusy(true);
    try {
      await updateProtocolSource(r.id, { locator: locator.trim() || null, note: note.trim() || null });
      await doc.reload.sources();
      reset();
      showToast({ message: "Güncellendi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Güncellenemedi.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: CuppingProtocolSourceLink) {
    const ok = await confirm({ title: "Kaynağı Çıkar", message: `"${doc.sourceName(r.source_id)}" bu protokolden çıkarılsın mı? Ana kaynak kaydı silinmez.`, confirmText: "Çıkar", cancelText: "Vazgeç", tone: "danger" });
    if (!ok) return;
    try {
      await deleteProtocolSource(r.id);
      await doc.reload.sources();
      showToast({ message: "Çıkarıldı.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Çıkarılamadı.", type: "error" });
    }
  }

  return (
    <ProtocolSectionShell
      title="Kaynaklar"
      description="Bu protokolün kaynak künyeleri."
      action={
        <button type="button" onClick={() => { reset(); setFormOpen(true); }} className={kupaBtnPrimary}>
          + Kaynak Ekle
        </button>
      }
    >
      {rows.length === 0 && !formOpen ? (
        <ProtocolEmpty message="Bu protokole henüz kaynak bağlanmadı." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-3">
              {editingId === r.id ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{doc.sourceName(r.source_id)}</p>
                  <input className={kupaInput} placeholder="Sayfa / bölüm (locator)" value={locator} onChange={(e) => setLocator(e.target.value)} aria-label="Locator" />
                  <input className={kupaInput} placeholder="Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Not" />
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={() => saveEdit(r)}>Kaydet</button>
                    <button type="button" className={kupaBtnGhost} onClick={reset}>Vazgeç</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{doc.sourceName(r.source_id)}</p>
                    {r.locator ? <p className="text-[11px] text-slate-500">{r.locator}</p> : null}
                    {r.note ? <p className="mt-0.5 text-[13px] text-slate-600">{r.note}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className="text-xs font-semibold text-amber-700 hover:underline" onClick={() => { setEditingId(r.id); setLocator(r.locator ?? ""); setNote(r.note ?? ""); setFormOpen(false); }}>Düzenle</button>
                    <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => remove(r)}>Çıkar</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          <select className={kupaInput} value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="Kaynak">
            <option value="">Kaynak seçin…</option>
            {doc.masterSources.map((s) => (
              <option key={s.id} value={s.id}>{s.source_name}</option>
            ))}
          </select>
          {doc.masterSources.length === 0 ? (
            <p className="text-[11px] text-slate-500">Henüz kaynak kaydı bulunmuyor.</p>
          ) : null}
          <input className={kupaInput} placeholder="Sayfa / bölüm (locator, opsiyonel)" value={locator} onChange={(e) => setLocator(e.target.value)} aria-label="Locator" />
          <input className={kupaInput} placeholder="Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Not" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || doc.masterSources.length === 0} className={kupaBtnSuccess} onClick={add}>Ekle</button>
            <button type="button" className={kupaBtnGhost} onClick={reset}>Vazgeç</button>
          </div>
        </div>
      ) : null}
    </ProtocolSectionShell>
  );
}
