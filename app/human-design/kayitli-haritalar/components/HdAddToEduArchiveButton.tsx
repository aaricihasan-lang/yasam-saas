"use client";

// FAZ 7 — Kayıtlı harita işlem çubuğunda "Eğitim Arşivime Ekle" (Eğitmene Özel Eğitim Haritaları giriş noktası).
// YALNIZ sunucu erişim yoklaması (/api/hd/education/private/access) 200 dönerse görünür: owner'ın özel arşiv yetkisi verdiği
// eğitmen (veya owner). Diğer herkes için düğme hiç çizilmez (özellik kapalıyken sunucu DB'ye gitmeden 404 döner).
// Düğme yalnız ekleme akışını açar (kaynak harita seçili gelir); kayıt OLUŞTURMAZ. İzin / uygunluk akışta ve sunucuda denetlenir.
import Link from "next/link";
import { useEffect, useState } from "react";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

let probe: Promise<boolean> | null = null;
export function privateArchiveVisible(): Promise<boolean> {
  probe ??= fetch("/api/hd/education/private/access", {
    headers: { "x-user-id": readYasamUser()?.id ?? "", ...sessionTokenHeader() },
    cache: "no-store",
    credentials: "same-origin",
  }).then(async (r) => r.ok && ((await r.json().catch(() => null)) as { visible?: boolean } | null)?.visible === true).catch(() => false);
  return probe;
}

export function HdAddToEduArchiveButton({ chartId }: { chartId: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    void privateArchiveVisible().then((v) => { if (live) setShow(v); });
    return () => { live = false; };
  }, []);
  if (!show) return null;
  return (
    <Link
      href={`/human-design/egitim-merkezi/ozel/ekle?chart=${encodeURIComponent(chartId)}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
      data-hd-edu-archive-add
    >
      Eğitim Arşivime Ekle
    </Link>
  );
}
