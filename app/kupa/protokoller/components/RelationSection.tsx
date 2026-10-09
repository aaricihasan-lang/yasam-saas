"use client";

import { useRef, useState } from "react";
import { useConfirmLeave, useReportDirty } from "../hooks/protocolDirty";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { kupaBtnPrimary, kupaBtnGhost, kupaBtnSuccess, kupaRowAction, kupaRowActionDanger, kupaRowActions } from "@/app/kupa/components/KupaShell";
import {
  addProtocolPoint,
  addProtocolTechnique,
  addProtocolSafety,
  updateProtocolPoint,
  updateProtocolTechnique,
  updateProtocolSafety,
  deleteProtocolPoint,
  deleteProtocolTechnique,
  deleteProtocolSafety,
  createTechnique,
  createSafety,
} from "@/app/kupa/lib/api";
import { hasMovement, movementStyleLabel, techniqueTypeLabel } from "../../teknikler/lib/labels";
import type { ProtocolDocument } from "../hooks/useProtocolDocument";
import { ProtocolSectionShell, ProtocolEmpty } from "./ProtocolSectionShell";
import { MasterPickerDialog, type PickerItem } from "./MasterPickerDialog";
import { type QuickCreateConfig } from "./QuickCreateMasterForm";
import { InlineLongText } from "./InlineLongText";

type Kind = "point" | "technique" | "safety";

type RelRow = { id: string; protocol_note?: string | null; sort_order?: number } & Record<string, unknown>;

const CONFIG: Record<Kind, {
  title: string;
  description: string;
  addLabel: string;
  pickerTitle: string;
  empty: string;
  pickerEmpty: string;
  fk: string;
  noteLabel: string;
}> = {
  point: {
    title: "Uygulama Bölgeleri",
    description: "Bu protokolde kullanılan bölgeler ve protokole özel açıklamaları.",
    addLabel: "+ Bölge Ekle",
    pickerTitle: "Bölge Ekle",
    empty: "Bu protokolde kullanılacak bölgeler henüz eklenmedi.",
    pickerEmpty: "Henüz bölge (nokta) kaydı bulunmuyor.",
    fk: "point_id",
    noteLabel: "Bu protokolde kullanım açıklaması",
  },
  technique: {
    title: "Teknik / Metot",
    description: "Bu protokolde uygulanan teknik(ler) ve protokole özel açıklamaları.",
    addLabel: "+ Teknik Ekle",
    pickerTitle: "Teknik Ekle",
    empty: "Bu protokol için henüz bir uygulama tekniği seçilmedi.",
    pickerEmpty: "Henüz teknik kaydı bulunmuyor.",
    fk: "technique_id",
    noteLabel: "Bu protokolde uygulama açıklaması",
  },
  safety: {
    title: "Güvenlik / Dikkat",
    description: "Bu protokole özel dikkat ve güvenlik maddeleri.",
    addLabel: "+ Güvenlik Ekle",
    pickerTitle: "Güvenlik Maddesi Ekle",
    empty: "Bu protokole özel dikkat/güvenlik maddesi henüz eklenmedi.",
    pickerEmpty: "Henüz güvenlik kaydı bulunmuyor.",
    fk: "safety_id",
    noteLabel: "Bu protokole özel not",
  },
};

export function RelationSection({ kind, protocolId, doc }: { kind: Kind; protocolId: string; doc: ProtocolDocument }) {
  const cfg = CONFIG[kind];
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const confirmLeave = useConfirmLeave();
  // WT6: seçim ANINDA YAZILMAZ. Seçilen kayıtlar "eklenecek" listesinde bekler; kalıcı bağlantı
  //   yalnız bu bölümün "Kaydet" düğmesiyle kurulur (manuel kayıt; otomatik/yan-etki yazma YOK).
  const [pending, setPending] = useState<string[]>([]);

  const relations: RelRow[] =
    kind === "point" ? (doc.points as RelRow[]) : kind === "technique" ? (doc.techniques as RelRow[]) : (doc.safety as RelRow[]);

  const master =
    kind === "point" ? doc.masterPoints : kind === "technique" ? doc.masterTechniques : doc.masterSafety;

  const editingRel = editingId ? relations.find((x) => x.id === editingId) ?? null : null;
  const noteDirty = editingRel !== null && noteDraft.trim() !== String(editingRel.protocol_note ?? "").trim();
  useReportDirty(`rel-${kind}`, pending.length > 0 || noteDirty);

  // FAZ 4 (owner-locked): PASİF teknik YENİ attachment picker'ında adaydeğildir. Zaten ekli
  // pasif teknik relation listesinde render olmaya DEVAM eder (nameOf → doc.techniqueName;
  // burada filtre YALNIZ picker aday kümesini etkiler — otomatik detach/arşiv/silme YOK).
  // Global listTechniques DEĞİŞMEZ (ekli pasif kayıtların çözümlenmesi korunur).
  const pickerMaster =
    kind === "technique"
      ? master.filter((m) => (m as { is_active?: boolean | null }).is_active !== false)
      : master;

  const items: PickerItem[] = pickerMaster.map((m) => {
    if (kind === "point") return { id: m.id, label: (m as { name: string }).name, meta: (m as { anatomical_region?: string | null }).anatomical_region ?? undefined };
    if (kind === "technique") {
      const t = m as { name: string; technique_type?: string | null; movement_style?: string | null };
      // Kullanıcı-facing TR etiket (ham dry/wet/stationary kodu GÖSTERİLMEZ). Uygulama biçimi
      // yalnız gerçek bir değer taşıyorsa eklenir (paylaşılan teknik label yardımcıları).
      const meta = [
        techniqueTypeLabel(t.technique_type),
        hasMovement(t.movement_style) ? movementStyleLabel(t.movement_style) : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined;
      return { id: m.id, label: t.name, meta };
    }
    const s = m as { title: string; severity?: string | null };
    return { id: m.id, label: s.title, meta: s.severity ?? undefined };
  });

  const selectedIds = [...relations.map((r) => String(r[cfg.fk])), ...pending];
  const masterLabel = (mid: string) => items.find((i) => i.id === mid)?.label ?? (kind === "point" ? doc.pointName(mid) : kind === "technique" ? doc.techniqueName(mid) : doc.safetyTitle(mid));
  const nameOf = (r: RelRow) =>
    kind === "point" ? doc.pointName(String(r.point_id)) : kind === "technique" ? doc.techniqueName(String(r.technique_id)) : doc.safetyTitle(String(r.safety_id));
  const reload = kind === "point" ? doc.reload.points : kind === "technique" ? doc.reload.techniques : doc.reload.safety;

  /** Seçimi "eklenecek" listesine alır (YAZMA YOK). */
  function queueAdd(masterId: string) {
    if (relations.some((x) => String(x[cfg.fk]) === masterId) || pending.includes(masterId)) {
      showToast({ message: "Bu kayıt zaten listede.", type: "info" });
      return;
    }
    setPending((p) => [...p, masterId]);
    setPickerOpen(false);
  }

  async function discardPending() {
    if (pending.length > 0 && !(await confirmLeave())) return;
    setPending([]);
  }

  /** "Kaydet": bekleyen seçimleri protokole bağlar (tek tek; başarısızlar listede KALIR). */
  async function savePending() {
    if (busyRef.current || pending.length === 0) return; // çift tık → tek kayıt
    busyRef.current = true;
    setBusy(true);
    const failed: string[] = [];
    let lastErr: unknown = null;
    try {
      for (const masterId of pending) {
        try {
          const body = { protocol_id: protocolId, [cfg.fk]: masterId } as Record<string, string>;
          if (kind === "point") await addProtocolPoint(body as { protocol_id: string; point_id: string });
          else if (kind === "technique") await addProtocolTechnique(body as { protocol_id: string; technique_id: string });
          else await addProtocolSafety(body as { protocol_id: string; safety_id: string });
        } catch (e) {
          failed.push(masterId);
          lastErr = e;
        }
      }
      try { await reload(); } catch { /* liste yenilenemedi; kayıt sonucu aşağıda bildirilir */ }
      setPending(failed);
      if (failed.length === 0) showToast({ message: "Kaydedildi.", type: "success" });
      else showToast({ message: `${failed.length} kayıt kaydedilemedi; listede duruyor. (${lastErr instanceof Error ? lastErr.message : "Hata"})`, type: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveNote(id: string) {
    if (busyRef.current) return; // çift tık → tek kayıt
    busyRef.current = true;
    setBusy(true);
    try {
      const patch = { protocol_note: noteDraft.trim() || null };
      if (kind === "point") await updateProtocolPoint(id, patch);
      else if (kind === "technique") await updateProtocolTechnique(id, patch);
      else await updateProtocolSafety(id, patch);
      await reload();
      setEditingId(null);
      showToast({ message: "Kaydedildi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Kaydedilemedi.", type: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function cancelNote() {
    if (noteDirty && !(await confirmLeave())) return;
    setEditingId(null);
  }

  async function handleDetach(r: RelRow) {
    const ok = await confirm({
      title: "Çıkar",
      message: `"${nameOf(r)}" bu protokolden çıkarılsın mı? Ana kütüphane kaydı silinmez.`,
      confirmText: "Çıkar",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    try {
      if (kind === "point") await deleteProtocolPoint(r.id);
      else if (kind === "technique") await deleteProtocolTechnique(r.id);
      else await deleteProtocolSafety(r.id);
      await reload();
      showToast({ message: "Çıkarıldı.", type: "success" });
    } catch (e) {
      // Detach 409 → route zaten anlaşılır mesaj döndürür (step referansı vb.).
      showToast({ message: e instanceof Error ? e.message : "Çıkarılamadı.", type: "error" });
    }
  }

  // ── Quick-create (YALNIZ technique/safety; point HARİÇ) ───────────────────────
  // create başarısız → THROW (form açık kalır, attach YOK). create OK/attach FAIL →
  // master standalone kalır (rollback YOK), picker'da görünür, kullanıcı seçebilir.
  // demo → create null id döner → attach YAPMA.
  const quickCreate: QuickCreateConfig | undefined =
    kind === "technique"
      ? {
          entity: "technique",
          existing: doc.masterTechniques.map((m) => ({ id: m.id, label: m.name })),
          onUseExisting: (id) => { if (!busy) queueAdd(id); },
          onCreate: async (v) => {
            const created = await createTechnique({
              name: v.name,
              technique_type: v.technique_type,
              movement_style: v.movement_style,
              description: v.description,
            });
            if (!created || !created.id) {
              showToast({ message: "Demo hesabında kayıt oluşturulmaz.", type: "info" });
              return;
            }
            await doc.reload.masterTechniques();
            setPending((p) => (p.includes(created.id) ? p : [...p, created.id]));
            setPickerOpen(false);
            showToast({ message: "Teknik oluşturuldu. Protokole bağlamak için Kaydet'e basın.", type: "info" });
          },
        }
      : kind === "safety"
        ? {
            entity: "safety",
            existing: doc.masterSafety.map((m) => ({ id: m.id, label: m.title })),
            onUseExisting: (id) => { if (!busy) queueAdd(id); },
            onCreate: async (v) => {
              const created = await createSafety({
                title: v.title,
                content: v.content,
                severity: v.severity,
                contraindication_class: v.contraindication_class,
              });
              if (!created || !created.id) {
                showToast({ message: "Demo hesabında kayıt oluşturulmaz.", type: "info" });
                return;
              }
              await doc.reload.masterSafety();
              setPending((p) => (p.includes(created.id) ? p : [...p, created.id]));
              setPickerOpen(false);
              showToast({ message: "Güvenlik maddesi oluşturuldu. Protokole bağlamak için Kaydet'e basın.", type: "info" });
            },
          }
        : undefined;

  return (
    <ProtocolSectionShell
      title={cfg.title}
      description={cfg.description}
      action={
        <button type="button" onClick={() => setPickerOpen(true)} className={kupaBtnPrimary}>
          {cfg.addLabel}
        </button>
      }
    >
      {pending.length > 0 ? (
        <div data-testid={`kupa-pending-${kind}`} className="mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Eklenecek — henüz kaydedilmedi</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pending.map((mid) => (
              <span key={mid} className="inline-flex items-center gap-1 rounded-md bg-white py-0.5 pl-2 text-[12px] font-semibold text-amber-900 ring-1 ring-amber-200">
                {masterLabel(mid)}
                <button
                  type="button"
                  aria-label={`${masterLabel(mid)} listeden çıkar`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-base text-amber-600 hover:bg-rose-50 hover:text-rose-600 lg:h-7 lg:w-7"
                  onClick={() => setPending((p) => p.filter((x) => x !== mid))}
                  disabled={busy}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={() => void savePending()} data-testid={`kupa-pending-save-${kind}`}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button type="button" disabled={busy} className={kupaBtnGhost} onClick={() => void discardPending()}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}
      {relations.length === 0 ? (
        pending.length > 0 ? null : <ProtocolEmpty message={cfg.empty} />
      ) : (
        <ul className="space-y-2">
          {relations.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-slate-800">{nameOf(r)}</p>
                <div className={kupaRowActions}>
                  <button
                    type="button"
                    className={kupaRowAction}
                    onClick={() => {
                      setEditingId(editingId === r.id ? null : r.id);
                      setNoteDraft(String(r.protocol_note ?? ""));
                    }}
                  >
                    Düzenle
                  </button>
                  <button type="button" className={kupaRowActionDanger} onClick={() => handleDetach(r)}>
                    Çıkar
                  </button>
                </div>
              </div>
              {editingId === r.id ? (
                <div className="mt-2 space-y-2">
                  <InlineLongText label={cfg.noteLabel} value={noteDraft} onChange={setNoteDraft} rows={3} />
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={busy} className={kupaBtnSuccess} onClick={() => saveNote(r.id)}>
                      {busy ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button type="button" className={kupaBtnGhost} onClick={() => void cancelNote()}>
                      Vazgeç
                    </button>
                  </div>
                </div>
              ) : r.protocol_note ? (
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{String(r.protocol_note)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <MasterPickerDialog
        open={pickerOpen}
        title={cfg.pickerTitle}
        items={items}
        selectedIds={selectedIds}
        emptyMessage={cfg.pickerEmpty}
        onPick={(mid) => {
          if (!busy) queueAdd(mid);
        }}
        onClose={() => setPickerOpen(false)}
        quickCreate={quickCreate}
      />
    </ProtocolSectionShell>
  );
}
