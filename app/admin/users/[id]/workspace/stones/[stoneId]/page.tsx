"use client";

import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gem, Loader2 } from "lucide-react";
import {
  isExpertModuleEnabled,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

const badgeChakra =
  "inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-800";

const badgeWarning =
  "inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800";

type StoneImage = {
  id: string;
  name: string;
  url?: string;
  file_path?: string;
};

type StoneRecord = {
  id: string;
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  general_info: string | null;
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
  images: StoneImage[] | null;
  created_at: string;
};

function ReadonlyTextSection({
  title,
  text,
}: {
  title: string;
  text: string | null | undefined;
}) {
  const value = text?.trim();
  return (
    <section className={`${panelClass} border-slate-200/80`}>
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <div className="mt-4 rounded-2xl border-2 border-slate-100 bg-slate-50/80 p-4">
        <p
          className={`whitespace-pre-wrap text-sm font-medium leading-relaxed ${
            value ? "text-slate-700" : "text-slate-400"
          }`}
        >
          {value || "Henüz bilgi girilmedi."}
        </p>
      </div>
    </section>
  );
}

export default function AdminWorkspaceStoneDetailPage() {
  useBfcacheRefresh();
  const params = useParams();
  const expertUserId = typeof params.id === "string" ? params.id : "";
  const stoneId = typeof params.stoneId === "string" ? params.stoneId : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [expert, setExpert] = useState<ManagedUser | null>(null);
  const [stone, setStone] = useState<StoneRecord | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(
    null,
  );

  const imagesWithUrl = useMemo(
    () => (stone?.images || []).filter((img) => img.url && String(img.url).trim()),
    [stone?.images],
  );

  const loadDetail = useCallback(async () => {
    if (!expertUserId || !stoneId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", expertUserId)
      .maybeSingle();

    if (userError || !userRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const expertRow = userRow as Record<string, unknown>;
    const mappedExpert = mapDbUser(expertRow);
    const tenantId =
      expertRow.tenant_id != null ? String(expertRow.tenant_id).trim() : "";

    setExpert(mappedExpert);

    if (!isExpertModuleEnabled(mappedExpert, "stones")) {
      setModuleDisabled(true);
      setStone(null);
      setNotFound(false);
      setLoading(false);
      return;
    }

    if (!tenantId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data: stoneRow, error: stoneError } = await supabase
      .from("stones")
      .select("*")
      .eq("id", stoneId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (stoneError || !stoneRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setStone(stoneRow as StoneRecord);
    setModuleDisabled(false);
    setNotFound(false);
    setLoading(false);
  }, [expertUserId, stoneId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadDetail();
  }, [sessionChecked, allowed, loadDetail]);

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <p className="text-xl font-black text-rose-950">Erişim reddedildi</p>
          <p className="mt-3 text-sm font-medium text-slate-600">
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className={pageContainerClass}>
        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : moduleDisabled ? (
          <section
            className={`${panelClass} border-rose-200/80 bg-gradient-to-r from-rose-50/95 via-orange-50/80 to-rose-50/90`}
          >
            <p className="text-base font-black text-rose-950">
              Bu modül kullanıcıda aktif değil.
            </p>
          </section>
        ) : notFound || !stone ? (
          <section className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Kayıt bulunamadı</p>
          </section>
        ) : (
          <div className="space-y-6">
            <header
              className={`${panelClass} border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/70`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-md">
                  <Gem className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-700">
                    Salt okunur izleme
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950">
                    {stone.stone_name || "Doğaltaş Detayı"}
                  </h1>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                    Bu ekran admin salt okunur görüntüleme alanıdır.
                  </p>
                  {expert ? (
                    <p className="mt-2 text-xs font-bold text-indigo-900">
                      Uzman: {expert.fullName} · {expert.email}
                    </p>
                  ) : null}
                  {stone.short_description?.trim() ? (
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {stone.short_description}
                    </p>
                  ) : null}
                </div>
              </div>
            </header>

            <ReadonlyTextSection title="Kısa Açıklama" text={stone.short_description} />
            <ReadonlyTextSection title="Genel Bilgi" text={stone.general_info} />
            <ReadonlyTextSection title="Fiziksel Etkiler" text={stone.physical_effects} />
            <ReadonlyTextSection title="Ruhsal Etkiler" text={stone.spiritual_effects} />
            <ReadonlyTextSection title="Diğer Etkiler" text={stone.other_effects} />

            <section className={`${panelClass} border-rose-200/80`}>
              <h2 className="text-lg font-black text-slate-950">Uyarılar</h2>
              {(stone.warning_tags || []).length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(stone.warning_tags || []).map((tag) => (
                    <span key={tag} className={badgeWarning}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 rounded-2xl border-2 border-rose-100 bg-rose-50/50 p-4">
                <p className="whitespace-pre-wrap text-sm font-medium text-slate-700">
                  {stone.warning_text?.trim() || "Uyarı metni girilmemiş."}
                </p>
              </div>
            </section>

            <ReadonlyTextSection title="Feng Shui" text={stone.feng_shui} />
            <ReadonlyTextSection title="Meditasyon" text={stone.meditation} />
            <ReadonlyTextSection title="Bakım" text={stone.care} />
            <ReadonlyTextSection title="Uygulama" text={stone.application} />

            <section className={`${panelClass} border-violet-200/80`}>
              <h2 className="text-lg font-black text-slate-950">Çakralar</h2>
              {(stone.chakras || []).length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(stone.chakras || []).map((chakra) => (
                    <span key={chakra} className={badgeChakra}>
                      {chakra}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm font-medium text-slate-500">
                  Çakra ataması yapılmamış.
                </p>
              )}
            </section>

            <section className={`${panelClass} border-cyan-200/80`}>
              <h2 className="text-lg font-black text-slate-950">Görseller</h2>
              {imagesWithUrl.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {imagesWithUrl.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() =>
                        setPreviewImage({ url: img.url!, name: img.name })
                      }
                      className="group overflow-hidden rounded-2xl border-2 border-cyan-100 bg-white text-left transition hover:border-cyan-300"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="aspect-square w-full object-cover transition group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                      <p className="truncate px-2 py-2 text-xs font-bold text-slate-700">
                        {img.name}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm font-medium text-slate-500">
                  Görsel önizlemesi bulunmuyor.
                </p>
              )}
            </section>
          </div>
        )}

        {previewImage ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Görsel önizleme"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-h-[80vh] w-full object-contain"
              />
              <p className="border-t border-slate-100 px-4 py-3 text-center text-sm font-bold text-slate-800">
                {previewImage.name}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
