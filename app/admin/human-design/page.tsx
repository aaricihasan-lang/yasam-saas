"use client";

import { useCallback, useEffect, useState } from "react";
import { hdGet, hdSend } from "./adminHdApi";
import { sortCanonicalRows } from "@/lib/human-design/admin/hdSort";
import { HdConfirmModal } from "./components/HdConfirmModal";
import { CanonicalGroupList, type GroupListItem } from "@/components/human-design/knowledge/CanonicalGroupList";
import type { HdCanonicalEntityRow, HdEntityKind } from "@/lib/human-design/admin/centralContentTypes";

/**
 * Admin merkezî içerik yönetimi — ürün Bilgi Bankası ile AYNI liste bileşenini
 * (CanonicalGroupList) kullanır (tek UI). Fark yalnız detay link hedefi ve her zaman
 * admin veri kaynağı olmasıdır. Sıralama deterministik (hdSort). Toplu silme = İÇERİK
 * (canonical kimlik silinmez).
 */
export default function HdAdminHome() {
  const [kind, setKind] = useState<HdEntityKind>("tip");
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingBulk, setPendingBulk] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async (k: HdEntityKind) => {
    setLoading(true);
    setError(null);
    const r = await hdGet<{ rows: HdCanonicalEntityRow[] }>(`canonical?kind=${k}`);
    if (r.ok) {
      const sorted = sortCanonicalRows(k, r.data.rows ?? []);
      setItems(sorted.map((row) => ({
        id: row.id,
        canonical_key: row.canonical_key,
        name_tr: row.name_tr,
        name_original: row.name_original,
        badge: row.status === "published"
          ? { label: "Yayınlandı", tone: "published" as const }
          : { label: "Taslak", tone: "draft" as const },
      })));
    } else { setError(r.error); setItems([]); }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(kind); }, [kind, load]);

  const runBulkDelete = async () => {
    if (!pendingBulk) return;
    setBulkBusy(true);
    setMsg(null);
    const r = await hdSend<{ deleted_count: number; entities_without_content: number }>(
      "POST", "content/bulk-delete", { entity_ids: pendingBulk },
    );
    setBulkBusy(false);
    setPendingBulk(null);
    if (r.ok) {
      const skipped = r.data.entities_without_content;
      setMsg(`${r.data.deleted_count} içerik silindi${skipped ? ` · ${skipped} kayıtta içerik yoktu` : ""}. Canonical kimlikler korundu.`);
      await load(kind);
    } else setMsg(`Toplu silme başarısız: ${r.error}`);
  };

  const pendingCount = pendingBulk?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-xl font-black tracking-tight text-slate-900">Human Design — Merkezî Bilgi Bankası</h1>
      <p className="mb-5 text-xs text-slate-500">
        Merkezî canonical içerik yalnız Admin Panelinden yönetilir; uzmanlara otomatik görünmez.
      </p>

      {msg && <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-100">{msg}</p>}

      <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 sm:p-5">
        <CanonicalGroupList
          activeKind={kind}
          onKind={setKind}
          items={items}
          loading={loading}
          error={error}
          hrefFor={(key) => `/admin/human-design/${encodeURIComponent(key)}`}
          emptyLabel="Bu türde kimlik bulunamadı."
          selectable
          onBulkDelete={(ids) => setPendingBulk(ids)}
          bulkBusy={bulkBusy}
        />
      </div>

      <HdConfirmModal
        open={pendingBulk !== null}
        title="Seçili içerikleri sil"
        severity="danger"
        description={
          <>
            <span className="font-semibold text-slate-800">{pendingCount} kayıt</span> seçildi.
            İçeriği olan kayıtların içeriği (ve bağlı kanıt bağlantıları) kaldırılacaktır.
            <span className="mt-1 block font-semibold text-slate-700">Canonical kimlik kayıtları silinmeyecektir.</span>
            <span className="mt-1 block font-bold text-rose-600">Bu işlem geri alınamaz.</span>
          </>
        }
        confirmLabel="Seçili İçerikleri Sil"
        requireText={pendingCount >= 5 ? "SİL" : undefined}
        loading={bulkBusy}
        onConfirm={runBulkDelete}
        onCancel={() => setPendingBulk(null)}
      />
    </div>
  );
}
