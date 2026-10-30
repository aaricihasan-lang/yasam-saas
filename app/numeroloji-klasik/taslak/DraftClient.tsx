"use client";

// Kaydedilmemiş hesap sonucu: sonuç bu sekmenin sessionStorage'ından okunur (sunucu isteği YOK, kayıt YOK).
// Yenileme / geri-ileri: aynı sekmede taslak korunur. Yeni sekme / süre aşımı / depolama yok → güvenli boş durum
// ("Yeniden hesaplayın"); hiçbir kayıt otomatik oluşmaz.

import Link from "next/link";
import { useEffect, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { loadDraft, type StoredDraft } from "../_lib/draft";
import type { AnalysisView } from "../_lib/types";
import { Alert, Shell, Skeleton } from "../_ui/kit";
import { ResultView } from "../analiz/[id]/ResultClient";

const CRUMBS = [
  { href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" },
  { href: "/numeroloji-klasik", label: "Klasik Numeroloji" },
  { label: "Analiz Sonucu" },
];

export default function DraftClient() {
  const [state, setState] = useState<{ loaded: boolean; draft: StoredDraft | null }>({ loaded: false, draft: null });
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("t");
    runInEffect(() => setState({ loaded: true, draft: loadDraft(key) }));
  }, []);

  if (!state.loaded) {
    return (
      <Shell crumbs={CRUMBS}>
        <div style={{ marginTop: 14 }}><Skeleton lines={2} label="Sonuç yükleniyor…" /></div>
      </Shell>
    );
  }
  const d = state.draft;
  if (!d) {
    return (
      <Shell crumbs={CRUMBS}>
        <div style={{ marginTop: 14 }} data-testid="draft-missing">
          <Alert tone="info" title="Kaydedilmemiş sonuç bulunamadı" action={<Link className="nk-btn nk-sm" href="/numeroloji-klasik/yeni">Yeni Analiz</Link>}>
            Kaydedilmemiş sonuçlar yalnız hesaplandıkları sekmede, sekme açık kaldıkça görüntülenir. Bilgileri girip yeniden hesaplayabilirsiniz; kaydettiğiniz analizler Kayıtlı Analizler’de durur.
          </Alert>
        </div>
      </Shell>
    );
  }
  const a: AnalysisView = { ...d.view, id: "" };
  return <ResultView a={a} mode={{ type: "draft", draft: d }} />;
}
