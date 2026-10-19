import { Brain, Feather, Flower2, Heart, Layers, Moon, Sparkles, Sun, type LucideIcon } from "lucide-react";
import styles from "@/app/_premium/biyoenerji/enerjiBedenleri.module.css";

/**
 * Enerji Bedenleri premium görünümü — kayıt adına göre YALNIZ dekoratif ikon + ton.
 * Kayıt adı/anlamı değişmez; eşleşme yoksa nötr katman ikonu kullanılır.
 */
export type EnergyBodyVisual = { Icon: LucideIcon; tone: string };

const RULES: { match: RegExp; Icon: LucideIcon; tone: string }[] = [
  { match: /duygu/, Icon: Heart, tone: styles.toneRose },
  { match: /eteri|fizik/, Icon: Sun, tone: styles.toneAmber },
  { match: /ruh|spirit/, Icon: Flower2, tone: styles.toneViolet },
  { match: /astral/, Icon: Moon, tone: styles.toneBlue },
  { match: /zihin|mental/, Icon: Brain, tone: styles.toneIndigo },
  { match: /aura/, Icon: Sparkles, tone: styles.toneTeal },
  { match: /kozmik|kutsal|ilah|nedensel|keter/, Icon: Feather, tone: styles.toneIndigo },
];

const FALLBACK: EnergyBodyVisual = { Icon: Layers, tone: styles.toneViolet };

export function energyBodyVisual(name: string | null | undefined): EnergyBodyVisual {
  const key = (name ?? "").toLocaleLowerCase("tr-TR");
  for (const rule of RULES) {
    if (rule.match.test(key)) return { Icon: rule.Icon, tone: rule.tone };
  }
  return FALLBACK;
}
