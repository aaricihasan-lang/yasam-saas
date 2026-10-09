"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import Link from "next/link";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { CanonicalGroupList, type GroupListItem } from "@/components/human-design/knowledge/CanonicalGroupList";
import { HdKnowledgeWorkspace } from "./components/HdKnowledgeWorkspace";
import { HdConfirmModal } from "@/app/admin/human-design/components/HdConfirmModal";
import { hdGet, hdSend } from "@/app/admin/human-design/adminHdApi";
import { sortCanonicalRows } from "@/lib/human-design/admin/hdSort";
import { badgeForContentStatus } from "@/lib/human-design/admin/hdContentBadge";
import type { HdCanonicalAdminListRow } from "@/lib/human-design/admin/centralContentTypes";
import type { HdEntityKind } from "@/lib/human-design/knowledge/expertReadTypes";

/**
 * YENİ premium canonical Bilgi Bankası — ürün ana giriş yüzeyi (merkezî hd_canonical_*).
 * Sunum PAYLAŞILIR (CanonicalGroupList — /admin/human-design ile AYNI bileşen);
 * veri KAYNAĞI rol-bilinçlidir:
 *   - admin → /api/admin/hd/* (adminHdApi): TÜM kimlikler (taslak dahil) → düzenlenebilir,
 *     seçim + toplu İÇERİK silme açık (kimlik silinmez).
 *   - normal uzman → (P1-4) KENDİ Bilgi Bankası çalışma alanı (human_design_knowledge_records):
 *     liste + ekle + düzenle + sil. Merkezî canonical corpus uzmana kapalıdır (admin izolasyonu);
 *     eskiden uzman burada her zaman yanıltıcı "henüz içerik oluşturulmamış" boş durumu görüyordu.
 * Sıralama deterministiktir (hdSort): Tip/Otorite sabit, Kapı 1→64, Kanal [A,B] tuple.
 */
export default function HdCanonicalBilgiBankasiPage() {
  useBfcacheRefresh();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [kind, setKind] = useState<HdEntityKind>("tip");
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingBulk, setPendingBulk] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkGuardRef = useRef(false);
  const { confirm } = useConfirm();

  useEffect(() => {
    const u = readYasamUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(isAdminUser(u));
    setIsDemo(u?.is_demo_account === true);
  }, []);

  const load = useCallback(
    async (k: HdEntityKind, admin: boolean) => {
      // Admin knowledge isolation: merkezî canonical corpus ADMIN/OWNER'a özeldir.
      // Non-admin istemci canonical'ı HİÇ ÇAĞIRMAZ (server da 403 döner) → empty-state.
      if (!admin) {
        setItems([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const r = await hdGet<{ rows: HdCanonicalAdminListRow[] }>(`canonical?kind=${k}`);
      if (r.ok) {
        const sorted = sortCanonicalRows(k, r.data.rows ?? []);
        setItems(sorted.map((row) => ({
          id: row.id,
          canonical_key: row.canonical_key,
          name_tr: row.name_tr,
          name_original: row.name_original,
          // Badge source-of-truth = hd_canonical_content.status (entity.status DEĞİL).
          badge: badgeForContentStatus(row.content_status),
        })));
      } else { setError(r.error); setItems([]); }
      setLoading(false);
    },
    [],
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(kind, isAdmin); }, [kind, isAdmin, load]);

  // 3+ kayıt → sistem geneli 3 aşamalı toplu silme (ortak ConfirmProvider); 1–2 kayıt → HdConfirmModal.
  const requestBulkDelete = async (ids: string[]) => {
    if (ids.length === 0 || bulkGuardRef.current) return;
    if (!requiresBulkDeleteGuard(ids.length)) {
      setPendingBulk(ids);
      return;
    }
    bulkGuardRef.current = true;
    try {
      const ok = await runBulkDeleteConfirm(confirm, {
        count: ids.length,
        detail:
          "İçeriği olan kayıtların içeriği (ve bağlı kanıt bağlantıları) kaldırılacaktır. Canonical kimlik kayıtları silinmeyecektir.",
      });
      if (ok) await runBulkDelete(ids);
    } finally {
      bulkGuardRef.current = false;
    }
  };

  const runBulkDelete = async (idsArg?: string[]) => {
    const pendingIds = idsArg ?? pendingBulk;
    if (!pendingIds || pendingIds.length === 0) return;
    setBulkBusy(true);
    setMsg(null);
    const r = await hdSend<{ deleted_count: number; entities_without_content: number }>(
      "POST", "content/bulk-delete", { entity_ids: pendingIds },
    );
    setBulkBusy(false);
    setPendingBulk(null);
    if (r.ok) {
      const skipped = r.data.entities_without_content;
      setMsg(`${r.data.deleted_count} içerik silindi${skipped ? ` · ${skipped} kayıtta içerik yoktu` : ""}. Canonical kimlikler korundu.`);
      await load(kind, isAdmin);
    } else setMsg(`Toplu silme başarısız: ${r.error}`);
  };

  const pendingCount = pendingBulk?.length ?? 0;

  return (
    <HumanDesignShell maxWidthClass="max-w-[1400px]">
      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Demo hesabında Human Design bilgi bankası görüntülenebilir. İçerik yönetimi yapılamaz." />
      )}

      <div className="mb-4 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Human Design — Bilgi Bankası</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {isAdmin
            ? "Tipler, Otoriteler, Kapılar ve Kanallar için kaynaklandırılmış merkezî içerik. (Admin: taslak dahil tüm kayıtları görür, düzenler ve seçili içerikleri toplu silebilir.)"
            : "Tip, otorite, profil, tanım, merkez, kanal, kapı ve strateji yorumlarınızı yönetin. Aktif kayıtlar Rapor Oluştur ekranında danışan haritasıyla otomatik eşleşir."}
        </p>
      </div>

      {msg && <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-100">{msg}</p>}

      {!isAdmin ? (
        <HdKnowledgeWorkspace isDemo={isDemo} />
      ) : (
      <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md sm:p-5">
        {(
          <CanonicalGroupList
            activeKind={kind}
            onKind={setKind}
            items={items}
            loading={loading}
            error={error}
            hrefFor={(key) => `/human-design/bilgi-bankasi/canonical/${encodeURIComponent(key)}`}
            emptyLabel="Bu türde kimlik bulunamadı."
            selectable={isAdmin && !isDemo}
            onBulkDelete={(ids) => void requestBulkDelete(ids)}
            bulkBusy={bulkBusy}
          />
        )}
      </div>
      )}

      {isAdmin && (
        <div className="mt-4 text-center">
          <Link href="/human-design/bilgi-bankasi/legacy" className="text-sm font-bold text-indigo-600 underline-offset-2 hover:underline">
            Kişisel Bilgi Kayıtlarım
          </Link>
        </div>
      )}

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
        loading={bulkBusy}
        onConfirm={() => void runBulkDelete()}
        onCancel={() => setPendingBulk(null)}
      />
    </HumanDesignShell>
  );
}
