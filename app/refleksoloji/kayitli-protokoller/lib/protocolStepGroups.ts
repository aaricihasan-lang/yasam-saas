export type ProtocolStepGroupKey =
  | "preparation"
  | "leftRegion"
  | "rightRegion"
  | "warnings"
  | "extra";

export type ProtocolStepGroup = {
  key: ProtocolStepGroupKey;
  title: string;
  items: string[];
};

export type ProtocolGroupedView = {
  intro: string | null;
  groups: ProtocolStepGroup[];
};

const GROUP_ORDER: { key: ProtocolStepGroupKey; title: string }[] = [
  { key: "preparation", title: "Hazırlık" },
  { key: "leftRegion", title: "Sol Bölge Çalışması" },
  { key: "rightRegion", title: "Sağ Bölge Çalışması" },
  { key: "warnings", title: "Uyarılar / Dikkat Edilecekler" },
  { key: "extra", title: "Ek Notlar" },
];

const WARNING_KEYWORDS = ["yasak", "dikkat", "ateş", "titreme", "idrar kesilmiş"];
const LEFT_PATTERN = /sol\s+taraftan/i;
const RIGHT_PATTERN = /sağ\s+taraftan/i;

function normalizeCompareKey(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function isWarningLine(line: string): boolean {
  const norm = normalizeCompareKey(line);
  return WARNING_KEYWORDS.some((kw) => norm.includes(kw));
}

function pushUnique(
  bucket: string[],
  line: string,
  seen: Set<string>,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  const key = normalizeCompareKey(trimmed);
  if (seen.has(key)) return;
  seen.add(key);
  bucket.push(trimmed);
}

/** Satırları bağlama göre gruplar — sol/sağ bloklarında devam satırları korunur */
export function groupProtocolStepLines(
  lines: string[],
  seen?: Set<string>,
): ProtocolStepGroup[] {
  const compare = seen ?? new Set<string>();
  const buckets: Record<ProtocolStepGroupKey, string[]> = {
    preparation: [],
    leftRegion: [],
    rightRegion: [],
    warnings: [],
    extra: [],
  };

  let phase: "prep" | "left" | "right" = "prep";
  let afterWarnings = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isWarningLine(line)) {
      pushUnique(buckets.warnings, line, compare);
      afterWarnings = true;
      continue;
    }

    if (LEFT_PATTERN.test(line)) {
      pushUnique(buckets.leftRegion, line, compare);
      phase = "left";
      afterWarnings = false;
      continue;
    }

    if (RIGHT_PATTERN.test(line)) {
      pushUnique(buckets.rightRegion, line, compare);
      phase = "right";
      afterWarnings = false;
      continue;
    }

    if (afterWarnings) {
      pushUnique(buckets.extra, line, compare);
      continue;
    }

    if (phase === "left") {
      pushUnique(buckets.leftRegion, line, compare);
    } else if (phase === "right") {
      pushUnique(buckets.rightRegion, line, compare);
    } else {
      pushUnique(buckets.preparation, line, compare);
    }
  }

  return GROUP_ORDER.filter((meta) => buckets[meta.key].length > 0).map((meta) => ({
    key: meta.key,
    title: meta.title,
    items: buckets[meta.key],
  }));
}

export function flattenGroupedItems(groups: ProtocolStepGroup[]): string[] {
  return groups.flatMap((g) => g.items);
}

export function hasGroupedProtocolContent(view: ProtocolGroupedView | null): boolean {
  if (!view) return false;
  if (view.intro?.trim()) return true;
  return view.groups.some((g) => g.items.length > 0);
}
