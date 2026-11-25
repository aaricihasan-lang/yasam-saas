"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeTag } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import { useKbLabels } from "../helpers/useKbLabels";
import { KB_NETWORK_ERROR } from "../helpers/kbNetworkError";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import { HD_KNOWLEDGE_CATEGORIES } from "@/lib/human-design/constants";
import { sortHdKnowledgeRecords } from "@/lib/human-design/knowledge/hdKnowledgeSort";
import {
  listHdKnowledgeRecords,
  deleteHdKnowledgeRecord,
  deleteHdKnowledgeRecords,
  type HdKnowledgeRow,
} from "../helpers/hdBilgiKayit";

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(localeTag(locale as ActiveLocale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  Tipler: "bg-violet-100 text-violet-800 ring-violet-200/80",
  Otoriteler: "bg-indigo-100 text-indigo-800 ring-indigo-200/80",
  Profiller: "bg-sky-100 text-sky-800 ring-sky-200/80",
  Tanımlar: "bg-teal-100 text-teal-800 ring-teal-200/80",
  Merkezler: "bg-amber-100 text-amber-800 ring-amber-200/80",
  Kanallar: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  Kapılar: "bg-orange-100 text-orange-800 ring-orange-200/80",
  Stratejiler: "bg-rose-100 text-rose-800 ring-rose-200/80",
  "Genel Notlar": "bg-slate-100 text-slate-800 ring-slate-200/80",
};

function CategoryBadge({ category }: { category: string }) {
  const labels = useKbLabels();
  const cls = CATEGORY_COLORS[category] ?? "bg-slate-100 text-slate-700 ring-slate-200/80";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${cls}`}>
      {labels.category(category)}
    </span>
  );
}

export function HdBilgiKayitListesi({ onAddNew }: { onAddNew?: () => void } = {}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("hd.knowledge");
  const locale = useLocale();
  const labels = useKbLabels();
  // Ortak ağ hatası ekran diline eşlenir (kararlı bağımlılıklar: t + locale; sunucu metni aynen).
  const kbErr = useCallback(
    (e: string | null | undefined) => (locale !== "tr" && e === KB_NETWORK_ERROR ? t("networkError") : String(e ?? "")),
    [t, locale],
  );

  const [rows, setRows] = useState<HdKnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "passive">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkRef = useRef(false);

  // Liste sonucunu uygular (otomatik kararlı sıra: kategori → kapı numarası / kanal çifti /
  // sabit seçenek / TR alfabetik).
  const applyRows = useCallback(
    ({ rows: data, error }: Awaited<ReturnType<typeof listHdKnowledgeRecords>>) => {
      setLoading(false);
      if (error) {
        showToast({ message: t("list.loadError", { error: kbErr(error) }), type: "error" });
      } else {
        setRows(sortHdKnowledgeRecords(data));
        setSelected(new Set());
      }
    },
    [showToast, t, kbErr],
  );

  // Silme vb. sonrası yeniden yükleme (yükleniyor durumu gösterilir).
  const loadRows = useCallback(async () => {
    setLoading(true);
    applyRows(await listHdKnowledgeRecords());
  }, [applyRows]);

  // İlk yükleme: loading zaten true başlar; sonuç async geri çağrıda uygulanır.
  useEffect(() => {
    let alive = true;
    listHdKnowledgeRecords().then((r) => {
      if (alive) applyRows(r);
    });
    return () => {
      alive = false;
    };
  }, [applyRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (activeFilter === "active" && !row.is_active) return false;
      if (activeFilter === "passive" && row.is_active) return false;
      if (q) {
        const hay = [row.title, row.category, row.code, row.content]
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter, activeFilter]);

  // P2-12: seçim YALNIZ ekranda görünen (filtreye uyan) kayıtlar üzerinden çalışır. Filtre/
  // arama değişince seçim temizlenir → gizli satırlar asla toplu silinmez.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(new Set());
  }, [search, categoryFilter, activeFilter]);

  const visibleSelectedIds = useMemo(
    () => filtered.filter((r) => selected.has(r.id)).map((r) => r.id),
    [filtered, selected],
  );

  function toggleAll() {
    if (visibleSelectedIds.length === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteOne(id: string) {
    const ok = await confirm({
      title: t("list.deleteOneTitle"),
      message: t("list.deleteOneMessage"),
      tone: "danger",
      confirmText: t("list.delete"),
      cancelText: t("list.cancel"),
    });
    if (!ok) return;
    const { error } = await deleteHdKnowledgeRecord(id);
    if (error) {
      showToast({ message: t("list.deleteError", { error: kbErr(error) }), type: "error" });
    } else {
      showToast({ message: t("list.deleted"), type: "success" });
      loadRows();
    }
  }

  async function handleDeleteSelected() {
    const ids = [...visibleSelectedIds];
    if (ids.length === 0 || bulkRef.current) return;
    bulkRef.current = true; // onay süresince de kilitli → çift tıklama ikinci akış açmaz
    const message = t("list.bulkMessage");
    const ok = requiresBulkDeleteGuard(ids.length)
      ? await runBulkDeleteConfirm(confirm, { count: ids.length, detail: message })
      : await confirm({
          title: t("list.bulkTitle", { count: ids.length }),
          message: t("list.bulkConfirm", { message }),
          tone: "danger",
          confirmText: t("list.delete"),
          cancelText: t("list.cancel"),
        });
    if (!ok) {
      bulkRef.current = false;
      return;
    }
    setBulkBusy(true);
    const { error } = await deleteHdKnowledgeRecords(ids);
    bulkRef.current = false;
    setBulkBusy(false);
    if (error) {
      showToast({ message: t("list.deleteError", { error: kbErr(error) }), type: "error" });
    } else {
      showToast({ message: t("list.bulkDeleted", { count: ids.length }), type: "success" });
      loadRows();
    }
  }

  return (
    <>
      {/* Filtre Satırı */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("list.searchPlaceholder")}
          className="h-9 min-w-[180px] flex-1 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label={t("list.categoryFilter")}
          className="h-9 w-full rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 sm:w-auto"
        >
          <option value="">{t("list.allCategories")}</option>
          {HD_KNOWLEDGE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {labels.category(cat)}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "" | "active" | "passive")}
          aria-label={t("list.statusFilter")}
          className="h-9 w-full rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 sm:w-auto"
        >
          <option value="">{t("list.allStatuses")}</option>
          <option value="active">{t("list.active")}</option>
          <option value="passive">{t("list.passive")}</option>
        </select>
        <button
          type="button"
          onClick={loadRows}
          className="h-9 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          {t("list.refresh")}
        </button>
        {visibleSelectedIds.length > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={bulkBusy}
            className="h-9 rounded-xl border border-rose-300/80 bg-rose-600 px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
          >
            {bulkBusy ? t("list.deleting") : t("list.deleteSelected", { count: visibleSelectedIds.length })}
          </button>
        )}
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          {t("list.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-slate-500">
          {/* "Henüz kayıt yok" YALNIZ gerçekten sıfır kayıt varken görünür. */}
          <span>{rows.length === 0 ? t("list.emptyNone") : t("list.emptyFiltered")}</span>
          {rows.length === 0 && onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="h-10 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black text-white shadow-sm transition hover:brightness-105"
            >
              {t("list.addFirst")}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-indigo-100/80">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-indigo-50/80">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={visibleSelectedIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    aria-label={t("list.selectAllVisible")}
                    className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                  {t("col.category")}
                </th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                  {t("col.title")}
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 md:table-cell">
                  {t("col.code")}
                </th>
                <th className="hidden px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600 sm:table-cell">
                  {t("col.active")}
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">
                  {t("col.updated")}
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">
                  {t("col.relations")}
                </th>
                <th className="hidden px-3 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-600 sm:table-cell">
                  {t("col.action")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50/80">
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="group bg-white transition-colors hover:bg-indigo-50/40"
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={t("list.selectRow", { title: row.title ?? "" })}
                      className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="max-w-[200px] px-3 py-3">
                    <p className="truncate font-semibold text-slate-900">{row.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{row.content}</p>
                    {/* P2-4: mobilde aksiyonlar başlık altında (tablo içinde ekran dışına itilmez). */}
                    <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
                      <button
                        type="button"
                        onClick={() => router.push(`/human-design/bilgi-bankasi/${row.id}`)}
                        className="h-9 rounded-lg border border-indigo-200 bg-white px-3.5 text-xs font-bold text-indigo-700"
                      >
                        {t("list.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(row.id)}
                        className="h-9 rounded-lg border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-600"
                      >
                        {t("list.delete")}
                      </button>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                      {row.code}
                    </code>
                  </td>
                  <td className="hidden px-3 py-3 text-center sm:table-cell">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        row.is_active ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-slate-500 lg:table-cell">
                    {formatDate(row.updated_at, locale)}
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-200/70" title={t("list.relCenter")}>
                        M{(row.related_centers ?? []).length}
                      </span>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200/70" title={t("list.relChannel")}>
                        K{(row.related_channels ?? []).length}
                      </span>
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-black text-orange-700 ring-1 ring-orange-200/70" title={t("list.relGate")}>
                        G{(row.related_gates ?? []).length}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => router.push(`/human-design/bilgi-bankasi/${row.id}`)}
                        className="h-7 rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        {t("list.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(row.id)}
                        className="h-7 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50"
                      >
                        {t("list.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-indigo-50/80 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
            {t("list.footer", { shown: filtered.length, total: rows.length })}
            {visibleSelectedIds.length > 0 && ` · ${t("list.selectedCount", { count: visibleSelectedIds.length })}`}
          </div>
        </div>
      )}
    </>
  );
}
