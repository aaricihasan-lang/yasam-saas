"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { HD_KNOWLEDGE_CATEGORIES } from "@/lib/human-design/constants";
import {
  listHdKnowledgeRecords,
  deleteHdKnowledgeRecord,
  deleteHdKnowledgeRecords,
  type HdKnowledgeRow,
} from "../helpers/hdBilgiKayit";
import { HdDetayModal } from "./HdDetayModal";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
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
  const cls = CATEGORY_COLORS[category] ?? "bg-slate-100 text-slate-700 ring-slate-200/80";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${cls}`}>
      {category}
    </span>
  );
}

export function HdBilgiKayitListesi() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState<HdKnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "passive">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editRow, setEditRow] = useState<HdKnowledgeRow | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const { rows: data, error } = await listHdKnowledgeRecords();
    setLoading(false);
    if (error) {
      showToast({ message: `Yüklenemedi: ${error}`, type: "error" });
    } else {
      setRows(data);
      setSelected(new Set());
    }
  }, [showToast]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

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

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteOne(id: string) {
    const ok = await confirm({
      title: "Kaydı sil",
      message: "Bu kayıt kalıcı olarak silinecek. Emin misiniz?",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const { error } = await deleteHdKnowledgeRecord(id);
    if (error) {
      showToast({ message: `Silinemedi: ${error}`, type: "error" });
    } else {
      showToast({ message: "Kayıt silindi.", type: "success" });
      loadRows();
    }
  }

  async function handleDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `${ids.length} kaydı sil`,
      message: "Seçili kayıtlar kalıcı olarak silinecek. Emin misiniz?",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const { error } = await deleteHdKnowledgeRecords(ids);
    if (error) {
      showToast({ message: `Silinemedi: ${error}`, type: "error" });
    } else {
      showToast({ message: `${ids.length} kayıt silindi.`, type: "success" });
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
          placeholder="Başlık, kod veya içerikte ara..."
          className="h-9 min-w-[180px] flex-1 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400"
        >
          <option value="">Tüm Kategoriler</option>
          {HD_KNOWLEDGE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as "" | "active" | "passive")}
          className="h-9 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400"
        >
          <option value="">Tüm Durumlar</option>
          <option value="active">Aktif</option>
          <option value="passive">Pasif</option>
        </select>
        <button
          type="button"
          onClick={loadRows}
          className="h-9 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          Yenile
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="h-9 rounded-xl border border-rose-300/80 bg-rose-600 px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105"
          >
            {selected.size} Seçiliyi Sil
          </button>
        )}
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          Yükleniyor...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          {rows.length === 0 ? "Henüz kayıt yok." : "Filtreye uyan kayıt bulunamadı."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-indigo-100/80">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-indigo-50/80">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                  Kategori
                </th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                  Başlık
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 md:table-cell">
                  Kod
                </th>
                <th className="hidden px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600 sm:table-cell">
                  Aktif
                </th>
                <th className="hidden px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">
                  Güncelleme
                </th>
                <th className="px-3 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-600">
                  İşlem
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
                      className="h-4 w-4 rounded border-indigo-300 accent-indigo-600"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="max-w-[200px] px-3 py-3">
                    <p className="truncate font-semibold text-slate-900">{row.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{row.content}</p>
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
                    {formatDate(row.updated_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditRow(row)}
                        className="h-7 rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(row.id)}
                        className="h-7 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-indigo-50/80 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
            {filtered.length} / {rows.length} kayıt
            {selected.size > 0 && ` · ${selected.size} seçili`}
          </div>
        </div>
      )}

      {/* Düzenle Modali */}
      {editRow && (
        <HdDetayModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            loadRows();
          }}
        />
      )}
    </>
  );
}
