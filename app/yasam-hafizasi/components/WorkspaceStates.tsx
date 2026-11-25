import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/** BF-13 — Yaşam Hafızası liste iskeleti (layout-shift önleyici). */
export function ResultsSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm">
          <div className="mb-2 h-4 w-24 rounded-full bg-slate-200/80" />
          <div className="mb-2 h-5 w-2/3 rounded bg-slate-200/80" />
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="mt-1 h-4 w-5/6 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export type EmptyVariant =
  | "cold-start"
  | "client-cold-start"
  | "no-results"
  | "filtered"
  | "disabled"
  | "index-empty"
  | "index-ready-empty"
  | "out-of-scope"
  | "error";

// I18N: başlık/mesaj memory.workspace.states.<key>.{title,msg} sözlüğünden (TR metinleri birebir taşındı).
//   cold-start         → mesleki bilgi havuzu soğuk başlangıcı
//   client-cold-start  → Danışan Hafızası (client-scoped) soğuk başlangıç — mesleki havuz copy'sinden AYRI
//   index-empty        → Health: tenant indeksinde henüz kayıt yok (dürüst durum; "hazır" iddiası yok)
//   index-ready-empty  → Health: indeks hazır, aktarım bekleyen kayıt YOK (Final-A1; "hazırlanıyor" iddiası yok)
//   out-of-scope       → Health: sentetik (ADMIN_LIBRARY) tenant — bilinçli olarak mesleki indeks dışında. Hata DEĞİL.
const VARIANT: Record<
  EmptyVariant,
  {
    icon: string;
    key: "coldStart" | "clientColdStart" | "noResults" | "filtered" | "indexEmpty" | "indexReadyEmpty" | "outOfScope" | "disabled" | "error";
  }
> = {
  "cold-start": { icon: "🔎", key: "coldStart" },
  "client-cold-start": { icon: "🔎", key: "clientColdStart" },
  "no-results": { icon: "🗂️", key: "noResults" },
  filtered: { icon: "🧭", key: "filtered" },
  "index-empty": { icon: "⏳", key: "indexEmpty" },
  "index-ready-empty": { icon: "🧠", key: "indexReadyEmpty" },
  "out-of-scope": { icon: "ℹ️", key: "outOfScope" },
  disabled: { icon: "🔒", key: "disabled" },
  error: { icon: "⚠️", key: "error" },
};

/** BF-13 — durum kartı (ilk açılış / boş / filtreli boş / kapalı / hata). */
export function WorkspaceEmpty({
  variant,
  action,
}: {
  variant: EmptyVariant;
  action?: ReactNode;
}) {
  const t = useTranslations("memory.workspace.states");
  const v = VARIANT[variant];
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/80 p-8 text-center shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-emerald-100 text-2xl">
        <span aria-hidden>{v.icon}</span>
      </div>
      <h2 className="text-lg font-black text-slate-800">{t(`${v.key}.title`)}</h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-600">{t(`${v.key}.msg`)}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
