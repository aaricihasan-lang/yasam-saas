/**
 * FAZ1 Final Hardening / PAKET BACKUP — migration SQL şema ayrıştırıcı (yalnız test/üretici aracı).
 *
 * `supabase/migrations/*.sql` dosyalarını sırayla okuyup public tabloların kolon/PK/FK/
 * GENERATED bilgisini çıkarır. Runtime'a import EDİLMEZ (node:fs kullanır).
 *
 * Kullanım:
 *   - `lib/backup/schema.generated.ts` üretimi: `npx tsx scripts/final-hardening/backup-schema-gen.ts`
 *   - backup.harness.ts: registry ↔ migration kapsam/drift kontrolü.
 *
 * Bilinçli sınırlar: tam bir SQL ayrıştırıcı değildir. CREATE TABLE gövdesi, ALTER TABLE
 * ADD/DROP/RENAME COLUMN, ADD CONSTRAINT (PK/FK), DROP TABLE ve RENAME TO desteklenir.
 * DO bloklarının içindeki doğrudan DDL de okunur; CREATE FUNCTION gövdeleri atlanır.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ParsedFk = { columns: string[]; refTable: string; refColumns: string[]; onDelete: string | null };

export type ParsedTable = {
  name: string;
  columns: string[];
  generated: string[];
  identity: string[];
  primaryKey: string[];
  foreignKeys: ParsedFk[];
  createdIn: string;
};

function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "'") {
      // string literal (''-escape)
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** CREATE [OR REPLACE] FUNCTION/PROCEDURE ... AS $tag$ ... $tag$ gövdelerini boşaltır. DO blokları korunur. */
function blankFunctionBodies(sql: string): string {
  const re = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\b/gi;
  let result = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const start = m.index;
    const dollar = /\$([a-z_0-9]*)\$/i.exec(sql.slice(start));
    if (!dollar) continue;
    const tag = dollar[0];
    const bodyStart = start + dollar.index + tag.length;
    const bodyEnd = sql.indexOf(tag, bodyStart);
    if (bodyEnd < 0) continue;
    result += sql.slice(last, bodyStart) + " " ;
    last = bodyEnd;
    re.lastIndex = bodyEnd + tag.length;
  }
  result += sql.slice(last);
  return result;
}

/** DO $$ ... $$ ve EXECUTE '...' içeriğini de düz metin olarak bırakır; dolar işaretlerini temizler. */
function flattenDollarQuotes(sql: string): string {
  return sql.replace(/\$[a-z_0-9]*\$/gi, " ; ");
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'") inStr = !inStr;
    if (!inStr) {
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (c === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function unq(id: string): string {
  return id.replace(/^public\./i, "").replace(/"/g, "").trim().toLowerCase();
}

function colList(s: string): string[] {
  return s
    .split(",")
    .map((x) => unq(x))
    .filter(Boolean);
}

const CONSTRAINT_START = /^(constraint|primary\s+key|unique|foreign\s+key|check|exclude)\b/i;

function parseFkClause(text: string, localCols: string[]): ParsedFk | null {
  const m = /references\s+([a-z_0-9."]+)\s*(?:\(([^)]*)\))?/i.exec(text);
  if (!m) return null;
  const del = /on\s+delete\s+(cascade|set\s+null|restrict|no\s+action|set\s+default)/i.exec(text);
  return {
    columns: localCols,
    refTable: unq(m[1]),
    refColumns: m[2] ? colList(m[2]) : ["id"],
    onDelete: del ? del[1].toLowerCase().replace(/\s+/g, " ") : null,
  };
}

function applyConstraint(t: ParsedTable, text: string) {
  const pk = /primary\s+key\s*\(([^)]*)\)/i.exec(text);
  if (pk) t.primaryKey = colList(pk[1]);
  const fk = /foreign\s+key\s*\(([^)]*)\)/i.exec(text);
  if (fk) {
    const parsed = parseFkClause(text, colList(fk[1]));
    if (parsed) t.foreignKeys.push(parsed);
  }
}

function addColumnDef(t: ParsedTable, def: string) {
  const m = /^("?[a-z_0-9]+"?)\s+([\s\S]*)$/i.exec(def.trim());
  if (!m) return;
  const name = unq(m[1]);
  const rest = m[2];
  if (!t.columns.includes(name)) t.columns.push(name);
  if (/generated\s+always\s+as\s*\(/i.test(rest) && !t.generated.includes(name)) t.generated.push(name);
  if (/generated\s+(always|by\s+default)\s+as\s+identity/i.test(rest) && !t.identity.includes(name)) {
    t.identity.push(name);
  }
  if (/\bprimary\s+key\b/i.test(rest)) t.primaryKey = [name];
  if (/\breferences\b/i.test(rest)) {
    const fk = parseFkClause(rest, [name]);
    if (fk) t.foreignKeys.push(fk);
  }
}

function findMatchingParen(s: string, open: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "'") inStr = !inStr;
    if (inStr) continue;
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseMigrations(dir: string): Map<string, ParsedTable> {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const tables = new Map<string, ParsedTable>();

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const sql = flattenDollarQuotes(blankFunctionBodies(stripComments(raw)));

    // Deyim sırasını korumak için tüm ilgili eşleşmeleri konuma göre topla.
    type Ev = { pos: number; kind: "create" | "alter" | "drop"; m: RegExpExecArray };
    const evs: Ev[] = [];
    const createRe = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:public\.)?"?[a-z_0-9]+"?)\s*\(/gi;
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?((?:public\.)?"?[a-z_0-9]+"?)\s+([^;]*);/gi;
    const dropRe = /drop\s+table\s+(?:if\s+exists\s+)?((?:public\.)?"?[a-z_0-9]+"?)/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql))) evs.push({ pos: m.index, kind: "create", m });
    while ((m = alterRe.exec(sql))) evs.push({ pos: m.index, kind: "alter", m });
    while ((m = dropRe.exec(sql))) evs.push({ pos: m.index, kind: "drop", m });
    evs.sort((a, b) => a.pos - b.pos);

    for (const ev of evs) {
      const rawName = ev.m[1];
      if (/^(storage|auth|extensions|cron|pg_)/i.test(rawName) || /\./.test(rawName.replace(/^public\./i, ""))) continue;
      const name = unq(rawName);
      if (ev.kind === "create") {
        if (tables.has(name)) continue; // IF NOT EXISTS: ilk tanım geçerli
        const open = ev.m.index + ev.m[0].length - 1;
        const close = findMatchingParen(sql, open);
        if (close < 0) continue;
        const body = sql.slice(open + 1, close);
        const t: ParsedTable = {
          name,
          columns: [],
          generated: [],
          identity: [],
          primaryKey: [],
          foreignKeys: [],
          createdIn: file,
        };
        for (const item of splitTopLevel(body)) {
          if (!item) continue;
          if (CONSTRAINT_START.test(item)) applyConstraint(t, item);
          else if (/^like\s/i.test(item)) continue;
          else addColumnDef(t, item);
        }
        tables.set(name, t);
      } else if (ev.kind === "drop") {
        tables.delete(name);
      } else {
        const t = tables.get(name);
        const rest = ev.m[2];
        const rename = /^rename\s+to\s+("?[a-z_0-9]+"?)/i.exec(rest.trim());
        if (rename && t) {
          tables.delete(name);
          t.name = unq(rename[1]);
          tables.set(t.name, t);
          continue;
        }
        if (!t) continue;
        for (const action of splitTopLevel(rest)) {
          const a = action.trim();
          let mm: RegExpExecArray | null;
          if ((mm = /^add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]*)$/i.exec(a))) addColumnDef(t, mm[1]);
          else if ((mm = /^drop\s+column\s+(?:if\s+exists\s+)?("?[a-z_0-9]+"?)/i.exec(a))) {
            const c = unq(mm[1]);
            t.columns = t.columns.filter((x) => x !== c);
            t.generated = t.generated.filter((x) => x !== c);
          } else if ((mm = /^rename\s+column\s+("?[a-z_0-9]+"?)\s+to\s+("?[a-z_0-9]+"?)/i.exec(a))) {
            const from = unq(mm[1]);
            const to = unq(mm[2]);
            t.columns = t.columns.map((x) => (x === from ? to : x));
          } else if (/^add\s+(constraint|primary|foreign)/i.test(a)) applyConstraint(t, a);
          else if ((mm = /^alter\s+column\s+("?[a-z_0-9]+"?)\s+add\s+generated/i.exec(a))) {
            const c = unq(mm[1]);
            if (!t.identity.includes(c)) t.identity.push(c);
          } else if (/^add\s+(?!constraint)("?[a-z_0-9]+"?)\s+/i.test(a) && !/^add\s+(unique|check|exclude)/i.test(a)) {
            // ADD <col> <type> (COLUMN anahtar sözcüğü olmadan)
            addColumnDef(t, a.replace(/^add\s+/i, ""));
          }
        }
      }
    }
  }
  return tables;
}

/** Migration'larda CREATE TABLE ile tanımlı (DROP edilmemiş) public tablo adları. */
export function migrationTableNames(dir: string): string[] {
  return [...parseMigrations(dir).keys()].sort();
}

// ─── Dinamik (EXECUTE format) DDL ekleri ─────────────────────────────────────
// Ayrıştırıcı EXECUTE format(...) içindeki DDL'i çözemez; bu migration'lar elle okunup
// aşağıya işlendi. Yeni bir dinamik provenance/junction migration'ı eklenirse BURAYA ekle.

const PROVENANCE_COLUMNS = [
  "origin_type",
  "origin_label",
  "origin_source_id",
  "origin_transfer_batch_id",
  "transferred_at",
] as const;

/** 20260925000000_admin_library_transfer_provenance, 20261213…healing_guides, 20261214…, 20261216010000_cupping… */
export const DYNAMIC_PROVENANCE_TARGETS: readonly string[] = [
  "stones", "minerals", "combinations",
  "bioenergy_symbols", "bioenergy_imaginations", "bioenergy_chakras",
  "bioenergy_energy_bodies", "bioenergy_subconscious_causes",
  "reflexology_protocols", "numerology_knowledge_records", "numerology_stone_assignments",
  "healing_guides", "healing_guide_sections",
  "human_design_knowledge_records", "human_design_knowledge_sources", "bioenergy_sessions", "aromatherapy_blends",
  "cupping_points", "cupping_point_placements", "cupping_topics", "cupping_point_topics",
  "cupping_techniques", "cupping_knowledge_records", "cupping_sources", "cupping_safety_notes",
];

/** 20261217000000_cupping_content_foundation — 6 tipli citation junction (EXECUTE format). */
export const DYNAMIC_CUPPING_JUNCTIONS: readonly (readonly [string, string, string])[] = [
  ["cupping_point_sources", "point_id", "cupping_points"],
  ["cupping_topic_sources", "topic_id", "cupping_topics"],
  ["cupping_point_topic_sources", "point_topic_id", "cupping_point_topics"],
  ["cupping_technique_sources", "technique_id", "cupping_techniques"],
  ["cupping_knowledge_sources", "knowledge_id", "cupping_knowledge_records"],
  ["cupping_safety_sources", "safety_id", "cupping_safety_notes"],
];

/** parseMigrations + dinamik ekler. Registry üretimi ve harness bunu kullanır. */
export function parseMigrationsWithDynamic(dir: string): Map<string, ParsedTable> {
  const tables = parseMigrations(dir);
  for (const [t, ecol, parent] of DYNAMIC_CUPPING_JUNCTIONS) {
    if (tables.has(t)) continue;
    tables.set(t, {
      name: t,
      columns: [
        "id", "tenant_id", "source_id", ecol, "locator", "evidence_class", "note", "sort_order",
        "created_at", "updated_at", ...PROVENANCE_COLUMNS,
      ],
      generated: [],
      identity: [],
      primaryKey: ["id"],
      foreignKeys: [
        { columns: ["tenant_id", "source_id"], refTable: "cupping_sources", refColumns: ["tenant_id", "id"], onDelete: "cascade" },
        { columns: ["tenant_id", ecol], refTable: parent, refColumns: ["tenant_id", "id"], onDelete: "cascade" },
      ],
      createdIn: "20261217000000_cupping_content_foundation.sql (dynamic)",
    });
  }
  for (const t of DYNAMIC_PROVENANCE_TARGETS) {
    const p = tables.get(t);
    if (!p) continue;
    for (const c of PROVENANCE_COLUMNS) if (!p.columns.includes(c)) p.columns.push(c);
  }
  return tables;
}
