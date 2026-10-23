import type { ReactNode } from "react";
import {
  Apple,
  BrainCircuit,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Coins,
  Droplet,
  FileText,
  Flower2,
  Gem,
  Leaf,
  NotebookPen,
  Phone,
  Sparkles,
  Sprout,
  Star,
  UsersRound,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import styles from "./dyp.module.css";

/**
 * Danışan Yolculuğu premium sunum yardımcıları — YALNIZ görünüm. Veri, durum, API veya iş kuralı içermez;
 * çağıran sayfanın mevcut öğelerini sarar. İkonlar ekran/navigasyon düzeyindedir (sekme, bölüm, alan
 * türü); kayıt içeriğine göre ikon/görsel ÜRETİLMEZ (owner kuralı, 2026-10-20).
 */

/** Sekme kimliği → navigasyon ikonu (lib/danisan/clientDetailTabs kimlikleri; bilinmeyen → ikon yok). */
export const DYP_TAB_ICONS: Record<string, LucideIcon> = {
  genel: CalendarDays,
  anamnez: Sprout,
  notlar: NotebookPen,
  seanslar: CalendarCheck2,
  odevler: ClipboardList,
  analizler: Flower2,
  humandesign: Waypoints,
  taslar: Gem,
  beslenme: Apple,
  hafiza: BrainCircuit,
  randevular: CalendarClock,
  yolculuk: Sparkles,
  ucretlendirme: Coins,
};

/** Kimlik kartı bilgi kutuları için alan türü ikonları (sabit; değere bağlı değil). */
export const DYP_INFO_ICONS = {
  phone: Phone,
  birthDate: CalendarDays,
  meetingDate: UsersRound,
  zodiac: Star,
  bloodType: Droplet,
  temperament: Leaf,
} as const;

export const DypWordIcon = FileText;

/** Çeviri etiketindeki baştaki süs karakterini (✦, 🧠, 📅 …) atar — ikon artık ayrı çiziliyor. */
export function stripLeadingGlyph(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || label;
}

/** Bölüm başlığı: renkli ikon karosu + başlık (+ isteğe bağlı alt metin ve sağ taraf). */
export function DypSectionHead({
  icon: Icon,
  title,
  hint,
  right,
  tone = "violet",
  as: Tag = "h2",
  flush = false,
}: {
  icon: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  tone?: "violet" | "pink" | "blue" | "emerald";
  as?: "h1" | "h2" | "h3";
  /** Alt çizgi/boşluk olmadan (başlık satırı başka öğelerle paylaşılıyorsa). */
  flush?: boolean;
}) {
  return (
    <div className={flush ? `${styles.secHead} ${styles.secHeadFlush}` : styles.secHead}>
      <span className={styles.secIcon} data-tone={tone} aria-hidden>
        <Icon strokeWidth={1.9} />
      </span>
      <div className={styles.secText}>
        <Tag className={styles.secTitle}>{title}</Tag>
        {hint ? <p className={styles.secHint}>{hint}</p> : null}
      </div>
      {right ? <div className={styles.secRight}>{right}</div> : null}
    </div>
  );
}

/** Form alanının soluna sabit alan-türü ikonu yerleştirir; çocuk input'a `dypIconPad` verilmelidir. */
export function DypInputIcon({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className={styles.inputIconWrap}>
      <Icon className={styles.inputIcon} strokeWidth={1.8} aria-hidden />
      {children}
    </div>
  );
}

export { styles as dyp };
