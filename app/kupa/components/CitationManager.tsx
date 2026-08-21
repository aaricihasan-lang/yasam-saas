"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createCitation,
  deleteCitation,
  listCitations,
  listSources,
  updateCitation,
  type CuppingCitation,
  type CuppingCitationEntity,
  type CuppingSource,
} from "../lib/api";
import { kupaBtnGhost, kupaBtnPrimary, kupaInput } from "./KupaShell";

/**
 * KUPA & HACAMAT — PAYLAŞILAN kaynak-atıf (citation) paneli.
 *
 * DB tarafı 6 TİPLİ junction'dır (referential integrity), ama UI TEK bu bileşenle yönetilir
 * (point/topic/point-topic/technique/knowledge/safety). Kaynak KATALOĞU değiştirmez; yalnız
 * mevcut kaynakları içeriğe bağlar (locator + evidence_class + note).
 */

const EVIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "traditional", label: "Geleneksel" },
  { value: "historical", label: "Tarihsel" },
  { value: "modern_clinical", label: "Modern Klinik" },
  { value: "systematic_review", label: "Sistematik Derleme" },
  { value: "safety_guidance", label: "Güvenlik Rehberi" },
  { value: "expert_educational", label: "Uzman / Eğitim" },
];
const EVIDENCE_LABEL: Record<string, string> = Object.fromEntries(
  EVIDENCE_OPTIONS.map((o) => [o.value, o.label]),
);

type FormState = { source_id: string; locator: string; evidence_class: string; note: string };
const EMPTY: FormState = { source_id: "", locator: "", evidence_class: "", note: "" };

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceName = useCallback(
    (id: string) => sources.find((s) => s.id === id)?.source_name ?? "(kaynak)",
    [sources],
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
        if (!cancelled) setError(e instanceof Error ? e.message : "Kaynaklar yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, entityId]);

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const handleSave = async () => {
    setError(null);
    if (!editingId && !form.source_id) {
      setError("Önce bir kaynak seçin.");
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
        const created = await createCitation(entity, {
          source_id: form.source_id,
          entityId, // sunucu bunu ilgili tablonun gerçek FK kolonuna map eder
          locator: form.locator,
          evidence_class: form.evidence_class || null,
          note: form.note,
        });
        setCitations((cur) => [...cur, created]);
      }
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (c: CuppingCitation) => {
    setEditingId(c.id);
    setForm({
      source_id: c.source_id,
      locator: (c.locator as string) ?? "",
      evidence_class: (c.evidence_class as string) ?? "",
      note: (c.note as string) ?? "",
    });
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteCitation(entity, id);
      setCitations((cur) => cur.filter((c) => c.id !== id));
      if (editingId === id) reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Kaynaklar
      </h4>

      {error ? (
        <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Bağlı kaynaklar listesi */}
      <div className="mb-3 space-y-1.5">
        {loading ? (
          <p className="text-[11px] text-slate-400">Yükleniyor…</p>
        ) : citations.length === 0 ? (
          <p className="text-[11px] text-slate-400">Henüz kaynak bağlanmadı.</p>
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
                  {c.evidence_class ? EVIDENCE_LABEL[String(c.evidence_class)] ?? String(c.evidence_class) : "—"}
                  {c.note ? ` · ${String(c.note)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(c)}
                  className="text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                >
                  düzenle
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(c.id)}
                  disabled={busy}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                >
                  kaldır
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ekle / düzenle formu */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={form.source_id}
          onChange={(e) => setForm((f) => ({ ...f, source_id: e.target.value }))}
          disabled={!!editingId}
          className={kupaInput}
        >
          <option value="">— kaynak seç —</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.source_name}
            </option>
          ))}
        </select>
        <select
          value={form.evidence_class}
          onChange={(e) => setForm((f) => ({ ...f, evidence_class: e.target.value }))}
          className={kupaInput}
        >
          <option value="">— kanıt sınıfı —</option>
          {EVIDENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={form.locator}
          onChange={(e) => setForm((f) => ({ ...f, locator: e.target.value }))}
          placeholder="Sayfa / bölüm (locator)"
          className={kupaInput}
        />
        <input
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="Atıf notu (opsiyonel)"
          className={kupaInput}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleSave} disabled={busy} className={kupaBtnPrimary}>
          {editingId ? "Kaynağı Güncelle" : "Kaynak Bağla"}
        </button>
        {editingId ? (
          <button type="button" onClick={reset} className={kupaBtnGhost}>
            Vazgeç
          </button>
        ) : null}
      </div>
    </div>
  );
}
