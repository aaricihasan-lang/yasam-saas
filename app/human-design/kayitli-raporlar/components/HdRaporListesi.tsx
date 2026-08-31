"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  listReportsWithClients,
  deleteReport,
  type HdReportWithClient,
} from "../helpers/hdKayitliRaporlar";
import { downloadProfessionalReport } from "../helpers/hdProfessionalReport";
import { HdRaporDetayModal } from "./HdRaporDetayModal";

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

export function HdRaporListesi() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState<HdReportWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detayRow, setDetayRow] = useState<HdReportWithClient | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Admin knowledge isolation: profesyonel (canonical) rapor Word indirme yalnız
  // ADMIN/OWNER içindir (endpoint 403). Non-admin için indirme butonu gizlenir.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(isAdminUser(readYasamUser()));
  }, []);

  async function handleDownload(row: HdReportWithClient) {
    setDownloadingId(row.id);
    const res = await downloadProfessionalReport(row.id);
    setDownloadingId(null);
    if (!res.ok) showToast({ message: `İndirilemedi: ${res.error}`, type: "error" });
  }

  const loadRows = useCallback(async () => {
    setLoading(true);
    const { rows: data, error } = await listReportsWithClients();
    setLoading(false);
    if (error) {
      showToast({ message: `Yüklenemedi: ${error}`, type: "error" });
    } else {
      setRows(data);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRows();
  }, [loadRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.client?.name ?? ""]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [rows, search]);

  // rows zaten created_at DESC — her client_id için ilk kayıt en son rapordur
  const latestIdPerClient = useMemo(() => {
    const seen = new Set<string>();
    const latest = new Set<string>();
    for (const row of rows) {
      if (!row.client_id) continue;
      if (!seen.has(row.client_id)) {
        seen.add(row.client_id);
        latest.add(row.id);
      }
    }
    return latest;
  }, [rows]);

  async function handleDelete(row: HdReportWithClient) {
    const ok = await confirm({
      title: "Raporu sil",
      message: `"${row.title}" raporunu kalıcı olarak silmek istiyor musunuz?`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;

    setDeletingId(row.id);
    const { error } = await deleteReport(row.id);
    setDeletingId(null);

    if (error) {
      showToast({ message: `Silinemedi: ${error}`, type: "error" });
    } else {
      showToast({ message: "Rapor silindi.", type: "success" });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  }

  return (
    <>
      {/* Arama */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Danışan adı veya rapor başlığı ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-indigo-200/90 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400"
        />
      </div>

      {/* İçerik */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500">
          Yükleniyor...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-200/80 bg-indigo-50/30 py-20 text-center">
          <p className="text-sm font-semibold text-slate-600">
            {search ? "Arama sonucu bulunamadı." : "Henüz kayıtlı rapor yok."}
          </p>
          {!search && (
            <Link
              href="/human-design/rapor-olustur"
              className="mt-3 inline-flex h-9 items-center rounded-xl border border-fuchsia-300/80 bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-sm font-black text-white no-underline shadow-sm transition hover:brightness-105"
            >
              Rapor Oluştur
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((row) => {
            const isCanonical = row.report_kind === "canonical";
            return (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-2xl border border-indigo-100/80 bg-white/90 px-5 py-4 shadow-sm ring-1 ring-indigo-100/40 transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Bilgiler */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black text-slate-900">
                    {row.title}
                  </p>
                  {isCanonical && (
                    <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-black text-teal-700 ring-1 ring-teal-200/80">
                      Profesyonel
                    </span>
                  )}
                  {latestIdPerClient.has(row.id) && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200/80">
                      Son
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-indigo-700">
                    {row.client?.name ?? "—"}
                  </span>
                  <span>·</span>
                  <span>{formatDate(row.created_at)}</span>
                </div>
              </div>

              {/* Aksiyonlar */}
              <div className="flex shrink-0 gap-2">
                {isCanonical ? (
                  // Profesyonel (canonical): DONMUŞ snapshot'tan Word indir. Düzenle YOK
                  // (immutable/§40); Detay YOK (içerik snapshot'ta, editable metin yok).
                  // Merkezî canonical prose içerdiğinden yalnız ADMIN/OWNER indirebilir.
                  isAdmin ? (
                    <button
                      type="button"
                      disabled={downloadingId === row.id}
                      onClick={() => handleDownload(row)}
                      className="flex h-8 items-center rounded-lg border border-teal-300 bg-white px-3.5 text-xs font-bold text-teal-700 transition hover:border-teal-400 hover:bg-teal-50 disabled:opacity-50"
                    >
                      {downloadingId === row.id ? "İndiriliyor…" : "Word İndir"}
                    </button>
                  ) : null
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setDetayRow(row)}
                      className="flex h-8 items-center rounded-lg border border-indigo-200 bg-white px-3.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      Detay
                    </button>
                    <Link
                      href={`/human-design/rapor-olustur?reportId=${row.id}`}
                      className="flex h-8 items-center rounded-lg border border-violet-200 bg-white px-3.5 text-xs font-bold text-violet-700 no-underline transition hover:border-violet-400 hover:bg-violet-50"
                    >
                      Düzenle
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  disabled={deletingId === row.id}
                  onClick={() => handleDelete(row)}
                  className="flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
                >
                  {deletingId === row.id ? "..." : "Sil"}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {detayRow && (
        <HdRaporDetayModal row={detayRow} onClose={() => setDetayRow(null)} />
      )}
    </>
  );
}
