"use client";
/**
 * Beslenme Şablon Kütüphanesi (FAZ 6). Öğün/Gün şablonlarını listeler; yeniden adlandır,
 * çoğalt, sil (onaylı; arşiv yok). Şablonu plana UYGULAMA plan editöründen yapılır
 * (hedef gün gerektiği için). Owner-only.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePlanFormat } from "../planlar/_components/usePlanFormat";
import { CopyPlus, LayoutTemplate, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import {
  listTemplates,
  renameTemplate,
  duplicateTemplate,
  deleteTemplate,
  type TemplateListRow,
} from "@/lib/beslenme/faz6Client";
import { type TemplateType } from "@/lib/beslenme/templateContracts";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeModuleGuard,
} from "../_components/BeslenmeShell";
import {
  Card,
  DangerButton,
  EmptyState,
  GhostButton,
  InlineSpinner,
  PrimaryButton,
  StatusMessage,
  TextInput,
} from "../_components/primitives";
import { runInEffect } from "@/lib/runInEffect";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";

// Sekme değerleri kanonik (template_type); etiket ekran dilinde.
const TABS: Array<{ value: TemplateType; labelKey: "tabMeal" | "tabDay" }> = [
  { value: "meal", labelKey: "tabMeal" },
  { value: "day", labelKey: "tabDay" },
];

export default function SablonlarPage() {
  const guard = useBeslenmeModuleGuard();
  const [tab, setTab] = useState<TemplateType>("meal");
  const [rows, setRows] = useState<TemplateListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  // Silme onayı ortak dialog'dan (aynı noktada iki adımlı buton → çift tıkta istemeden silme riski vardı).
  const deleteConfirm = useDeleteConfirm();
  const tb = useTranslations("beslenme.templates");
  const pf = usePlanFormat();

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const r = await listTemplates(tab);
    if (r.ok && r.data) setRows(r.data.templates);
    else setErr(tb("loadFailed"));
    setLoading(false);
  }, [tab, tb]);

  useEffect(() => {
    if (guard === "ok") runInEffect(() => void load());
  }, [guard, load]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  const doRename = async (id: string) => {
    const title = renameVal.trim();
    if (!title) return;
    setBusyId(id);
    setActionErr("");
    const r = await renameTemplate(id, { title });
    setBusyId(null);
    if (r.ok) {
      setRenameId(null);
      void load();
    } else setActionErr(tb("renameFailed"));
  };

  const doDuplicate = async (id: string) => {
    setBusyId(id);
    setActionErr("");
    const r = await duplicateTemplate(id);
    setBusyId(null);
    if (r.ok) void load();
    else setActionErr(tb("duplicateFailed"));
  };

  const doDelete = async (tpl: TemplateListRow) => {
    if (busyId) return;
    const ok = await deleteConfirm({
      title: tb("deleteTitle"),
      message: tb("deleteMessage"),
      names: [tpl.title],
    });
    if (!ok) return;
    setBusyId(tpl.id);
    setActionErr("");
    try {
      const r = await deleteTemplate(tpl.id);
      if (r.ok) void load();
      else setActionErr(tb("deleteFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BeslenmeShell
      title={tb("title")}
      subtitle={tb("subtitle")}
      icon={<LayoutTemplate />}
      backHref="/beslenme"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-black transition ${
              tab === t.value
                ? "bg-emerald-600 text-white"
                : "bg-white/70 text-slate-500 hover:bg-white"
            }`}
          >
            {tb(t.labelKey)}
          </button>
        ))}
      </div>

      {actionErr ? (
        <div className="mb-3">
          <StatusMessage type="error">{actionErr}</StatusMessage>
        </div>
      ) : null}

      {loading ? (
        <InlineSpinner />
      ) : err ? (
        <StatusMessage type="error">{err}</StatusMessage>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-8 w-8" />}
          title={tab === "meal" ? tb("emptyMeal") : tb("emptyDay")}
          description={tb("emptyDesc")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((tpl) => (
            <Card key={tpl.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {renameId === tpl.id ? (
                    <div className="flex items-center gap-2">
                      <TextInput
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        placeholder={tb("namePlaceholder")}
                        autoFocus
                      />
                      <PrimaryButton
                        loading={busyId === tpl.id}
                        onClick={() => void doRename(tpl.id)}
                      >
                        {tb("save")}
                      </PrimaryButton>
                      <GhostButton onClick={() => setRenameId(null)}>{tb("cancel")}</GhostButton>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-[15px] font-black text-slate-800">{tpl.title}</p>
                      <p className="mt-0.5 text-[12px] font-bold text-emerald-600">
                        {pf.templateType(tpl.template_type)}
                      </p>
                      {tpl.note ? (
                        <p className="mt-1 line-clamp-2 text-[12px] font-medium text-slate-400">{tpl.note}</p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {renameId !== tpl.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <GhostButton
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => {
                      setRenameId(tpl.id);
                      setRenameVal(tpl.title);
                    }}
                  >
                    {tb("rename")}
                  </GhostButton>
                  <GhostButton
                    icon={<CopyPlus className="h-4 w-4" />}
                    loading={busyId === tpl.id}
                    onClick={() => void doDuplicate(tpl.id)}
                  >
                    {tb("duplicate")}
                  </GhostButton>
                  <DangerButton
                    icon={<Trash2 className="h-4 w-4" />}
                    loading={busyId === tpl.id}
                    onClick={() => void doDelete(tpl)}
                  >
                    {tb("delete")}
                  </DangerButton>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </BeslenmeShell>
  );
}
