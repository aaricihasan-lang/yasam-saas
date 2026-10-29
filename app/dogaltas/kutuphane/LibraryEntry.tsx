"use client";

/**
 * Doğaltaş Kütüphanesi giriş noktası (Doğaltaş modülü içi tek çalışma alanı).
 *   • Owner: yönetim kataloğu (tüm taşlar, taslak / yayında durumlarıyla) — Yönetim Paneli'ndeki aynı bileşen, Doğaltaş adresleriyle.
 *     `?gorunum=onizleme` → uzmanın gördüğü ekran (owner önizlemesi).
 *   • Diğer herkes: uzman ekranı (yalnız yetki verilmiş + yayımlanmış içerik).
 * Owner kararı SUNUCUDADIR: yoklama owner yönetim ucuna gider; owner olmayan herkese tek tip 404 döner (veri gitmez).
 * Yoklama bitene kadar nötr yükleniyor durumu gösterilir (uzman ekranı owner'a "yanıp sönmez").
 */

import { useEffect, useState } from "react";
import CatalogClient from "@/app/admin/dogaltas-kutuphane/CatalogClient";
import { ownerGet } from "@/app/admin/dogaltas-kutuphane/_components/ownerApi";
import { WorkspaceRoutes } from "@/app/admin/dogaltas-kutuphane/_components/ownerRoutes";
import LibraryClient from "./LibraryClient";
import s from "./kutuphane.module.css";

type Mode = "probing" | "owner" | "viewer";

export default function LibraryEntry({ preview }: { preview: boolean }) {
  const [mode, setMode] = useState<Mode>("probing");

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await ownerGet<{ ok: true }>("/katalog?yoklama=1", ctrl.signal);
      if (!ctrl.signal.aborted) setMode(r.ok ? "owner" : "viewer");
    })();
    return () => ctrl.abort();
  }, []);

  if (mode === "probing") {
    return (
      <main className={s.root}>
        <div className={s.page}>
          <p className={s.loading} role="status">
            Yükleniyor…
          </p>
        </div>
      </main>
    );
  }
  if (mode === "owner" && !preview) {
    return (
      <WorkspaceRoutes>
        <CatalogClient />
      </WorkspaceRoutes>
    );
  }
  return <LibraryClient ownerWorkspaceHref={mode === "owner" ? "/dogaltas/kutuphane" : undefined} />;
}
