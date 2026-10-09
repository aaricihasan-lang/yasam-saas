"use client";

// AŞAMA 3C — Manuel Human Design harita kaydı KAPATILDI (ürün kararı: başka sitede hesaplanıp elle
// girilen harita dönemi bitti; RoxyAPI otomatik hesaplama tek üretim yolu). Bu adres eski bağlantılar /
// yer imleri için KORUNUR (404 yok): yeni kayıt yerine Human Design Hesaplama'ya yönlendirir. Eski manuel
// kayıtlar silinmez; Geçmiş Analizler / Kayıtlı Haritalar'dan salt-okunur açılır. Sunucu tarafında da
// yeni manuel kayıt (POST /api/hd/charts?scope=manual) 410 döner.

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HumanDesignShell } from "../components/HumanDesignShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

function ManualClosedNotice() {
  const clientId = useSearchParams().get("clientId");
  const safeClientId = clientId && /^[A-Za-z0-9-]{1,64}$/.test(clientId) ? clientId : null;
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-5 py-6" data-hd-manual-closed>
      <p className="m-0 text-sm font-bold text-amber-900">Yeni manuel Human Design kaydı artık kullanılmıyor.</p>
      <p className="m-0 mt-1 text-sm text-amber-800">Human Design Hesaplama bölümünden otomatik hesaplama yapın.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={safeClientId ? `/human-design/danisanlar/${safeClientId}` : "/human-design/danisanlar"}
          className="inline-flex h-9 items-center rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white no-underline hover:bg-indigo-700"
        >
          Human Design Hesaplama
        </Link>
        <Link
          href="/human-design/kayitli-haritalar"
          className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50"
        >
          Eski kayıtlar
        </Link>
      </div>
    </div>
  );
}

export default function HdHaritaKaydiPage() {
  return (
    <HumanDesignShell>
      <BfcacheRefreshHandler />
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Human Design — Harita Kaydı</h1>
      </div>
      <Suspense fallback={<div className="py-10 text-center text-sm text-slate-500">Yükleniyor...</div>}>
        <ManualClosedNotice />
      </Suspense>
    </HumanDesignShell>
  );
}
