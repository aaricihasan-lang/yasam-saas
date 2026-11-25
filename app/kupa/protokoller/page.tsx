"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { KupaShell, kupaBtnPrimary, kupaInput } from "@/app/kupa/components/KupaShell";
import { deleteProtocol, type CuppingProtocol } from "@/app/kupa/lib/api";
import { useProtocolList } from "./hooks/useProtocolList";
import { ProtocolListCard } from "./components/ProtocolListCard";
import { protocolMatchesQuery } from "@/app/kupa/lib/protocolSearch";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";

export default function ProtokollerPage() {
  const { protocols, loading, error, refresh } = useProtocolList();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("cupping.protocols.list");
  const errText = useKupaErrorText();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "passive">("all");

  const categories = useMemo(
    () => Array.from(new Set(protocols.map((p) => p.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "tr")),
    [protocols],
  );

  // Arama: başlık + kategori + etiketler (Türkçe katlamalı; saf eşleşme: lib/protocolSearch).
  const filtered = useMemo(() => {
    return protocols.filter((p) => {
      if (category && p.category !== category) return false;
      if (status === "active" && p.is_active === false) return false;
      if (status === "passive" && p.is_active !== false) return false;
      return protocolMatchesQuery(p, q);
    });
  }, [protocols, q, category, status]);

  async function handleDelete(p: CuppingProtocol) {
    const ok = await confirm({
      title: t("delete.title"),
      message: t("delete.message", { title: p.title }),
      confirmText: t("delete.confirm"),
      cancelText: t("delete.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteProtocol(p.id);
      await refresh(); // server sonrası state
      showToast({ message: t("delete.done"), type: "success" });
    } catch (e) {
      showToast({ message: errText(e, t("delete.failed")), type: "error" });
    }
  }

  const hasAny = protocols.length > 0;

  return (
    <KupaShell
      title={t("title")}
      subtitle={t("subtitle")}
      breadcrumb={[{ label: t("crumb") }]}
      fullBleedBelowLg
      actions={
        <Link href="/kupa/protokoller/yeni" className={`${kupaBtnPrimary} no-underline`}>
          {t("new")}
        </Link>
      }
    >
      {hasAny ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-4 sm:px-0">
          <input className={`${kupaInput} max-w-xs`} placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("searchAria")} />
          {categories.length > 0 ? (
            <select className={`${kupaInput} max-w-[12rem]`} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("categoryAria")}>
              <option value="">{t("allCategories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : null}
          <select className={`${kupaInput} max-w-[10rem]`} value={status} onChange={(e) => setStatus(e.target.value as "all" | "active" | "passive")} aria-label={t("statusAria")}>
            <option value="all">{t("statusAll")}</option>
            <option value="active">{t("statusActive")}</option>
            <option value="passive">{t("statusPassive")}</option>
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
            {t("retry")}
          </button>
        </div>
      ) : !hasAny ? (
        <div className="mx-4 rounded-2xl border border-dashed border-amber-200 bg-white/70 px-6 py-12 text-center sm:mx-0">
          <p className="text-base font-bold text-slate-700">{t("empty.title")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t("empty.body")}</p>
          <Link href="/kupa/protokoller/yeni" className={`mt-4 inline-flex no-underline ${kupaBtnPrimary}`}>
            {t("empty.cta")}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 sm:px-0">{t("noMatch")}</p>
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
