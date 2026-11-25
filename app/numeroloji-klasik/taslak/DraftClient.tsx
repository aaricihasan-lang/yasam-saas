"use client";

// Kaydedilmemiş hesap sonucu: sonuç bu sekmenin sessionStorage'ından okunur (sunucu isteği YOK, kayıt YOK).
// Yenileme / geri-ileri: aynı sekmede taslak korunur. Yeni sekme / süre aşımı / depolama yok → güvenli boş durum
// ("Yeniden hesaplayın"); hiçbir kayıt otomatik oluşmaz.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { runInEffect } from "@/lib/runInEffect";
import { loadDraft, type StoredDraft } from "../_lib/draft";
import type { AnalysisView } from "../_lib/types";
import { Alert, Shell, Skeleton } from "../_ui/kit";
import { ResultView } from "../analiz/[id]/ResultClient";

export default function DraftClient() {
  const t = useTranslations("numerology.classic");
  const CRUMBS = [
    { href: "/numeroloji-merkezi", label: t("shared.crumbCentre") },
    { href: "/numeroloji-klasik", label: t("shared.crumbClassic") },
    { label: t("draft.crumbResult") },
  ];
  const [state, setState] = useState<{ loaded: boolean; draft: StoredDraft | null }>({ loaded: false, draft: null });
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("t");
    runInEffect(() => setState({ loaded: true, draft: loadDraft(key) }));
  }, []);

  if (!state.loaded) {
    return (
      <Shell crumbs={CRUMBS}>
        <div style={{ marginTop: 14 }}><Skeleton lines={2} label={t("draft.loading")} /></div>
      </Shell>
    );
  }
  const d = state.draft;
  if (!d) {
    return (
      <Shell crumbs={CRUMBS}>
        <div style={{ marginTop: 14 }} data-testid="draft-missing">
          <Alert tone="info" title={t("draft.missingTitle")} action={<Link className="nk-btn nk-sm" href="/numeroloji-klasik/yeni">{t("draft.newAnalysis")}</Link>}>
            {t("draft.missingBody")}
          </Alert>
        </div>
      </Shell>
    );
  }
  const a: AnalysisView = { ...d.view, id: "" };
  return <ResultView a={a} mode={{ type: "draft", draft: d }} />;
}
