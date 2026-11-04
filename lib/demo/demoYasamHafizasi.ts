/**
 * DEMO VİTRİN — Yaşam Hafızası SENTETİK arama yanıtı (sunucu-tarafı fixture).
 *
 * Ürün kararı (2026-10-03): Yaşam Hafızası demo vitrinde ÇALIŞIR GÖRÜNÜR. Demo hesap gerçek YH
 * indeksine/pipeline'ına BAĞLANMAZ:
 *   - DB / RPC okuması YOK (yh_search_* RPC'lerindeki demo-tenant dışlaması aynen korunur),
 *   - index/outbox/Inngest tetiklenmez, AI/embedding YOK,
 *   - başka tenant verisi okunamaz (fixture sabit ve yalnız demo hesabın isteğinde döner).
 *
 * Fixture satırları GERÇEK RPC satır şekliyle (Candidate / ClientRpcRow / TenantClientRpcRow)
 * üretilir; route'lar bunları gerçek eşleyicilerden (toSearchResult / toClientSearchResult /
 * toTenantClientSearchResult) + kapsam/faset/limit akışından geçirir → yanıt sözleşmesi gerçek
 * yanıtla birebir aynıdır. Danışan kayıtları demo tenant'ına yüklenen sentetik kayıtların SABİT
 * id'lerine bağlanır (lib/demo/demoVitrinFixture.ts) → deep-link'ler gerçek danışan detayını açar.
 */
import type { Candidate } from "@/lib/yasam-hafizasi/search/types";
import type { YhSourceModule } from "@/lib/yasam-hafizasi/config";
import type { ClientRpcRow } from "@/lib/yasam-hafizasi/client/clientSearchResult";
import type { TenantClientRpcRow } from "@/lib/yasam-hafizasi/client/tenantClientSearchResult";
import { normalizeSearchText } from "@/lib/yasam-hafizasi/search/normalize";
import {
  DEMO_TENANT_ID,
  DEMO_CLIENTS_SEED,
  DEMO_CLIENT_IDS,
  DEMO_NOTES_SEED,
  DEMO_SESSIONS_SEED,
  DEMO_HOMEWORKS_SEED,
  DEMO_STONES_SEED,
  DEMO_APPOINTMENTS_SEED,
} from "@/lib/demo/demoVitrinFixture";

/** Arama yapılmadan önerilen örnek sorgular (UI ipucu/test). */
export const DEMO_YH_SAMPLE_QUERIES = ["uyku", "ametist", "stres", "nefes", "boğaz"] as const;

const DAY_MS = 86_400_000;
function isoDaysAgo(offsetDays: number, now: number): string {
  return new Date(now + offsetDays * DAY_MS).toISOString();
}

// ─── Mesleki (professional) bilgi — sentetik ────────────────────────────────

type ProSeed = {
  id: string;
  module: YhSourceModule;
  table: string;
  title: string;
  snippet: string;
  tags: string[];
  relations?: { kind: string; targetLabel: string }[];
  updatedOffsetDays: number;
};

const PRO_SEEDS: readonly ProSeed[] = [
  {
    id: "de5a0f01-0000-4000-8000-000000000001", module: "dogaltas", table: "stones",
    title: "Ametist", snippet: "Uyku öncesi rahatlama ve sakinleşme rutinlerinde tercih edilen mor kuvars (sentetik örnek bilgi kaydı).",
    tags: ["uyku", "rahatlama", "stres", "kuvars"], relations: [{ kind: "çakra", targetLabel: "Taç Çakra" }], updatedOffsetDays: -14,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000002", module: "dogaltas", table: "stones",
    title: "Akuamarin", snippet: "İfade ve iletişim çalışmalarında kullanılan açık mavi beril (sentetik örnek bilgi kaydı).",
    tags: ["iletişim", "ifade", "boğaz"], relations: [{ kind: "çakra", targetLabel: "Boğaz Çakrası" }], updatedOffsetDays: -9,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000003", module: "biyoenerji", table: "bioenergy_chakras",
    title: "Boğaz Çakrası", snippet: "İfade, iletişim ve öz anlatımla ilişkilendirilen enerji merkezi; nefes çalışmalarıyla birlikte ele alınır.",
    tags: ["boğaz", "iletişim", "nefes", "çakra"], updatedOffsetDays: -21,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000004", module: "biyoenerji", table: "bioenergy_imaginations",
    title: "Nefesle gevşeme imajinasyonu", snippet: "4-6 nefes ritmiyle yürütülen kısa gevşeme yönlendirmesi; stres ve uyku öncesi rutin için örnek.",
    tags: ["nefes", "stres", "uyku", "gevşeme"], updatedOffsetDays: -18,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000005", module: "aromaterapi", table: "aromatherapy_oils",
    title: "Lavanta (Lavandula angustifolia)", snippet: "Akşam rutini ve sakinleştirici ortam kokusu için sık kullanılan uçucu yağ (sentetik örnek).",
    tags: ["uyku", "rahatlama", "akşam rutini"], updatedOffsetDays: -30,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000006", module: "sifa_rehberi", table: "healing_guides",
    title: "Uyku düzeni rehberi", snippet: "Uyku hijyeni, ekran molası ve akşam rutini başlıklarını bir araya getiren örnek rehber.",
    tags: ["uyku", "ekran", "rutin"], updatedOffsetDays: -25,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000007", module: "refleksoloji", table: "reflexology_protocols",
    title: "Stres rahatlama protokolü", snippet: "Solar pleksus ve diyafram bölgelerine odaklanan örnek ayak refleksolojisi protokolü.",
    tags: ["stres", "rahatlama", "diyafram"], updatedOffsetDays: -16,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000008", module: "kupa_hacamat", table: "cupping_protocols",
    title: "Boyun-omuz gerginliği protokolü", snippet: "Masa başı çalışma kaynaklı gerginlik için örnek kuru kupa uygulama planı.",
    tags: ["boyun", "omuz", "gerginlik"], updatedOffsetDays: -11,
  },
  {
    id: "de5a0f01-0000-4000-8000-000000000009", module: "numeroloji", table: "numerology_knowledge_records",
    title: "Kişisel yıl 7 — içe dönüş", snippet: "Dinlenme, farkındalık ve iç denge temalarını öne çıkaran örnek numeroloji bilgi kaydı.",
    tags: ["kişisel yıl", "denge", "farkındalık"], updatedOffsetDays: -40,
  },
];

// ─── Danışan kayıtları — demo tenant'ına yüklenen SABİT kayıtlara bağlı ─────

type ClientSeedRow = {
  id: string;
  clientId: string;
  module: "danisan_not" | "danisan_seans" | "danisan_odev" | "danisan_tas" | "randevu";
  table: string;
  sourceId: string;
  title: string;
  snippet: string;
  tags: string[];
  occurredOffsetDays: number;
};

function clientRows(): ClientSeedRow[] {
  const rows: ClientSeedRow[] = [];
  let i = 0;
  const nextId = () => `de5a0f02-0000-4000-8000-${(++i).toString(16).padStart(12, "0")}`;
  for (const n of DEMO_NOTES_SEED) {
    rows.push({
      id: nextId(), clientId: n.clientId, module: "danisan_not", table: "client_notes", sourceId: n.id,
      title: "Danışan notu", snippet: `${n.saglik} ${n.oneriler}`, tags: ["not", "sağlık", "öneri"], occurredOffsetDays: -6,
    });
  }
  for (const s of DEMO_SESSIONS_SEED) {
    rows.push({
      id: nextId(), clientId: s.clientId, module: "danisan_seans", table: "client_sessions", sourceId: s.id,
      title: `${s.type} seansı`, snippet: `${s.note} ${s.actions} ${s.suggestions}`, tags: ["seans", s.type.toLowerCase()],
      occurredOffsetDays: s.offsetDays,
    });
  }
  for (const h of DEMO_HOMEWORKS_SEED) {
    rows.push({
      id: nextId(), clientId: h.clientId, module: "danisan_odev", table: "client_homeworks", sourceId: h.id,
      title: h.title, snippet: h.description, tags: ["ödev", h.type.toLowerCase()], occurredOffsetDays: h.startOffsetDays,
    });
  }
  for (const st of DEMO_STONES_SEED) {
    rows.push({
      id: nextId(), clientId: st.clientId, module: "danisan_tas", table: "client_stones", sourceId: st.id,
      title: st.name, snippet: `${st.usageArea}. ${st.note}`, tags: ["taş", st.type.toLowerCase()], occurredOffsetDays: st.offsetDays,
    });
  }
  for (const a of DEMO_APPOINTMENTS_SEED) {
    rows.push({
      id: nextId(), clientId: a.clientId, module: "randevu", table: "appointments", sourceId: a.id,
      title: a.title, snippet: a.notes, tags: ["randevu"], occurredOffsetDays: a.offsetDays,
    });
  }
  return rows;
}

const CLIENT_ROWS: readonly ClientSeedRow[] = clientRows();

// ─── Eşleştirme (Türkçe aksan-duyarsız, önek) ───────────────────────────────

function tokensOf(text: string): string[] {
  return [...normalizeSearchText(text).tokens];
}

/** Sorgunun TÜM token'ları metindeki bir token'ın öneki ise eşleşir; skor = eşleşen token sayısı. */
function matchScore(query: string, haystack: string): number {
  const q = tokensOf(query);
  if (q.length === 0) return 0;
  const hay = tokensOf(haystack);
  let score = 0;
  for (const t of q) {
    const hit = hay.filter((h) => h.startsWith(t)).length;
    if (hit === 0) return 0;
    score += hit;
  }
  return score;
}

function rankBy<T>(items: readonly T[], text: (x: T) => string, query: string): T[] {
  return items
    .map((x) => ({ x, s: matchScore(query, text(x)) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((r) => r.x);
}

// ─── Gerçek RPC satır şekline dönüştürücüler ─────────────────────────────────

/** Mesleki arama: gerçek retrieval Candidate şekli (tenant = demo tenant → isShared=false). */
export function demoYhProfessionalCandidates(query: string, now: number = Date.now()): Candidate[] {
  return rankBy(PRO_SEEDS, (p) => `${p.title} ${p.snippet} ${p.tags.join(" ")}`, query).map((p, idx) => ({
    id: p.id,
    tenantId: DEMO_TENANT_ID,
    sourceModule: p.module,
    sourceTable: p.table,
    sourceId: p.id,
    unitType: "record",
    sectionRef: null,
    groupKey: null,
    title: p.title,
    snippet: p.snippet,
    evidenceFields: [
      { origin: `${p.table}.title`, kind: "title", text: p.title },
      { origin: `${p.table}.tags`, kind: "tag", text: p.tags.join(", ") },
    ] as Candidate["evidenceFields"],
    topicTags: p.tags,
    expertRelations: p.relations ?? [],
    tsRank: 1 / (idx + 1),
    sourceUpdatedAt: isoDaysAgo(p.updatedOffsetDays, now),
  }));
}

function toRpcRow(r: ClientSeedRow, now: number): TenantClientRpcRow {
  return {
    id: r.id,
    client_id: r.clientId,
    source_module: r.module,
    source_table: r.table,
    source_id: r.sourceId,
    unit_type: "record",
    title: r.title,
    snippet: r.snippet,
    evidence_fields: [{ kind: "paragraph", text: r.snippet }],
    topic_tags: r.tags,
    expert_relations: [],
    occurred_at: isoDaysAgo(r.occurredOffsetDays, now),
    source_updated_at: isoDaysAgo(r.occurredOffsetDays, now),
  };
}

/** Tüm danışanlarda arama (tenant-wide client-search) — gerçek TenantClientRpcRow şekli. */
export function demoYhTenantClientRows(query: string, limit: number, now: number = Date.now()): TenantClientRpcRow[] {
  return rankBy(CLIENT_ROWS, (r) => `${r.title} ${r.snippet} ${r.tags.join(" ")}`, query)
    .slice(0, limit)
    .map((r) => toRpcRow(r, now));
}

/** Tek danışan içinde arama — gerçek ClientRpcRow şekli. Bilinmeyen danışan → boş. */
export function demoYhClientRows(query: string, clientId: string, limit: number, now: number = Date.now()): ClientRpcRow[] {
  return demoYhTenantClientRows(query, Number.MAX_SAFE_INTEGER, now)
    .filter((r) => r.client_id === clientId)
    .slice(0, limit)
    .map((r): ClientRpcRow => ({
      id: r.id, source_module: r.source_module, source_table: r.source_table, source_id: r.source_id,
      unit_type: r.unit_type, title: r.title, snippet: r.snippet, evidence_fields: r.evidence_fields,
      topic_tags: r.topic_tags, expert_relations: r.expert_relations, occurred_at: r.occurred_at,
      source_updated_at: r.source_updated_at,
    }));
}

/** Fixture danışan adları (ad resolve DB'ye gitmeden). */
export function demoYhClientNames(): Map<string, string> {
  return new Map(DEMO_CLIENTS_SEED.map((c) => [c.id, `${c.ad} ${c.soyad}`]));
}

/** Health "ready" için gösterilecek sentetik kayıt sayısı. */
export function demoYhFixtureSize(): number {
  return PRO_SEEDS.length + CLIENT_ROWS.length;
}

/** Fixture'da en az bir kaydı olan demo danışanları (test/öneri). */
export const DEMO_YH_CLIENTS_WITH_MEMORY: readonly string[] = [DEMO_CLIENT_IDS.eylul, DEMO_CLIENT_IDS.kaan, DEMO_CLIENT_IDS.merve];
