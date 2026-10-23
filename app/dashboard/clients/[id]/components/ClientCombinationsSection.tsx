"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute } from "@/lib/i18n/format";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { runInEffect } from "@/lib/runInEffect";
import {
  fetchClientCombinations,
  updateClientCombination,
  deleteClientCombination,
  parseStonesText,
  type ClientCombinationRow,
} from "@/lib/dogaltas/clientCombinationsApi";
import { DanisanSectionShell } from "@/app/danisan-yolculugu/components/DanisanSectionShell";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

type ClientCombinationsSectionProps = {
  clientId: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return formatDateAbsolute(value);
}

type EditState = {
  name: string;
  description: string;
  note: string;
};

/**
 * Danışan Detayı > Doğaltaşlar sekmesi — "Kayıtlı Kombinasyonlar" bölümü.
 *
 * "Kombinasyon Oluştur" akışında "Danışana Özel Kaydet" ile bu danışana yazılan
 * kombinasyonları listeler. Detay (taş listesi, amaç, not), düzenleme ve silme
 * desteklenir. Genel kombinasyonlardan ayrı tablo/route kullanır.
 */
export default function ClientCombinationsSection({
  clientId,
}: ClientCombinationsSectionProps) {
  const t = useTranslations("clients.combinations");
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const [rows, setRows] = useState<ClientCombinationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>({ name: "", description: "", note: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const res = await fetchClientCombinations(clientId);
    if (!res.ok) {
      setError(res.error ?? t("error.loadFailed"));
      setRows([]);
    } else {
      setRows(res.rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    runInEffect(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function startEdit(row: ClientCombinationRow) {
    setEditingId(row.id);
    setEditForm({
      name: row.name ?? "",
      description: row.description ?? "",
      note: row.note ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: "", description: "", note: "" });
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      showToast({ title: t("toast.failTitle"), message: t("toast.emptyName"), type: "error" });
      return;
    }
    setSavingEdit(true);
    const res = await updateClientCombination(clientId, id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
      note: editForm.note.trim() || null,
    });
    setSavingEdit(false);

    if (!res.ok) {
      showToast({ title: t("toast.failTitle"), message: res.error ?? t("toast.updateFailed"), type: "error" });
      return;
    }
    cancelEdit();
    await load();
    showToast({ title: t("toast.successTitle"), message: t("toast.updated"), type: "success" });
  }

  async function handleDelete(row: ClientCombinationRow) {
    const ok = await deleteConfirm({
      title: t("delete.title"),
      message: t("delete.message", { name: row.name ?? "" }),
    });
    if (!ok) return;

    const res = await deleteClientCombination(clientId, row.id);
    if (!res.ok) {
      showToast({ title: t("toast.failTitle"), message: res.error ?? t("toast.deleteFailed"), type: "error" });
      // D1 (DY-04): kayıt artık yoksa (404) sunucu listesiyle eşitle — bayat satır kalmaz.
      await load();
      return;
    }
    if (editingId === row.id) cancelEdit();
    if (expandedId === row.id) setExpandedId(null);
    await load();
    showToast({ title: t("toast.successTitle"), message: t("toast.deleted"), type: "success" });
  }

  return (
    <DanisanSectionShell desktopClassName="sm:rounded-xl sm:border sm:border-[#e3e7ee] sm:bg-white sm:p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className={`${dyp.kSubtitle} flex items-center gap-2`}>
            {t("header.title")}
          </h3>
          <p className={`${dyp.kDesc} mt-1`}>
            {t("header.subtitle")}
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm} w-fit`}
        >
          {loading ? t("loading") : t("refresh")}
        </button>
      </div>

      {error && (
        <div className={`${dyp.kAlertDanger} mb-3`}>
          {error}
        </div>
      )}

      {loading ? (
        <div className={dyp.kEmpty}>
          {t("loadingRecords")}
        </div>
      ) : rows.length === 0 ? (
        <div className={dyp.kEmpty}>
          <div className={dyp.kSubtitle}>
            {t("empty.title")}
          </div>
          <p className={`${dyp.kDesc} mt-2`}>
            {t("empty.hint")}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => {
            const stones = parseStonesText(row.stones_text);
            const isExpanded = expandedId === row.id;
            const isEditing = editingId === row.id;

            return (
              <div
                key={row.id}
                className={`${dyp.kCard} overflow-hidden`} style={{ padding: 0 }}
              >
                {isEditing ? (
                  <div className={dyp.kForm} style={{ border: 0, borderRadius: 0, boxShadow: "none" }}>
                    <h4 className={`${dyp.kSubtitle} mb-2`}>
                      {t("edit.title")}
                    </h4>
                    <div className="space-y-2">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder={t("edit.namePlaceholder")}
                        maxLength={200}
                        className={`${dyp.kInput} w-full`}
                      />
                      <input
                        value={editForm.description}
                        onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder={t("edit.descPlaceholder")}
                        maxLength={200}
                        className={`${dyp.kInput} w-full`}
                      />
                      <textarea
                        value={editForm.note}
                        onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
                        placeholder={t("edit.notePlaceholder")}
                        rows={2}
                        className={`${dyp.kInput} w-full resize-y`}
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className={dyp.kBtnSecondary}
                      >
                        {t("cancel")}
                      </button>
                      <button
                        onClick={() => saveEdit(row.id)}
                        disabled={savingEdit}
                        className={dyp.kBtnSave}
                      >
                        {savingEdit ? t("edit.saving") : t("edit.save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h4 className={`${dyp.kSubtitle} truncate`}>
                          {row.name}
                        </h4>
                        <div className={`${dyp.kMeta} mt-1 flex flex-wrap items-center gap-2`}>
                          <span className={dyp.kChipTeal}>
                            {t("stonesCount", { count: stones.length })}
                          </span>
                          <span>📅 {formatDate(row.created_at)}</span>
                        </div>
                        {row.description && (
                          <p className={`${dyp.kDesc} mt-1.5 line-clamp-2`}>
                            {row.description}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
                        >
                          {isExpanded ? t("toggle.hide") : t("toggle.show")}
                        </button>
                        <button
                          onClick={() => startEdit(row)}
                          className={`${dyp.kBtnGhost} ${dyp.kBtnSm}`}
                        >
                          {t("item.edit")}
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          className={`${dyp.kBtnDanger} ${dyp.kBtnSm}`}
                        >
                          {t("item.delete")}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={`${dyp.kDivider} mt-3 space-y-3 border-t pt-3`}>
                        <div>
                          <div className={`${dyp.kFieldTitle} mb-1`}>
                            {t("detail.stones")}
                          </div>
                          {stones.length === 0 ? (
                            <p className={dyp.kMeta}>
                              {t("detail.noStones")}
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {stones.map((s, i) => (
                                <span
                                  key={`${row.id}-s-${i}`}
                                  className={`${dyp.kChip} inline-flex items-center gap-1`}
                                >
                                  💎 {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {row.description && (
                          <div>
                            <div className={`${dyp.kFieldTitle} mb-1`}>
                              {t("detail.purpose")}
                            </div>
                            <p className={`${dyp.kFieldText} whitespace-pre-wrap`}>
                              {row.description}
                            </p>
                          </div>
                        )}

                        {row.note && (
                          <div>
                            <div className={`${dyp.kFieldTitle} mb-1`}>
                              {t("detail.note")}
                            </div>
                            <p className={`${dyp.kFieldText} whitespace-pre-wrap`}>
                              {row.note}
                            </p>
                          </div>
                        )}

                        {(row.notes_text || row.notes_text_2) && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {row.notes_text && (
                              <div className={dyp.kField}>
                                <div className={`${dyp.kFieldTitle} mb-1`}>
                                  {t("detail.mineralSummary")}
                                </div>
                                <p className={`${dyp.kFieldText} whitespace-pre-wrap`}>
                                  {row.notes_text}
                                </p>
                              </div>
                            )}
                            {row.notes_text_2 && (
                              <div className={dyp.kAlertWarn}>
                                <div className="mb-1 text-[11px] font-black uppercase tracking-wide">
                                  {t("detail.warningSummary")}
                                </div>
                                <p className="whitespace-pre-wrap text-xs leading-5">
                                  {row.notes_text_2}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DanisanSectionShell>
  );
}
