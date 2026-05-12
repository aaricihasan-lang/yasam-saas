"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type StoneRecord = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
  source_note: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  warning_tags: string[] | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, string[][]> | null;
  images: { id: string; name: string; url?: string; file_path?: string }[] | null;
  created_at: string;
  updated_at: string | null;
};

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function safeText(value: string | null | undefined, limit = 115) {
  if (!value) return "Kısa açıklama eklenmemiş.";
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function countFilledSections(stone: StoneRecord) {
  return [
    stone.short_description,
    stone.general_info,
    stone.source_note,
    stone.physical_effects,
    stone.spiritual_effects,
    stone.other_effects,
    stone.warning_text,
    stone.feng_shui,
    stone.meditation,
    stone.care,
    stone.application,
  ].filter((item) => item && item.trim().length > 0).length;
}

export default function DogaltasListesiPage() {
  const [stones, setStones] = useState<StoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [stoneToDelete, setStoneToDelete] = useState<StoneRecord | null>(null);

  async function loadStones() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("stones")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErrorMessage(`Kayıtlar alınamadı: ${error.message}`);
      return;
    }

    setStones((data || []) as StoneRecord[]);
  }

  async function deleteStone() {
    if (!stoneToDelete) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("stones")
      .delete()
      .eq("tenant_id", TENANT_ID)
      .eq("id", stoneToDelete.id);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Kayıt silinemedi: ${error.message}`);
      return;
    }

    setStones((current) =>
      current.filter((stone) => stone.id !== stoneToDelete.id)
    );
    setStoneToDelete(null);
  }

  useEffect(() => {
    loadStones();
  }, []);

  const filteredStones = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");

    if (!keyword) return stones;

    return stones.filter((stone) => {
      const text = [
        stone.stone_name,
        stone.short_description,
        stone.general_info,
        stone.source_note,
        stone.physical_effects,
        stone.spiritual_effects,
        stone.other_effects,
        stone.warning_text,
        stone.feng_shui,
        stone.meditation,
        stone.care,
        stone.application,
        ...(stone.chakras || []),
        ...(stone.warning_tags || []),
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return text.includes(keyword);
    });
  }, [stones, search]);

  const totalImages = stones.reduce(
    (total, stone) => total + (stone.images || []).length,
    0
  );

  const totalWarnings = stones.filter(
    (stone) =>
      (stone.warning_text && stone.warning_text.trim().length > 0) ||
      (stone.warning_tags || []).length > 0
  ).length;

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-950">
      <div className="mx-auto max-w-[1380px] px-5 py-4">
        <header className="mb-4 flex flex-col gap-3 rounded-[28px] bg-white/70 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.045)] ring-1 ring-white/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
              💎 DOĞALTAŞ KÜTÜPHANESİ
            </div>

            <h1 className="text-[26px] font-black leading-tight tracking-tight">
              Doğaltaş Listesi
            </h1>

            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              Kayıtları arayın, filtreleyin ve detay sayfasında okuyun.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:w-[430px]">
            <div className="rounded-2xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[18px] font-black">{stones.length}</div>
              <div className="text-[10px] font-bold text-slate-400">Kayıt</div>
            </div>

            <div className="rounded-2xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[18px] font-black">{totalImages}</div>
              <div className="text-[10px] font-bold text-slate-400">Görsel</div>
            </div>

            <div className="rounded-2xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[18px] font-black">{totalWarnings}</div>
              <div className="text-[10px] font-bold text-slate-400">Uyarı</div>
            </div>
          </div>
        </header>

        <section className="mb-4 rounded-[26px] bg-white/72 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.04)] ring-1 ring-white/80">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-[680px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] text-slate-400">
                ⌕
              </span>

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Taş adı, açıklama, çakra, etki veya uyarı ara..."
                className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white/90 pl-11 pr-4 text-[13px] font-semibold outline-none transition placeholder:text-slate-400 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-2xl px-4 py-2 text-[12px] font-black ring-1 transition ${
                  viewMode === "list"
                    ? "bg-slate-950 text-white ring-slate-950"
                    : "bg-white/85 text-slate-600 ring-slate-100 hover:bg-white"
                }`}
              >
                Liste
              </button>

              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`rounded-2xl px-4 py-2 text-[12px] font-black ring-1 transition ${
                  viewMode === "card"
                    ? "bg-slate-950 text-white ring-slate-950"
                    : "bg-white/85 text-slate-600 ring-slate-100 hover:bg-white"
                }`}
              >
                Kart
              </button>

              <button
                type="button"
                onClick={loadStones}
                className="rounded-2xl bg-white/85 px-4 py-2 text-[12px] font-black text-slate-700 ring-1 ring-slate-100 transition hover:bg-white"
              >
                Yenile
              </button>

              <Link
                href="/dogaltas/dogaltas-kayit"
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-[12px] font-black text-white shadow-[0_12px_25px_rgba(16,185,129,0.18)] transition hover:bg-emerald-700"
              >
                + Yeni Kayıt
              </Link>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold text-slate-400">
              {search.trim()
                ? `${filteredStones.length} sonuç bulundu`
                : `${filteredStones.length} kayıt gösteriliyor`}
            </p>

            {loading && (
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                Yükleniyor...
              </span>
            )}
          </div>
        </section>

        {errorMessage && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        )}

        <section className="rounded-[28px] bg-white/72 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.04)] ring-1 ring-white/80">
          {loading ? (
            <div className="flex h-[330px] items-center justify-center text-[14px] font-bold text-slate-400">
              Kayıtlar yükleniyor...
            </div>
          ) : filteredStones.length === 0 ? (
            <div className="flex h-[330px] flex-col items-center justify-center rounded-[24px] bg-white/70 text-center ring-1 ring-white">
              <div className="text-[54px]">💎</div>

              <h3 className="mt-3 text-[18px] font-black text-slate-900">
                Kayıt bulunamadı
              </h3>

              <p className="mt-2 max-w-[390px] text-[13px] leading-6 text-slate-500">
                Arama yaptıysanız farklı bir kelime deneyin. Henüz kayıt yoksa yeni doğaltaş kaydı oluşturun.
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-hidden rounded-[24px] bg-white/86 ring-1 ring-slate-100">
              <div className="grid grid-cols-[1.3fr_1.8fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                <div>Taş</div>
                <div>Açıklama</div>
                <div>Etiketler</div>
                <div>İçerik</div>
                <div>Tarih</div>
                <div className="text-right">İşlem</div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredStones.map((stone) => {
                  const imageCount = (stone.images || []).length;
                  const warningCount = (stone.warning_tags || []).length;
                  const sectionCount = countFilledSections(stone);
                  const coverImageUrl = (stone.images || []).find((image) => image.url)?.url;

                  return (
                    <div
                      key={stone.id}
                      className="grid grid-cols-[1.3fr_1.8fr_0.75fr_0.6fr_0.55fr_0.45fr] gap-3 px-4 py-3 transition hover:bg-cyan-50/45"
                    >
                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-2xl bg-cyan-50 ring-1 ring-cyan-100">
                          {coverImageUrl ? (
                            <img
                              src={coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[20px]">
                              💎
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-black text-slate-950">
                            {stone.stone_name || "İsimsiz taş"}
                          </div>

                          <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                            Detayı aç →
                          </div>
                        </div>
                      </Link>

                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="flex items-center text-[12px] font-medium leading-5 text-slate-500"
                      >
                        {safeText(stone.short_description)}
                      </Link>

                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="flex items-center"
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {(stone.chakras || []).slice(0, 2).map((chakra) => (
                            <span
                              key={chakra}
                              className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-black text-violet-700 ring-1 ring-violet-100"
                            >
                              {chakra}
                            </span>
                          ))}

                          {warningCount > 0 && (
                            <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-700 ring-1 ring-rose-100">
                              {warningCount} uyarı
                            </span>
                          )}

                          {(stone.chakras || []).length === 0 && warningCount === 0 && (
                            <span className="text-[11px] font-bold text-slate-300">
                              -
                            </span>
                          )}
                        </div>
                      </Link>

                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="flex items-center gap-1.5"
                      >
                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-100">
                          {sectionCount} bölüm
                        </span>

                        {imageCount > 0 && (
                          <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                            {imageCount} görsel
                          </span>
                        )}
                      </Link>

                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="flex items-center text-[11px] font-black text-slate-400"
                      >
                        {formatDate(stone.created_at)}
                      </Link>

                      <div className="flex flex-col items-end justify-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setStoneToDelete(stone);
                          }}
                          className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredStones.map((stone) => {
                const imageCount = (stone.images || []).length;
                const sectionCount = countFilledSections(stone);
                const coverImageUrl = (stone.images || []).find((image) => image.url)?.url;

                return (
                  <div
                    key={stone.id}
                    className="rounded-[24px] bg-white/86 p-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.035)] ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:bg-white hover:ring-cyan-200"
                  >
                    <Link
                      href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                      className="group block"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-cyan-50 ring-1 ring-cyan-100">
                          {coverImageUrl ? (
                            <img
                              src={coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[22px]">
                              💎
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="truncate text-[16px] font-black text-slate-950">
                              {stone.stone_name || "İsimsiz taş"}
                            </h3>

                            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-400 ring-1 ring-slate-100">
                              {formatDate(stone.created_at)}
                            </span>
                          </div>

                          <p className="mt-2 min-h-[42px] text-[12px] leading-5 text-slate-500">
                            {safeText(stone.short_description, 120)}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {(stone.chakras || []).slice(0, 3).map((chakra) => (
                              <span
                                key={chakra}
                                className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-black text-violet-700 ring-1 ring-violet-100"
                              >
                                {chakra}
                              </span>
                            ))}

                            {(stone.warning_tags || []).slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-700 ring-1 ring-rose-100"
                              >
                                {tag}
                              </span>
                            ))}

                            <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-600 ring-1 ring-slate-100">
                              {sectionCount} bölüm
                            </span>

                            {imageCount > 0 && (
                              <span className="rounded-full bg-cyan-50 px-2 py-1 text-[9px] font-black text-cyan-700 ring-1 ring-cyan-100">
                                {imageCount} görsel
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="text-[10px] font-black text-slate-400 transition hover:text-cyan-700"
                      >
                        Detay sayfasında oku →
                      </Link>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setStoneToDelete(stone);
                        }}
                        className="shrink-0 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {stoneToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-[28px] bg-white p-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
              ⚠️
            </div>

            <h2 className="mt-4 text-[22px] font-black text-slate-950">
              Taşı Sil
            </h2>

            <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
              <b>{stoneToDelete.stone_name || "İsimsiz taş"}</b> kaydını silmek istediğinizden emin misiniz?
            </p>

            <p className="mt-2 text-[12px] font-bold text-rose-600">
              Bu işlem geri alınamaz.
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setStoneToDelete(null)}
                disabled={deleteLoading}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={deleteStone}
                disabled={deleteLoading}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
