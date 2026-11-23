/**
 * E2E için beklenen şablon listesi — DOĞRUDAN production TOPIC_GROUPS'tan (elle yazılmaz).
 * Çıktı: [{ label, parent }] (parent: grup etiketi | null), production sırasıyla.
 */
import { TOPIC_GROUPS } from "@/lib/sifa-rehberi/topicTree";

const out: { label: string; parent: string | null }[] = [];
for (const g of TOPIC_GROUPS) {
  if (g.kind === "rahatsizlik") continue;
  if (g.topics.length === 1) {
    out.push({ label: g.topics[0].label, parent: null });
    continue;
  }
  out.push({ label: g.label, parent: null });
  for (const t of g.topics) out.push({ label: t.label, parent: g.label });
}
process.stdout.write(JSON.stringify(out));
