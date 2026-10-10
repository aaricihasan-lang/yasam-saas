"use client";

// Refleksoloji Danışan Haritası — Danışan Yolculuğu sekmesi (HumanDesignTab deseni).
// Yalnız özet + "Haritayı Aç": harita burada ÇİZİLMEZ, Refleksoloji'de bu danışan seçili açılır
// (?client=<id> → tekrar danışan seçtirmez). Veri kopyalanmaz; sunucu danışanın tenant'a ait
// olduğunu doğrular (yabancı client_id → 404). Sekme yalnız reflexology izniyle görünür.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MarksApiError, listSessions } from "@/lib/refleksoloji/marksClient";
import type { MarkSession } from "@/lib/refleksoloji/markSurfaces";

const RECENT_LIMIT = 10;

type State =
  | { phase: "loading" }
  | { phase: "error"; notReady: boolean }
  | { phase: "ready"; sessions: MarkSession[] };

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/**
 * Sekme tıklaması URL'ye yazılmaz; haritaya geçmeden ÖNCE mevcut geçmiş girdisine `?tab=refleksoloji`
 * eklenir → tarayıcı GERİ tuşu danışan detayında bu sekmeye döner.
 */
function rememberTab(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === "refleksoloji") return;
    url.searchParams.set("tab", "refleksoloji");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* geçmiş güncellenemezse yalnız geri dönüş sekmesi Genel olur */
  }
}

export default function ReflexologyTab({ clientId }: { clientId: string }) {
  const t = useTranslations("clients.detail.rf");
  const [state, setState] = useState<State>({ phase: "loading" });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    listSessions(clientId).then(
      (r) => {
        if (alive) setState({ phase: "ready", sessions: r.sessions });
      },
      (e: unknown) => {
        if (alive) setState({ phase: "error", notReady: e instanceof MarksApiError && e.code === "MARKS_NOT_READY" });
      },
    );
    return () => {
      alive = false;
    };
  }, [clientId]);

  const base = `/refleksoloji/danisan-haritasi?client=${encodeURIComponent(clientId)}`;

  if (state.phase === "loading") return <p className="py-8 text-center text-sm text-slate-500">{t("loading")}</p>;
  if (state.phase === "error") {
    return (
      <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
        {state.notReady ? t("notReady") : t("error")}
      </p>
    );
  }

  const { sessions } = state;
  const visible = showAll ? sessions : sessions.slice(0, RECENT_LIMIT);

  return (
    <section className="flex flex-col gap-3" data-rf-journey>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-900">{t("title")}</h3>
          <p className="text-xs font-medium text-slate-600">{t("subtitle")}</p>
        </div>
        <Link
          href={base}
          onClick={rememberTab}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-violet-700 px-4 text-sm font-bold text-white no-underline hover:bg-violet-800"
        >
          {t("newSession")}
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-violet-100 bg-white px-5 py-8 text-center text-sm font-bold text-slate-700" data-rf-journey-empty>
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-violet-50 overflow-hidden rounded-2xl border border-violet-100 bg-white">
          {visible.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">
                  {formatDate(s.session_date)}
                  {s.title ? <span className="font-semibold text-slate-700"> — {s.title}</span> : null}
                </p>
                <p className="text-xs font-medium text-slate-600">{t("points", { count: s.mark_count })}</p>
              </div>
              <Link
                href={`${base}&session=${encodeURIComponent(s.id)}`}
                onClick={rememberTab}
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border border-violet-200 bg-white px-3 text-xs font-bold text-violet-900 no-underline hover:border-violet-400"
              >
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!showAll && sessions.length > RECENT_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-start text-sm font-bold text-violet-800 underline"
        >
          {t("showAll", { count: sessions.length })}
        </button>
      ) : null}
    </section>
  );
}
