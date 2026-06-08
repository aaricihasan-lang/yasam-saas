"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  listHdClients,
  deleteHdClient,
  type HdClientRow,
} from "../helpers/hdClients";

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return val;
  }
}

export function HdClientListesi() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState<HdClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    const { rows: data, error } = await listHdClients();
    setLoading(false);
    if (error) {
      showToast({ message: `Yüklenemedi: ${error}`, type: "error" });
    } else {
      setRows(data);
    }
  }, [showToast]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.birth_place]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [rows, search]);

  async function handleDelete(row: HdClientRow) {
    const ok = await confirm({
      title: "Danışanı sil",
      message: `"${row.name}" kalıcı olarak silinecek. Emin misiniz?`,
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const { error } = await deleteHdClient(row.id);
    if (error) {
      showToast({ message: `Silinemedi: ${error}`, type: "error" });
    } else {
      showToast({ message: "Danışan silindi.", type: "success" });
      loadRows();
    }
  }

  return (
    <>
      {/* Filtre */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad Soyad veya Doğum Yeri ara..."
          className="h-9 min-w-[200px] flex-1 rounded-xl border border-indigo-200/90 bg-white px-3 text-sm shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={loadRows}
          className="h-9 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          Yenile
        </button>
      </div>

      {/* Tablo */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          Yükleniyor...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          {rows.length === 0 ? "Henüz danışan yok." : "Arama sonucu bulunamadı."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-indigo-100/80">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-indigo-50/80">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                  Ad Soyad
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 sm:table-cell">
                  Doğum Tarihi
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 md:table-cell">
                  Doğum Yeri
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 lg:table-cell">
                  Kayıt Tarihi
                </th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-600">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50/80">
              {filtered.map((row) => (
                <tr key={row.id} className="bg-white transition-colors hover:bg-indigo-50/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    {row.birth_place && (
                      <p className="text-xs text-slate-500 sm:hidden">{row.birth_place}</p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-700 sm:table-cell">
                    {formatDate(row.birth_date)}
                    {row.birth_time ? ` · ${row.birth_time}` : ""}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                    {row.birth_place ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/human-design/danisanlar/${row.id}`}
                        className="flex h-7 items-center rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-bold text-indigo-700 no-underline transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        Detay
                      </Link>
                      <Link
                        href={`/human-design/harita-kaydi?clientId=${row.id}`}
                        className="flex h-7 items-center rounded-lg border border-violet-200 bg-white px-2.5 text-xs font-bold text-violet-700 no-underline transition hover:border-violet-400 hover:bg-violet-50"
                      >
                        Harita Kaydı
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
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
            {filtered.length} / {rows.length} danışan
          </div>
        </div>
      )}

    </>
  );
}
