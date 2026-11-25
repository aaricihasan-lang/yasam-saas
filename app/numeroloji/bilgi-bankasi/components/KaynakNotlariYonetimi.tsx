"use client";

/**
 * NKB-V2 — Kaynak Notları yönetimi. Kanonik açıklamadan AYRI: bir kaynağa (veya
 * "Uzmanın Kendi Notu") bağlı serbest uzman notlarını ekler/düzenler/siler.
 * Aynı kaynağa ikinci not eklenirken 3 seçenekli karar (Yeni/Güncelle/Vazgeç) gösterir.
 * Başarı sonrası form temizlenir + kalıcı panel; hata sonrası form korunur.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { listSources, type NumerologySourceRow } from "../helpers/sourcesApi";
import {
  createSourceEntry,
  deleteSourceEntry,
  listSourceEntries,
  updateSourceEntryById,
} from "../helpers/sourceEntriesApi";
import {
  EXPERT_OWN_NOTE_LABEL,
  EXPERT_OWN_NOTE_VALUE,
  MSG_SE_EMPTY_BODY,
  apiSourceToSelection,
  classifyEntryWrite,
  decideSecondNoteAction,
  sortSourceEntries,
  sourceEntryLabel,
  sourceSelectionToApi,
  type SourceEntryRow,
} from "../helpers/sourceEntryUiLogic";
import { AckPanel, type AckState } from "./AckPanel";
import { ChoiceDialog, type Choice } from "./ChoiceDialog";

const fieldBase =
  "w-full rounded-xl border border-violet-200/90 bg-white px-3 font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200/60 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/40";
const selectClass = `h-9 ${fieldBase} text-sm`;
const textareaClass = `${fieldBase} min-h-[96px] resize-y py-2 text-sm leading-relaxed placeholder:text-slate-400`;
const labelClass = "mb-1 block text-xs font-bold text-slate-700";

function shortBody(b: string, n = 60): string {
  const t = b.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function KaynakNotlariYonetimi({ recordId }: { recordId: string }) {
  const { confirm } = useConfirm();
  const t = useTranslations("numerology.knowledge");
  const tn = useTranslations("numerology.knowledge.sourceNotes");
  // I18N: TR'de yardımcı (helpers/sourceEntryUiLogic) ve sunucu metinleri birebir; EN'de katalog.
  // EXPERT_OWN_NOTE_VALUE kanonik seçim değeridir (NULL source_id) — değişmez; yalnız etiketi eşlenir.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const expertOwnNoteLabel = isSourceLocale ? EXPERT_OWN_NOTE_LABEL : tn("expertOwnNote");
  const entryLabel = (entry: SourceEntryRow, byId: Map<string, string>): string => {
    if (isSourceLocale) return sourceEntryLabel(entry, byId);
    if (entry.source_id === null) return expertOwnNoteLabel;
    return byId.get(entry.source_id) ?? tn("unknownSource");
  };

  const [sources, setSources] = useState<NumerologySourceRow[]>([]);
  const [entries, setEntries] = useState<SourceEntryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Form durumu
  const [sourceSel, setSourceSel] = useState<string>(EXPERT_OWN_NOTE_VALUE);
  const [body, setBody] = useState("");
  const [includeInAnalysis, setIncludeInAnalysis] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [ack, setAck] = useState<AckState>(null);
  const [dialog, setDialog] = useState<{ title: string; message?: string; choices: Choice[] } | null>(null);

  const sourceLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources) m.set(s.id, s.display_label);
    return m;
  }, [sources]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [sRes, eRes] = await Promise.all([listSources(), listSourceEntries(recordId)]);
    setSources(sRes.rows);
    setEntries(sortSourceEntries(eRes.rows));
    setLoading(false);
  }, [recordId]);

  useEffect(() => {
    // Standart "external data load" effect'i; setState reload içinde async tamamlanır
    // (kaskad render riski yok). Repo genelindeki bilinçli suppression deseni (bkz. useKulvarSources).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  function resetForm() {
    setSourceSel(EXPERT_OWN_NOTE_VALUE);
    setBody("");
    setIncludeInAnalysis(false);
    setEditingId(null);
  }

  function startEdit(entry: SourceEntryRow) {
    setEditingId(entry.id);
    setSourceSel(apiSourceToSelection(entry.source_id));
    setBody(entry.body);
    setIncludeInAnalysis(entry.include_in_analysis);
    setAck(null);
  }

  async function runCreate(sourceId: string | null) {
    setBusy(true);
    const res = await createSourceEntry(recordId, {
      source_id: sourceId,
      body: body.trim(),
      include_in_analysis: includeInAnalysis,
    });
    setBusy(false);
    finalize(classifyEntryWrite(res), res.error, tn("added"));
  }

  async function runUpdate(id: string, sourceId: string | null) {
    setBusy(true);
    const res = await updateSourceEntryById(id, {
      source_id: sourceId,
      body: body.trim(),
      include_in_analysis: includeInAnalysis,
    });
    setBusy(false);
    finalize(classifyEntryWrite(res), res.error, tn("updated"));
  }

  function finalize(outcome: ReturnType<typeof classifyEntryWrite>, error: string | null, successMsg: string) {
    if (outcome === "demo") {
      setAck({ type: "error", message: tn("demoWrite") });
      return; // form korunur
    }
    if (outcome === "error") {
      setAck({ type: "error", message: isSourceLocale ? error ?? tn("operationFailed") : tn("operationFailed") });
      return; // HATA: form verisi korunur
    }
    // BAŞARI: form temizle + liste yenile + kalıcı panel
    resetForm();
    setAck({ type: "success", message: successMsg });
    void reload();
  }

  function handleKaydet() {
    if (!body.trim()) {
      setAck({ type: "error", message: isSourceLocale ? MSG_SE_EMPTY_BODY : tn("emptyBody") });
      return;
    }
    setAck(null);
    const sourceId = sourceSelectionToApi(sourceSel);
    const decision = decideSecondNoteAction(entries, recordId, sourceId, editingId);

    if (decision.kind === "update") {
      void runUpdate(decision.id, sourceId);
      return;
    }
    if (decision.kind === "create") {
      void runCreate(sourceId);
      return;
    }
    // Aynı kaynakta mevcut not(lar) var → karar diyaloğu
    const label =
      sourceId === null ? expertOwnNoteLabel : sourceLabelById.get(sourceId) ?? tn("selectedSource");
    if (decision.kind === "prompt-single") {
      const existing = decision.existing;
      setDialog({
        title: tn("sameSourceTitle"),
        message: tn("sameSourceMessage", { label }),
        choices: [
          { label: tn("addNew"), value: `new`, tone: "primary" },
          { label: tn("updateExisting"), value: `upd:${existing.id}` },
          { label: t("shared.cancel"), value: "cancel" },
        ],
      });
      return;
    }
    // prompt-multi: kullanıcı hangi mevcut notu güncelleyeceğini AÇIKÇA seçer (rastgele YOK)
    const choices: Choice[] = [
      { label: tn("addNew"), value: "new", tone: "primary" },
      ...decision.existing.map((e, i) => ({
        label: tn("updateNth", { n: i + 1, preview: shortBody(e.body) }),
        value: `upd:${e.id}`,
      })),
      { label: t("shared.cancel"), value: "cancel" },
    ];
    setDialog({
      title: tn("sameSourceMultiTitle"),
      message: tn("sameSourceMultiMessage", { label }),
      choices,
    });
  }

  function onDialogChoose(value: string) {
    setDialog(null);
    const sourceId = sourceSelectionToApi(sourceSel);
    if (value === "cancel") return; // Vazgeç: form korunur
    if (value === "new") {
      void runCreate(sourceId);
      return;
    }
    if (value.startsWith("upd:")) {
      void runUpdate(value.slice(4), sourceId);
    }
  }

  async function handleDelete(entry: SourceEntryRow) {
    const ok = await confirm({
      title: tn("deleteTitle"),
      message: tn("deleteMessage"),
      confirmText: t("shared.delete"),
      cancelText: t("shared.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteSourceEntry(entry.id);
    setBusy(false);
    if (res.demo) {
      setAck({ type: "error", message: tn("demoDelete") });
      return;
    }
    if (res.error) {
      setAck({ type: "error", message: isSourceLocale ? res.error : tn("operationFailed") });
      return;
    }
    if (editingId === entry.id) resetForm();
    setAck({ type: "success", message: tn("deleted") });
    void reload();
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
      <ChoiceDialog
        open={dialog !== null}
        title={dialog?.title ?? ""}
        message={dialog?.message}
        choices={dialog?.choices ?? []}
        onChoose={onDialogChoose}
        onCancel={() => setDialog(null)}
      />

      {/* Form */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="se-kaynak" className={labelClass}>
            {tn("source")}
          </label>
          <select
            id="se-kaynak"
            value={sourceSel}
            onChange={(e) => setSourceSel(e.target.value)}
            className={selectClass}
          >
            <option value={EXPERT_OWN_NOTE_VALUE}>{expertOwnNoteLabel}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={includeInAnalysis}
              onChange={(e) => setIncludeInAnalysis(e.target.checked)}
              className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
            />
            {tn("useInAnalysis")}
          </label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="se-body" className={labelClass}>
            {tn("bodyLabel")}
          </label>
          <textarea
            id="se-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tn("bodyPlaceholder")}
            className={textareaClass}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleKaydet}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {editingId ? tn("update") : busy ? t("shared.saving") : tn("addNote")}
        </button>
        {editingId ? (
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-violet-200/90 bg-white px-4 text-sm font-black uppercase tracking-wide text-violet-900 shadow-sm transition hover:bg-violet-50/80"
          >
            {tn("clearForm")}
          </button>
        ) : null}
      </div>

      <AckPanel panel={ack} onClose={() => setAck(null)} />

      {/* Liste */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-bold text-violet-800">{tn("existingNotes", { count: entries.length })}</p>
        {loading ? (
          <p className="text-sm font-medium text-slate-500">{t("shared.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm font-medium text-slate-500">{tn("noNotes")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-violet-100 bg-white/85 p-2.5 shadow-sm ring-1 ring-violet-100/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-violet-100/80 px-2 py-0.5 text-[11px] font-black text-violet-800">
                    {entryLabel(e, sourceLabelById)}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      e.include_in_analysis
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {e.include_in_analysis ? tn("usedInAnalysis") : tn("notUsedInAnalysis")}
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      className="h-7 rounded-lg border border-violet-200 bg-white px-2.5 text-xs font-bold text-violet-800 transition hover:bg-violet-50"
                    >
                      {t("shared.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(e)}
                      className="h-7 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                    >
                      {t("shared.delete")}
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
