"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import Link from "next/link";
import { useTranslations } from "next-intl";
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

type AdminSource = "central" | "expert" | "system";

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
 *
 * ADMİN üç AYRI yorum kaynağı görür (birbirine karışmaz; mevcut veri kaynakları kullanılır):
 *   - Merkezi Bilgi Bankası Yorumu → hd_canonical_* (mevcut merkezî içerik; burada yönetilir)
 *   - Uzman Bilgilerim → adminin KENDİ kişisel kayıtları (human_design_knowledge_records; uzmanla aynı çalışma alanı)
 *   - Roxy API Yorumu → haritaya bağlı KAYITLI sağlayıcı yorumu; kütüphane değildir, harita ekranında görülür.
 * Normal uzman ekranı değişmez.
 */
export default function HdCanonicalBilgiBankasiPage() {
  useBfcacheRefresh();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [kind, setKind] = useState<HdEntityKind>("tip");
  const [adminSource, setAdminSource] = useState<AdminSource>("central");
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingBulk, setPendingBulk] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkGuardRef = useRef(false);
  const { confirm } = useConfirm();
  const t = useTranslations("hd.knowledge");
  // Yorum kaynağı adları (TR değerleri HdChartKnowledgeTabs.HD_ADMIN_SOURCE_LABELS ile bayt-eşit; ana ajan hd.records).
  const sourceLabel = useTranslations("hd.records.tabs");

  useEffect(() => {
    const u = readYasamUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(isAdminUser(u));
    setIsDemo(u?.is_demo_account === true);
    // Kişisel kayıt editöründen dönüşte admin "Uzman Bilgilerim" sekmesine döner (uzmanda etkisiz).
    if (new URLSearchParams(window.location.search).get("kaynak") === "uzman") setAdminSource("expert");
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
        detail: t("page.bulkDetail"),
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
      setMsg(t("page.bulkDone", { deleted: r.data.deleted_count, skippedNote: skipped ? t("page.bulkSkipped", { skipped }) : "" }));
      await load(kind, isAdmin);
    } else setMsg(t("page.bulkFailed", { error: String(r.error) }));
  };

  const pendingCount = pendingBulk?.length ?? 0;

  return (
    <HumanDesignShell maxWidthClass="max-w-[1400px]">
      {isDemo && (
        <DemoModuleBanner className="mb-3" message={t("page.demo")} />
      )}

      <div className="mb-4 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{t("page.title")}</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {isAdmin
            ? t("page.introAdmin")
            : t("page.introExpert")}
        </p>
      </div>

      {msg && <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-100">{msg}</p>}

      {isAdmin ? (
        <div role="tablist" aria-label={t("page.sourcesAria")} className="mb-3 flex w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto sm:inline-flex" data-hd-admin-source-tabs>
          {(["central", "expert", "system"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={adminSource === key}
              onClick={() => setAdminSource(key)}
              className={`min-h-[40px] flex-1 rounded-lg px-4 text-sm font-bold transition sm:flex-none ${
                adminSource === key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {sourceLabel(key)}
            </button>
          ))}
        </div>
      ) : null}

      {!isAdmin ? (
        <HdKnowledgeWorkspace isDemo={isDemo} />
      ) : adminSource === "expert" ? (
        <div data-hd-admin-source="expert">
          <p className="mb-2 text-xs leading-relaxed text-slate-600">
            {t("page.expertNote", { label: sourceLabel("expert") })}
          </p>
          <HdKnowledgeWorkspace isDemo={isDemo} />
        </div>
      ) : adminSource === "system" ? (
        <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 ring-1 ring-indigo-200/60" data-hd-admin-source="system">
          <p className="text-sm font-bold text-slate-800">{t("page.systemBound", { label: sourceLabel("system") })}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            {t("page.systemNote")}
          </p>
          <Link href="/human-design/danisanlar" className="mt-3 inline-flex text-sm font-bold text-indigo-600 underline-offset-2 hover:underline">
            {t("page.goAnalyses")}
          </Link>
        </div>
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
            emptyLabel={t("page.emptyKind")}
            selectable={isAdmin && !isDemo}
            onBulkDelete={(ids) => void requestBulkDelete(ids)}
            bulkBusy={bulkBusy}
          />
        )}
      </div>
      )}

      <HdConfirmModal
        open={pendingBulk !== null}
        title={t("page.bulkTitle")}
        severity="danger"
        description={
          <>
            {t.rich("page.bulkBody", { count: pendingCount, b: (c) => <span className="font-semibold text-slate-800">{c}</span> })}
            <span className="mt-1 block font-semibold text-slate-700">{t("page.bulkKeep")}</span>
            <span className="mt-1 block font-bold text-rose-600">{t("page.irreversible")}</span>
          </>
        }
        confirmLabel={t("page.bulkConfirm")}
        loading={bulkBusy}
        onConfirm={() => void runBulkDelete()}
        onCancel={() => setPendingBulk(null)}
      />
    </HumanDesignShell>
  );
}
