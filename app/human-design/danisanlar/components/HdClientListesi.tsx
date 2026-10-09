"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  listHdClients,
  deleteHdClient,
  previewHdClientDelete,
  retryHdImageCleanup,
  type HdClientRow,
} from "../helpers/hdClients";
import { notifyHdProfileDeleted } from "@/lib/human-design/api/chartsClient";

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef(false);
  // Silme tamam ama bazı görseller temizlenemedi → uzman yeniden temizlemeyi başlatabilir.
  // (Sayfa yenilense de kalan dosyalar bir sonraki profil silmede sunucuda otomatik taranır.)
  const [imageCleanupPending, setImageCleanupPending] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  async function handleImageCleanup() {
    if (cleaning) return;
    setCleaning(true);
    const r = await retryHdImageCleanup();
    setCleaning(false);
    if (r.ok) {
      setImageCleanupPending(false);
      showToast({ message: r.removed > 0 ? `Kalan ${r.removed} görsel temizlendi.` : "Temizlenecek görsel kalmadı.", type: "success" });
    } else {
      showToast({ message: `Görseller temizlenemedi: ${r.error ?? "lütfen daha sonra tekrar deneyin."}`, type: "error" });
    }
  }

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

  // Owner kararı (2026-10-09): profil silinince bağlı TÜM Human Design analizleri ve Word raporları
  // da silinir. Kapsam sunucudan KESİN alınır (profil + tenant kimliği), iki ayrı onay istenir;
  // onaydan sonra kapsam büyüdüyse sunucu hiçbir şey silmez (409).
  async function handleDelete(row: HdClientRow) {
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında danışan silinemez.", type: "info" });
      return;
    }
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeletingId(row.id);
    let attempted = false;
    try {
      const { scope, error: scopeErr } = await previewHdClientDelete(row.id);
      if (!scope) {
        showToast({ message: `Silinecek kayıtlar belirlenemedi; hiçbir şey silinmedi. ${scopeErr ?? ""}`.trim(), type: "error" });
        return;
      }
      const counts = `${scope.analyses} Human Design analizi ve ${scope.reports} Word raporu`;
      const journeyLine = scope.journeyLinked
        ? " Danışan Yolculuğu'ndaki danışan kaydı ve diğer modüllerin verileri silinmez; yalnız Human Design bağlantısı kaldırılır."
        : "";
      const first = await confirm({
        title: "Human Design profilini sil",
        message: `Bu Human Design profiliyle birlikte ona bağlı tüm Human Design analizleri ve Word raporları kalıcı olarak silinecektir. Bu işlem geri alınamaz.\n\n"${row.name}": ${counts} silinecek.${journeyLine}`,
        tone: "danger",
        confirmText: "Evet, devam et",
        cancelText: "Vazgeç",
      });
      if (!first) return;
      const second = await confirm({
        title: "Son onay",
        message: `"${row.name}" profili, ${counts} kalıcı olarak silinecek. Geri alınamaz. Emin misiniz?`,
        tone: "danger",
        confirmText: "Evet, kalıcı olarak sil",
        cancelText: "Vazgeç",
      });
      if (!second) return;
      attempted = true;
      const res = await deleteHdClient(row.id, { analyses: scope.analyses, reports: scope.reports });
      if (res.error) {
        showToast({ message: `Silinemedi: ${res.error}`, type: "error" });
        return;
      }
      const storageWarn = res.warnings?.includes("storage_cleanup_failed")
        ? " Bazı görsel dosyaları temizlenemedi (kayıtlar silindi); 'Kalan görselleri temizle' ile yeniden deneyebilirsiniz."
        : "";
      if (storageWarn) setImageCleanupPending(true);
      showToast({
        message: `Profil silindi: ${res.deletedAnalyses ?? 0} analiz ve ${res.deletedReports ?? 0} Word raporu kaldırıldı.${storageWarn}`,
        type: storageWarn ? "warning" : "success",
      });
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
      // Silme isteği gönderildiyse sonuç ne olursa olsun (başarı / kısmi / ağ hatası) iki liste de
      // sunucudan yeniden okunur; Vazgeç'te hiçbir şey değişmediği için yenileme yok.
      if (attempted) {
        void loadRows();
        notifyHdProfileDeleted(row.id);
      }
    }
  }

  return (
    <>
      {imageCleanupPending ? (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" data-hd-image-cleanup>
          <span className="min-w-0">Silinen profile ait bazı görsel dosyaları temizlenemedi. Kayıtlar silindi; görselleri yeniden temizleyebilirsiniz.</span>
          <button
            type="button"
            onClick={() => void handleImageCleanup()}
            disabled={cleaning}
            className="h-8 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            {cleaning ? "Temizleniyor…" : "Kalan görselleri temizle"}
          </button>
        </div>
      ) : null}

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
                    <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{row.name}</p>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${row.journey_client_id ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                    >
                      {row.journey_client_id ? "Danışan Yolculuğu'na bağlı" : "Danışan Yolculuğu'na bağlı değil"}
                    </span>
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
                        Aç
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={deletingId === row.id}
                        className="h-7 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {deletingId === row.id ? "..." : "Sil"}
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
