"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { MEMBER_DETAIL_TABS, type MemberDetailTab } from "./memberDetailTabModel";
import css from "./MemberDetailV2.module.css";

/**
 * Üye Detayı V2 sekme çubuğu (Owner görsel PASS sürüm 5): beş sekmenin hepsi kendi pastel zemininde,
 * aktif sekme aynı ailenin belirgin tonu + ince kenarlık. WAI-ARIA tabs: ←/→, Home/End; seçili sekme
 * dar ekranda görünür alana kaydırılır. Paneller sayfada `uye-panel-<id>` kimliğiyle durur.
 */
export function MemberDetailTabs({
  active,
  onChange,
  marks,
}: {
  active: MemberDetailTab;
  onChange: (tab: MemberDetailTab) => void;
  /** Sekme yanında küçük işaret (ör. kaydedilmemiş değişiklik, açık karar). Yalnız görsel + erişilebilir etiket. */
  marks?: Partial<Record<MemberDetailTab, { label: string; kind: "dirty" | "count"; text?: string } | null>>;
}): ReactNode {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    const el = bar?.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`);
    if (!bar || !el) return;
    bar.scrollLeft = Math.max(0, el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2);
  }, [active]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = MEMBER_DETAIL_TABS.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % MEMBER_DETAIL_TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + MEMBER_DETAIL_TABS.length) % MEMBER_DETAIL_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = MEMBER_DETAIL_TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = MEMBER_DETAIL_TABS[next].id;
    onChange(id);
    barRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)?.focus();
  }

  return (
    <div ref={barRef} className={css.tabs} role="tablist" aria-label="Üye detayı sekmeleri" onKeyDown={onKeyDown}>
      {MEMBER_DETAIL_TABS.map((t) => {
        const selected = t.id === active;
        const mark = marks?.[t.id] ?? null;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`uye-tab-${t.id}`}
            data-tab={t.id}
            aria-selected={selected}
            aria-controls={`uye-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={css.tab}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {mark ? (
              mark.kind === "count" ? (
                <span className={css.tabCount} aria-label={mark.label} title={mark.label}>
                  {mark.text}
                </span>
              ) : (
                <span className={css.tabDot} aria-label={mark.label} title={mark.label} role="img" />
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
