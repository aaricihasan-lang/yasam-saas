"use client";

/**
 * Danışan detayı — NUMEROLOJİ sekmesi (owner kararı 24.10.2026).
 *
 * Danışanın TAM Numeroloji analizi, Numeroloji modülünün KENDİ tam analiz paneliyle
 * (NumerolojiKayitDetayPanel: Sonuç Özeti, Hesap Özetsiz/Özetli, Zamanlama & Gelişim, Taşlar, Görsel …)
 * sekmenin içinde gösterilir. Analiz sunucuda otomatik oluşturulur ve danışana bağlanır
 * (GET /api/clients/[id]/numerology-analysis: clients + numerology + tenant). Uzman hesapla / kaydet /
 * danışana bağla yapmaz. Tarayıcıda hesap YOKTUR; motor çıktısı sunucudaki kayıttan okunur.
 * Gelecek Yıllar: modülün bileşenleri aynı alt-yetki kuralıyla (useChronoView) sınırlar.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Hash } from "lucide-react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { DypSectionHead } from "@/app/_premium/danisan-yolculugu/DypUi";
import { NumerolojiKayitDetayPanel } from "@/app/numeroloji/components/NumerolojiKayitDetayPanel";
import { RowErrorBoundary } from "@/app/numeroloji/components/RowErrorBoundary";
import { resolveRecordMotor } from "@/app/numeroloji/utils/analysisJson";
import { NUMEROLOJI_METHODOLOGY_LABEL } from "@/lib/numeroloji/methodology";
import { formatDateTimeAbsolute } from "@/lib/i18n/format";

type Rec = { id: string; name: string; surname: string; birth_date: string; analysis_data: unknown; created_at: string | null };
type State =
  | { phase: "loading" }
  | { phase: "forbidden" | "missing_birth" | "missing_name" | "error" }
  | { phase: "ok"; record: Rec };

export default function NumerolojiTab({ clientId, inputsKey }: { clientId: string; inputsKey: string }) {
  const t = useTranslations("clients.detail.numerologyTab");
  const [state, setState] = useState<State>({ phase: "loading" });

  // inputsKey (ad|soyad|doğum) değişince yeniden okunur: Genel Bilgiler'de doğum tarihi girilince/değişince
  // sunucu güncel girdilerle analizi hazırlar (eski analiz değişmez).
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setState({ phase: "loading" });
      const token = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/numerology-analysis`, {
        headers: { "x-user-id": readYasamUser()?.id ?? "", ...(token ? { "x-session-token": token } : {}) },
        cache: "no-store",
        signal: ctrl.signal,
      }).catch(() => null);
      if (ctrl.signal.aborted) return;
      if (!res) { setState({ phase: "error" }); return; }
      if (res.status === 403) { setState({ phase: "forbidden" }); return; }
      const j = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; record?: Rec } | null;
      if (ctrl.signal.aborted) return;
      if (!res.ok || !j?.ok) { setState({ phase: "error" }); return; }
      if (j.status === "missing_birth" || j.status === "missing_name") { setState({ phase: j.status }); return; }
      if (j.status === "ok" && j.record) { setState({ phase: "ok", record: j.record }); return; }
      setState({ phase: "error" });
    })();
    return () => ctrl.abort();
  }, [clientId, inputsKey]);

  const head = (hint?: string, right?: React.ReactNode) => (
    <DypSectionHead icon={Hash} title={t("title")} hint={hint} right={right} />
  );

  if (state.phase === "loading") return <div data-numerology-tab="loading">{head()}<p className="py-8 text-center text-sm text-slate-500">{t("loading")}</p></div>;
  if (state.phase === "forbidden") return null;
  if (state.phase === "error") {
    return <div data-numerology-tab="error">{head()}<p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{t("error")}</p></div>;
  }
  if (state.phase === "missing_birth" || state.phase === "missing_name") {
    return (
      <div data-numerology-tab={state.phase}>
        {head()}
        <div className="rounded-2xl border border-violet-100 bg-white px-5 py-8 text-center">
          <p className="text-sm font-bold text-slate-700">{t(state.phase === "missing_birth" ? "missingBirth" : "missingName")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("missingHint")}</p>
        </div>
      </div>
    );
  }

  if (state.phase !== "ok") return null;
  const { record } = state;
  const { motor } = resolveRecordMotor(record);
  const hint = [
    t("autoNote"),
    record.created_at ? t("createdAt", { date: formatDateTimeAbsolute(record.created_at) }) : null,
    NUMEROLOJI_METHODOLOGY_LABEL,
  ].filter(Boolean).join(" · ");
  return (
    <div className="space-y-3" data-numerology-tab="ok" data-numerology-record={record.id}>
      {head(hint, (
        <Link href={`/numeroloji/liste/${record.id}`} className="text-xs font-bold text-violet-700 hover:underline">
          {t("openInModule")}
        </Link>
      ))}
      {motor ? (
        <RowErrorBoundary fallback={<p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{t("unreadable")}</p>}>
          <NumerolojiKayitDetayPanel
            out={motor}
            name={record.name}
            surname={record.surname}
            birthDate={record.birth_date}
            analysisData={record.analysis_data}
            recordId={record.id}
            onAnalysisDataUpdate={(analysis_data) => setState((prev) => (prev.phase === "ok" ? { phase: "ok", record: { ...prev.record, analysis_data } } : prev))}
          />
        </RowErrorBoundary>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{t("unreadable")}</p>
      )}
    </div>
  );
}
