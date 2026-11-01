"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — ana sayfa üst araç satırı ögeleri: görünüm modu seçici + "Çalışma Alanımı Düzenle".
 * HomeShell `tools` içine (dil seçicinin önüne) konur. Görünüm modu tasarımdan bağımsız bir tercihtir (UiPrefs.viewMode).
 * Demo hesapta (readOnly) düzenleme düğmesi yerine kapalı olduğunu söyleyen pasif ipucu gösterilir.
 */
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Moon, MonitorSmartphone, Sparkles, Sun, Target, type LucideIcon } from "lucide-react";
import { VIEW_MODES, type ViewMode } from "@/lib/workspace/catalog";
import { resolveViewMode } from "@/lib/workspace/viewMode";
import type { PersonalWorkspace } from "./usePersonalWorkspace";
import { usePwText } from "./i18n";
import { usePrefersDark } from "./personalRoot";
import premium from "../home.module.css";
import styles from "./personal.module.css";

const ICON: Record<ViewMode, LucideIcon> = { auto: MonitorSmartphone, day: Sun, night: Moon, reading: BookOpen, focus: Target };

export function ViewModeSwitcher({ pw }: { pw: Pick<PersonalWorkspace, "prefs" | "updatePrefs" | "readOnly"> }) {
  const tx = usePwText();
  const prefersDark = usePrefersDark();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const choice = pw.prefs.viewMode;
  const Icon = ICON[choice];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (v: ViewMode) => {
    setOpen(false);
    if (v !== choice) void pw.updatePrefs((p) => ({ ...p, viewMode: v }));
  };
  const nowLabel = tx(resolveViewMode("auto", prefersDark) === "night" ? "view_night" : "view_day");

  return (
    <span className={styles.viewWrap} ref={wrap}>
      <button
        type="button"
        className={`${premium.toolBtn} ${styles.toolPill}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${tx("viewMode")}: ${tx(`view_${choice}`)}`}
        title={pw.readOnly ? tx("editDisabledDemo") : tx("viewMode")}
        onClick={() => setOpen((o) => !o)}
        data-testid="home-view-mode"
        disabled={pw.readOnly}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
        <span className={premium.toolBtnLabel}>{tx(`view_${choice}`)}</span>
      </button>
      {open ? (
        <div id={menuId} className={styles.viewMenu} role="menu" aria-label={tx("viewMode")}>
          {VIEW_MODES.map((v) => {
            const I = ICON[v];
            const on = v === choice;
            return (
              <button key={v} type="button" role="menuitemradio" aria-checked={on} className={on ? styles.viewOn : undefined} onClick={() => pick(v)}>
                <I className="h-[17px] w-[17px] shrink-0" strokeWidth={1.9} aria-hidden />
                <span>
                  <b>{tx(`view_${v}`)}</b>
                  <small>{v === "auto" ? `${tx("viewDesc_auto")} · ${tx("autoNow")} ${nowLabel}` : tx(`viewDesc_${v}`)}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </span>
  );
}

export function EditWorkspaceButton({ pw, onEdit }: { pw: Pick<PersonalWorkspace, "readOnly" | "editing">; onEdit: () => void }) {
  const tx = usePwText();
  if (pw.editing) return null;
  if (pw.readOnly) {
    return (
      <span className={`${premium.toolBtn} ${styles.toolPill} ${styles.editDisabled}`} role="note" title={tx("editDisabledDemo")} data-testid="home-edit-workspace-disabled">
        <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
        <span className={premium.toolBtnLabel}>{tx("editDisabledDemo")}</span>
      </span>
    );
  }
  return (
    <button type="button" className={`${premium.toolBtn} ${styles.toolPill} ${styles.editBtn}`} onClick={onEdit} aria-label={tx("editWorkspace")} data-testid="home-edit-workspace">
      <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
      <span className={premium.toolBtnLabel}>{tx("editWorkspace")}</span>
    </button>
  );
}

/**
 * Araç satırı ögeleri. Kullanım (page.tsx, HomeShell tools fragment'i içinde, kişiselleştirme açıkken):
 *   <PersonalToolbar pw={pw} onEdit={pw.startEdit} />
 */
export default function PersonalToolbar({ pw, onEdit }: { pw: Pick<PersonalWorkspace, "prefs" | "updatePrefs" | "readOnly" | "editing">; onEdit: () => void }) {
  return (
    <>
      <ViewModeSwitcher pw={pw} />
      <EditWorkspaceButton pw={pw} onEdit={onEdit} />
    </>
  );
}
