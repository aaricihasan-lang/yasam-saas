"use client";

/**
 * Kayıtlı analizin Danışan Yolculuğu danışanıyla bağlantı DURUMU (salt-okunur).
 *
 * Owner kararı (2026-10-24): Numeroloji yetkili uzman danışanı kaydettiğinde danışanın TAM analizi
 * otomatik oluşturulup danışana bağlanır (lib/danisan/numerologyAuto) ve danışan detayındaki
 * "Numeroloji" sekmesinde gösterilir. Elle "Danışana Bağla" / "Bağlantıyı kaldır" düğmeleri bu nedenle
 * kaldırıldı. Mevcut bağlar, kayıtlar ve /api/numeroloji/analyses/[id]/client-link uçları KORUNUR
 * (Word raporu ve eski kayıtlar için); bu bileşen yalnız durumu okur.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { authHeaders } from "../helpers/numApiClient";
import { runInEffect } from "@/lib/runInEffect";

type ClientOpt = { id: string; ad: string; soyad: string; dogum: string | null };
type LinkState = { clientId: string; client: ClientOpt | null } | null;

const fullName = (c: ClientOpt) => `${c.ad} ${c.soyad}`.replace(/\s+/g, " ").trim() || "—";

export function NumerolojiDanisanBagi({ recordId }: { recordId: string }) {
  const base = `/api/numeroloji/analyses/${recordId}/client-link`;
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [link, setLink] = useState<LinkState>(null);
  const t = useTranslations("numerology.app.clientLink");
  // Hata durumu dil-bağımsız anahtar olarak tutulur; metin çizimde ekran dilinde üretilir.
  const [msg, setMsg] = useState<"readFailed" | "network" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { headers: authHeaders(), cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: LinkState };
      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok || !j.ok) { setMsg("readFailed"); return; }
      setLink(j.link ?? null);
    } catch {
      setMsg("network");
    } finally {
      setLoaded(true);
    }
  }, [base]);

  useEffect(() => { runInEffect(() => { void load(); }); }, [load]);

  if (!loaded || unavailable) return null;

  return (
    <section aria-label={t("aria")} className="rounded-xl border border-violet-200/70 bg-white/80 px-3 py-2.5 text-xs text-slate-700 md:px-4">
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-violet-800">{t("linkedLabel")}</span>
          {link.client ? (
            <Link href={`/dashboard/clients/${link.clientId}?tab=numeroloji`} className="font-bold text-slate-900 underline decoration-violet-300 underline-offset-2">
              {fullName(link.client)}
            </Link>
          ) : (
            <span className="font-semibold text-slate-600">{t("linkedUnknown")}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-600">{t("notLinked")}</span>
          <span className="text-slate-500">{t("autoNote")}</span>
        </div>
      )}
      {msg ? <p role="alert" className="mt-1.5 font-semibold text-rose-700">{t(msg)}</p> : null}
    </section>
  );
}
