"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  normalizeSearchQuery,
  protocolMatchesSearch,
} from "../lib/protocolActions";
import { useProtocolList } from "../hooks/useProtocolList";
import { ProtocolListCard } from "./ProtocolListCard";

export function KayitliProtokollerLayout() {
  const { confirm } = useConfirm();
  const { protocols, loading, loadErrorMessage, deleteProtocol } = useProtocolList();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeSearchQuery(search);
    if (!q) return protocols;
    return protocols.filter((p) => protocolMatchesSearch(p, q));
  }, [protocols, search]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      message: "Bu protokol silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;
    deleteProtocol(id);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-6 py-6 xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
            <Link
              href="/refleksoloji"
              className="inline-flex w-full shrink-0 items-center justify-center gap-3 rounded-2xl border-2 border-violet-400/50 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 px-6 py-4 text-[16px] font-black text-white shadow-[0_14px_36px_-10px_rgba(91,33,182,0.55)] ring-2 ring-white/40 transition duration-200 hover:scale-[1.04] hover:border-violet-300/70 hover:shadow-[0_18px_44px_-8px_rgba(139,92,246,0.7)] hover:shadow-violet-500/30 sm:w-auto sm:justify-start sm:px-7 sm:py-4 sm:text-[17px]"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/20 text-lg shadow-sm"
                aria-hidden
              >
                🏠
              </span>
              <span>← Refleksoloji Ana Menü</span>
            </Link>
            <header className="min-w-0">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/90">
                Refleksoloji · Kayıtlı Protokoller
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Kayıtlı Protokoller
              </h1>
              <p className="mt-1 max-w-3xl text-base font-medium text-slate-600 sm:text-lg">
                Supabase protokol kütüphanesinden {protocols.length} kayıt listeleniyor.
              </p>
            </header>
          </div>

          <Link
            href="/refleksoloji/protokol-haritasi"
            className="shrink-0 rounded-xl border border-emerald-300/80 bg-emerald-500 px-5 py-3 text-base font-bold text-white shadow-md transition hover:bg-emerald-600"
          >
            + Yeni Protokol Oluştur
          </Link>
        </div>

        {loadErrorMessage ? (
          <p
            className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-base font-semibold text-rose-900"
            role="alert"
          >
            {loadErrorMessage}
          </p>
        ) : null}

        {protocols.length > 0 ? (
          <div className="mt-6">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Başlık, hedef, organ veya nota göre ara..."
              className="w-full max-w-xl rounded-xl border border-violet-200/90 bg-white/90 px-4 py-3 text-base font-medium text-slate-800 outline-none ring-violet-300/30 focus:border-violet-400 focus:ring-2"
            />
          </div>
        ) : null}

        {!loadErrorMessage && protocols.length === 0 ? (
          <section className="mt-8 flex flex-col items-center justify-center rounded-[28px] border border-dashed border-violet-200/70 bg-white/80 px-8 py-20 text-center shadow-sm ring-1 ring-violet-100/60">
            <p className="text-2xl font-bold text-violet-900">Henüz protokol yok</p>
            <p className="mt-3 max-w-lg text-base font-medium text-slate-600">
              Toplu veri aktarımı veya Protokol Haritası ile yeni kayıt ekleyebilirsiniz.
            </p>
            <Link
              href="/refleksoloji/protokol-haritasi"
              className="mt-6 rounded-xl border border-emerald-300/80 bg-emerald-500 px-6 py-3 text-base font-bold text-white shadow-md transition hover:bg-emerald-600"
            >
              + Yeni Protokol Oluştur
            </Link>
          </section>
        ) : !loadErrorMessage && filtered.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-violet-100 bg-white/80 px-6 py-10 text-center text-base font-medium text-slate-600">
            Aramanızla eşleşen protokol bulunamadı.
          </p>
        ) : !loadErrorMessage ? (
          <section className="mt-6 grid grid-cols-1 gap-5 pb-10 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((protocol) => (
              <ProtocolListCard
                key={protocol.id}
                protocol={protocol}
                onDelete={() => void handleDelete(protocol.id)}
              />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
