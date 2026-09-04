"use client";
/**
 * Beslenme Şablon Kütüphanesi (FAZ 6). Öğün/Gün şablonlarını listeler; yeniden adlandır,
 * çoğalt, arşivle/sil, içerik incele. Şablonu plana UYGULAMA plan editöründen yapılır
 * (hedef gün gerektiği için). Owner-only.
 */
import { useCallback, useEffect, useState } from "react";
import { CopyPlus, LayoutTemplate, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import {
  listTemplates,
  renameTemplate,
  duplicateTemplate,
  deleteTemplate,
  type TemplateListRow,
} from "@/lib/beslenme/faz6Client";
import { TEMPLATE_TYPE_LABELS, type TemplateType } from "@/lib/beslenme/templateContracts";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeOwnerGuard,
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

const TABS: Array<{ value: TemplateType; label: string }> = [
  { value: "meal", label: "Öğün Şablonları" },
  { value: "day", label: "Gün Şablonları" },
];

export default function SablonlarPage() {
  const guard = useBeslenmeOwnerGuard();
  const [tab, setTab] = useState<TemplateType>("meal");
  const [rows, setRows] = useState<TemplateListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const r = await listTemplates(tab);
    if (r.ok && r.data) setRows(r.data.templates);
    else setErr("Şablonlar yüklenemedi.");
    setLoading(false);
  }, [tab]);

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
    } else setActionErr("Yeniden adlandırma başarısız.");
  };

  const doDuplicate = async (id: string) => {
    setBusyId(id);
    setActionErr("");
    const r = await duplicateTemplate(id);
    setBusyId(null);
    if (r.ok) void load();
    else setActionErr("Çoğaltma başarısız.");
  };

  const doDelete = async (id: string) => {
    setBusyId(id);
    setActionErr("");
    const r = await deleteTemplate(id);
    setBusyId(null);
    setConfirmDeleteId(null);
    if (r.ok) void load();
    else setActionErr("Silme başarısız.");
  };

  return (
    <BeslenmeShell
      eyebrow="Beslenme & Metabolik Yaşam"
      title="Şablonlar"
      subtitle="Sık kullandığınız öğünleri ve günleri şablon olarak saklayın; planlara hızlıca uygulayın."
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
            {t.label}
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
          title={tab === "meal" ? "Henüz öğün şablonu yok" : "Henüz gün şablonu yok"}
          description="Bir plan öğününü veya gününü şablon olarak kaydederek başlayın. (Plan editöründe “Şablon Olarak Kaydet”.)"
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
                        placeholder="Şablon adı"
                        autoFocus
                      />
                      <PrimaryButton
                        loading={busyId === tpl.id}
                        onClick={() => void doRename(tpl.id)}
                      >
                        Kaydet
                      </PrimaryButton>
                      <GhostButton onClick={() => setRenameId(null)}>Vazgeç</GhostButton>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-[15px] font-black text-slate-800">{tpl.title}</p>
                      <p className="mt-0.5 text-[12px] font-bold text-emerald-600">
                        {TEMPLATE_TYPE_LABELS[tpl.template_type]}
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
                    Adı Değiştir
                  </GhostButton>
                  <GhostButton
                    icon={<CopyPlus className="h-4 w-4" />}
                    loading={busyId === tpl.id}
                    onClick={() => void doDuplicate(tpl.id)}
                  >
                    Çoğalt
                  </GhostButton>
                  {confirmDeleteId === tpl.id ? (
                    <DangerButton loading={busyId === tpl.id} onClick={() => void doDelete(tpl.id)}>
                      Silmeyi Onayla
                    </DangerButton>
                  ) : (
                    <DangerButton
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setConfirmDeleteId(tpl.id)}
                    >
                      Sil
                    </DangerButton>
                  )}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </BeslenmeShell>
  );
}
