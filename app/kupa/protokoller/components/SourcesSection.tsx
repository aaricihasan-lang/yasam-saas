"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnGhost, kupaBtnSuccess, kupaInput, kupaRowAction, kupaRowActionDanger, kupaRowActions } from "@/app/kupa/components/KupaShell";
import { addProtocolSource, updateProtocolSource, deleteProtocolSource, createSource, type CuppingProtocolSourceLink } from "@/app/kupa/lib/api";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell, ProtocolEmpty } from "./ProtocolSectionShell";
import { normalizeMasterName } from "./QuickCreateMasterForm";
import { SourceNameField } from "./SourceNameField";
import { findOwnSourceByName } from "@/lib/cupping/ownSources";
import { useConfirmLeave, useReportDirty } from "../hooks/protocolDirty";

/**
 * WT6 — Kaynaklar: hazır katalog açılır listesi KALDIRILDI. Uzman kaynağı SERBEST yazar
 * ("Ahmet Hoca Eğitim Notu", "kendi eğitim notlarım", "X Kitabı"…). Öneri yalnız uzmanın KENDİ
 * daha önce yazdığı kaynak adlarıdır (SourceNameField / lib/cupping/ownSources). Yazma YALNIZ
 * "Kaydet" ile; kaydedilmemiş form sayfa geneli korumaya bildirilir.
 */
export function SourcesSection({ protocolId, doc }: { protocolId: string; doc: ProtocolDocument }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const confirmLeave = useConfirmLeave();
  const [formOpen, setFormOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [locator, setLocator] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const rows = [...doc.sources].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const editingRow = editingId ? rows.find((x) => x.id === editingId) ?? null : null;
  const dirty =
    (formOpen && (sourceText.trim() !== "" || locator.trim() !== "" || note.trim() !== "")) ||
    (editingRow !== null && (locator.trim() !== (editingRow.locator ?? "").trim() || note.trim() !== (editingRow.note ?? "").trim()));
  useReportDirty("sources", dirty);

  async function cancelForm() {
    if (dirty && !(await confirmLeave())) return;
    reset();
  }

  function reset() {
    setSourceText("");
    setLocator("");
    setNote("");
    setEditingId(null);
    setFormOpen(false);
  }

  async function add() {
    if (busyRef.current) return; // çift tık → tek kayıt
    const loc = locator.trim();
    const text = sourceText.trim();
    if (!text) {
      showToast({ message: "Kaynak adını yazın (ör. Ahmet Hoca Eğitim Notu).", type: "warning" });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      // Serbest metin → uzmanın KENDİ aynı adlı kaynağı varsa o yeniden kullanılır; yoksa (aynı tenant'ta
      //   aynı adlı başka kayıt varsa onu, o da yoksa) yeni kaynak oluşturulur. source_id yapısal kalır.
      let sid = "";
      {
        const norm = normalizeMasterName(text);
        const existing =
          findOwnSourceByName(doc.masterSources, text) ??
          doc.masterSources.find((s) => normalizeMasterName(s.source_name) === norm);
        sid = existing?.id ?? "";
        if (!sid) {
          const created = await createSource({ source_name: text });
          if (!created || !created.id) {
            showToast({ message: "Demo hesabında kayıt oluşturulmaz.", type: "info" });
            return;
          }
          sid = created.id;
          await doc.reload.masterSources();
        }
      }
      // Aynı kaynak + aynı sayfa/bölüm UNIQUE ön-kontrolü (yalnız reuse durumunda anlamlı).
      if (rows.some((r) => r.source_id === sid && (r.locator ?? "") === loc)) {
        showToast({ message: "Bu kaynak aynı sayfa/bölüm ile zaten eklenmiş.", type: "warning" });
        return;
      }
      await addProtocolSource({ protocol_id: protocolId, source_id: sid, locator: loc || null, note: note.trim() || null, sort_order: rows.length });
      await doc.reload.sources();
      reset();
      showToast({ message: "Kaydedildi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(r: CuppingProtocolSourceLink) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await updateProtocolSource(r.id, { locator: locator.trim() || null, note: note.trim() || null });
      await doc.reload.sources();
      reset();
      showToast({ message: "Kaydedildi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      busyRef.current = false;
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
        <button type="button" onClick={async () => { if (dirty && !(await confirmLeave())) return; reset(); setFormOpen(true); }} className={kupaBtnPrimary}>
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
                    <button type="button" className={kupaBtnGhost} onClick={() => void cancelForm()}>Vazgeç</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{doc.sourceName(r.source_id)}</p>
                    {r.locator ? <p className="text-[11px] text-slate-500">{r.locator}</p> : null}
                    {r.note ? <p className="mt-0.5 text-[13px] text-slate-600">{r.note}</p> : null}
                  </div>
                  <div className={kupaRowActions}>
                    <button type="button" className={kupaRowAction} onClick={() => { setEditingId(r.id); setLocator(r.locator ?? ""); setNote(r.note ?? ""); setFormOpen(false); }}>Düzenle</button>
                    <button type="button" className={kupaRowActionDanger} onClick={() => remove(r)}>Çıkar</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          {/* WT6: hazır katalog YOK — serbest yazı; öneri yalnız uzmanın kendi geçmiş kaynakları. */}
          <SourceNameField
            label="Kaynak (kimden / nereden öğrendim)"
            placeholder="Örn. Ahmet Hoca Eğitim Notu, kendi eğitim notlarım, X Kitabı…"
            value={sourceText}
            onChange={setSourceText}
            sources={doc.masterSources}
            testId="kupa-source-name"
          />
          <input className={kupaInput} placeholder="Sayfa / bölüm (opsiyonel)" value={locator} onChange={(e) => setLocator(e.target.value)} aria-label="Sayfa / bölüm" />
          <input className={kupaInput} placeholder="Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Not" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={add} data-testid="kupa-source-save">{busy ? "Kaydediliyor…" : "Kaydet"}</button>
            <button type="button" className={kupaBtnGhost} onClick={() => void cancelForm()}>Vazgeç</button>
          </div>
        </div>
      ) : null}
    </ProtocolSectionShell>
  );
}
