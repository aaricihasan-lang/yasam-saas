"use client";

/**
 * Danışan Yolculuğu — premium klasör kartı. Kartın tamamı gerçek bağlantıdır (href sayfadan gelir, değişmedi).
 * Fareyle hafif 3D eğim + obje derinliği (rAF; kare başına en çok bir güncelleme). Dokunmatikte ve "hareketi azalt"
 * açıkken eğim yok.
 */
import Link from "next/link";
import { useRef, type CSSProperties } from "react";
import { DY_OBJECTS, DyIcon } from "./DyArt";
import styles from "./dy.module.css";

const TILT_X = 3.5 * 0.6;
const TILT_Y = 4.5 * 0.6;
const TILT_PROPS = ["--rx", "--ry", "--px", "--py"];

export type DyFolderKey = keyof typeof DY_OBJECTS;

export function DyFolderCard({
  folderKey,
  index,
  accent,
  href,
  title,
  desc,
  cta,
}: {
  folderKey: DyFolderKey;
  index: number;
  accent: "emerald" | "violet" | "cyan";
  href: string;
  title: string;
  desc: string;
  cta: string;
}) {
  const frame = useRef<number | null>(null);
  const { Svg, w, h } = DY_OBJECTS[folderKey];

  function onPointerMove(e: React.PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = Math.min(Math.max((clientX - r.left) / r.width - 0.5, -0.5), 0.5);
      const py = Math.min(Math.max((clientY - r.top) / r.height - 0.5, -0.5), 0.5);
      el.dataset.tilting = "true";
      el.style.setProperty("--rx", `${(-py * 2 * TILT_X).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 2 * TILT_Y).toFixed(2)}deg`);
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
    });
  }

  function onPointerLeave(e: React.PointerEvent<HTMLAnchorElement>) {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const el = e.currentTarget;
    delete el.dataset.tilting;
    for (const p of TILT_PROPS) el.style.removeProperty(p);
  }

  return (
    <Link
      href={href}
      className={styles.folder}
      data-accent={accent}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span className={styles.art} aria-hidden>
        <span className={styles.part} style={{ left: 30, top: 98, width: 90, height: 14, "--d": 2 } as CSSProperties}>
          <span className={styles.objShadow} />
        </span>
        <span
          className={styles.part}
          style={{ left: (150 - w) / 2, top: 108 - h - 6, width: w, height: h, "--d": 5 } as CSSProperties}
        >
          <span className={styles.bob} style={{ "--delay": `${-index * 3}s` } as CSSProperties}>
            <Svg />
          </span>
        </span>
      </span>
      <span className={styles.folderBody}>
        <h3 className={styles.folderTitle}>{title}</h3>
        <p className={styles.folderDesc}>{desc}</p>
        <span className={styles.cta}>
          <span>{cta}</span>
          <DyIcon name="arrow" size={17} stroke={2.2} />
        </span>
      </span>
    </Link>
  );
}
