"use client";

/**
 * Doğaltaş Kütüphanesi giriş noktası (owner kararı 30.10.2026): owner DAHİL herkese uzman kütüphane görünümü açılır.
 * Owner'a ayrıca üstte "Kütüphane Yönetimi" sekmesi gösterilir (→ /dogaltas/kutuphane/yonetim). Owner kararı SUNUCUDADIR:
 * yoklama owner yönetim ucuna gider; owner olmayan herkese tek tip 404 → sekme yok. Uzman görünümünde yönetim kontrolü yoktur.
 */

import { useEffect, useState } from "react";
import { ownerGet } from "@/app/admin/dogaltas-kutuphane/_components/ownerApi";
import LibraryClient from "./LibraryClient";

export const OWNER_MANAGEMENT_HREF = "/dogaltas/kutuphane/yonetim";

export default function LibraryEntry() {
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await ownerGet<{ ok: true }>("/katalog?yoklama=1", ctrl.signal);
      if (!ctrl.signal.aborted) setOwner(r.ok);
    })();
    return () => ctrl.abort();
  }, []);

  return <LibraryClient ownerWorkspaceHref={owner ? OWNER_MANAGEMENT_HREF : undefined} />;
}
