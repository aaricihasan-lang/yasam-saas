"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { KupaShell, kupaBtnPrimary, kupaInput } from "@/app/kupa/components/KupaShell";
import { deleteProtocol, type CuppingProtocol } from "@/app/kupa/lib/api";
import { useProtocolList } from "./hooks/useProtocolList";
import { ProtocolListCard } from "./components/ProtocolListCard";

export default function ProtokollerPage() {
  const { protocols, loading, error, refresh } = useProtocolList();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "passive">("all");

  const categories = useMemo(
    () => Array.from(new Set(protocols.map((p) => p.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "tr")),
    [protocols],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return protocols.filter((p) => {
      if (category && p.category !== category) return false;
      if (status === "active" && p.is_active === false) return false;
      if (status === "passive" && p.is_active !== false) return false;
      if (!needle) return true;
      return (
        p.title.toLocaleLowerCase("tr").includes(needle) ||
        (p.category ? p.category.toLocaleLowerCase("tr").includes(needle) : false)
      );
    });
  }, [protocols, q, category, status]);

  async function handleDelete(p: CuppingProtocol) {
    const ok = await confirm({
      title: "Protokolü Sil",
      message: `"${p.title}" protokolünü silmek istediğinizden emin misiniz?\n\nBu protokole ait bölgeler, uygulama adımları, bilgiler ve kaynak bağlantıları silinir. Ana kütüphane kayıtları silinmez.`,
      confirmText: "Protokolü Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteProtocol(p.id);
      await refresh(); // server sonrası state
      showToast({ message: "Protokol silindi.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "Silinemedi.", type: "error" });
    }
  }

  const hasAny = protocols.length > 0;

  return (
    <KupaShell
      title="Hacamat Protokolleri"
      subtitle="Her rahatsızlık için bölgeleri, uygulama akışını, güvenliği ve bilgileri tek dosyada yönetin."
      breadcrumb={[{ label: "Protokoller" }]}
      fullBleedBelowLg
      actions={
        <Link href="/kupa/protokoller/yeni" className={`${kupaBtnPrimary} no-underline`}>
          + Yeni Protokol
        </Link>
      }
    >
      {hasAny ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-4 sm:px-0">
          <input className={`${kupaInput} max-w-xs`} placeholder="Protokol ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Protokol ara" />
          {categories.length > 0 ? (
            <select className={`${kupaInput} max-w-[12rem]`} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori">
              <option value="">Tüm kategoriler</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : null}
          <select className={`${kupaInput} max-w-[10rem]`} value={status} onChange={(e) => setStatus(e.target.value as "all" | "active" | "passive")} aria-label="Durum">
            <option value="all">Tümü</option>
            <option value="active">Aktif</option>
            <option value="passive">Pasif</option>
          </select>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 px-4 sm:px-0 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 sm:px-0">
          <p className="text-sm text-rose-600">{error}</p>
          <button type="button" className="mt-2 text-sm font-semibold text-amber-700 hover:underline" onClick={() => void refresh()}>
            Tekrar dene
          </button>
        </div>
      ) : !hasAny ? (
        <div className="mx-4 rounded-2xl border border-dashed border-amber-200 bg-white/70 px-6 py-12 text-center sm:mx-0">
          <p className="text-base font-bold text-slate-700">Henüz hacamat protokolünüz yok.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            İlk protokolünüzü oluşturarak uygulama bölgelerini, akışı ve bilgilerinizi tek dosyada yönetin.
          </p>
          <Link href="/kupa/protokoller/yeni" className={`mt-4 inline-flex no-underline ${kupaBtnPrimary}`}>
            + İlk Protokolü Oluştur
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 sm:px-0">Aramanızla eşleşen protokol bulunamadı.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-4 sm:px-0 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProtocolListCard key={p.id} protocol={p} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </KupaShell>
  );
}
