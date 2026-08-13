"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { CanonicalGroupList, type GroupListItem } from "@/components/human-design/knowledge/CanonicalGroupList";
import { KnowledgeLocked } from "@/components/human-design/knowledge/KnowledgeStates";
import { fetchCanonicalGroups } from "./helpers/hdCanonicalRead";
import { hdGet } from "@/app/admin/human-design/adminHdApi";
import type { HdCanonicalEntityRow } from "@/lib/human-design/admin/centralContentTypes";
import type { HdEntityKind } from "@/lib/human-design/knowledge/expertReadTypes";

/**
 * YENİ canonical Bilgi Bankası — ana giriş yüzeyi (merkezî hd_canonical_* sistemi).
 * Sunum PAYLAŞILIR (CanonicalGroupList); veri KAYNAĞI rol-bilinçlidir:
 *   - admin → /api/admin/hd/* (adminHdApi): TÜM kimlikler (taslak dahil) → düzenlenebilir.
 *   - normal uzman → /api/hd/bilgi-bankasi: yalnız YAYINLANMIŞ kimlikler (salt-okuma).
 * Legacy sistem ROLLBACK olarak /human-design/bilgi-bankasi/legacy altında korunur.
 */
export default function HdCanonicalBilgiBankasiPage() {
  useBfcacheRefresh();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [kind, setKind] = useState<HdEntityKind>("tip");
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  useEffect(() => {
    const u = readYasamUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(isAdminUser(u));
    setIsDemo(u?.is_demo_account === true);
  }, []);

  const load = useCallback(
    async (k: HdEntityKind, admin: boolean) => {
      setLoading(true);
      setError(null);
      setLocked(null);
      if (admin) {
        const r = await hdGet<{ rows: HdCanonicalEntityRow[] }>(`canonical?kind=${k}`);
        if (r.ok) {
          setItems(
            (r.data.rows ?? []).map((row) => ({
              canonical_key: row.canonical_key,
              name_tr: row.name_tr,
              name_original: row.name_original,
            })),
          );
        } else {
          setError(r.error);
          setItems([]);
        }
      } else {
        const r = await fetchCanonicalGroups(k);
        if (r.ok) {
          setItems(r.items.map((it) => ({ canonical_key: it.canonical_key, name_tr: it.name_tr, name_original: it.name_original })));
        } else if (r.locked) {
          setLocked("Human Design Bilgi Bankası hesabınız için henüz aktif değil. Erişim için yöneticinizle iletişime geçin.");
          setItems([]);
        } else {
          setError(r.error);
          setItems([]);
        }
      }
      setLoading(false);
    },
    [],
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(kind, isAdmin); }, [kind, isAdmin, load]);

  return (
    <HumanDesignShell maxWidthClass="max-w-4xl">
      {isDemo && (
        <DemoModuleBanner
          className="mb-3"
          message="Demo hesabında Human Design bilgi bankası görüntülenebilir. İçerik yönetimi yapılamaz."
        />
      )}

      <div className="mb-4 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Human Design — Bilgi Bankası</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Tipler, Otoriteler, Kapılar ve Kanallar için kaynaklandırılmış merkezî içerik.
          {isAdmin && " (Admin: taslak dahil tüm kayıtları görür ve düzenleyebilir.)"}
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
        {locked ? (
          <KnowledgeLocked message={locked} />
        ) : (
          <CanonicalGroupList
            activeKind={kind}
            onKind={setKind}
            items={items}
            loading={loading}
            error={error}
            hrefFor={(key) => `/human-design/bilgi-bankasi/canonical/${encodeURIComponent(key)}`}
            emptyLabel={isAdmin ? "Bu türde kimlik bulunamadı." : "Henüz yayınlanmış içerik yok."}
          />
        )}
      </div>

      <div className="mt-4 text-center">
        <Link
          href="/human-design/bilgi-bankasi/legacy"
          className="text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
        >
          Eski Bilgi Bankası (yedek)
        </Link>
      </div>
    </HumanDesignShell>
  );
}
