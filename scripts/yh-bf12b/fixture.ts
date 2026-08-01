/**
 * BF-12B — Sentetik fixture (PII YOK; gerçek kullanıcı/tenant/veri kullanılmaz).
 *
 * Base dataset owner-gate + tenant sınıfları + 2501-satır sayfalama + composite PK
 * + parent/child FK + archive-only + do-not-restore session + owner shared-read +
 * null/shared canonical + users.password_hash (allowlist) senaryolarını kapsar.
 * Negatif varyantlar harness tarafından kullanılır.
 */
import type { ColumnMeta, ForeignKey, Row, StorageListItem, StorageReader, TableSchema } from "../../lib/yasam-hafizasi/backup/types";
import type { FixtureDataset, FixtureTable } from "../../lib/yasam-hafizasi/backup/reader";
import type { FixtureStorageData } from "../../lib/yasam-hafizasi/backup/storage";
import {
  DEMO_TENANT_ID,
  OWNER_ADMIN_TENANT_ID,
  TEST_EXPERT_TENANT_IDS,
  USERLESS_LEGACY_TENANT_ID,
} from "../../lib/yasam-hafizasi/backup/constants";

/** Word secret-scan sentinel'i (password_hash içine konur; Word'de GÖRÜNMEMELİ). */
export const SECRET_SENTINEL = "SENTINEL_SECRET_DO_NOT_LEAK_9f3a";

function col(name: string, dataType = "text", isNullable = true): ColumnMeta {
  return { name, dataType, isNullable, defaultExpr: null };
}

function table(
  name: string,
  columns: ColumnMeta[],
  primaryKey: string[],
  rows: Row[],
  foreignKeys: ForeignKey[] = [],
): [string, FixtureTable] {
  const schema: TableSchema = {
    name,
    columns,
    primaryKey,
    uniqueConstraints: [],
    foreignKeys,
    rlsEnabled: true,
    rlsForced: false,
    policyNames: [],
    approxRows: rows.length,
  };
  return [name, { schema, rows }];
}

const EXP1 = TEST_EXPERT_TENANT_IDS[0];
const EXP2 = TEST_EXPERT_TENANT_IDS[1];
const EXP3 = TEST_EXPERT_TENANT_IDS[2];

export function buildBaseDb(): FixtureDataset {
  const d: FixtureDataset = new Map();

  // tenants (kimlik) — override RESTORE
  d.set(
    ...table(
      "tenants",
      [col("id"), col("name"), col("slug")],
      ["id"],
      [
        { id: OWNER_ADMIN_TENANT_ID, name: "Owner", slug: "owner" },
        { id: DEMO_TENANT_ID, name: "Demo", slug: "demo" },
        { id: EXP1, name: "Exp1", slug: "exp1" },
        { id: EXP2, name: "Exp2", slug: "exp2" },
        { id: EXP3, name: "Exp3", slug: "exp3" },
        { id: USERLESS_LEGACY_TENANT_ID, name: "Legacy", slug: "legacy" },
      ],
    ),
  );

  // users — owner gate (exact 1: role=admin+admin_level=owner+active+owner-tenant)
  d.set(
    ...table(
      "users",
      [
        col("id"),
        col("tenant_id"),
        col("role"),
        col("admin_level"),
        col("active", "boolean", false),
        col("approval_status"),
        col("status"),
        col("is_demo_account", "boolean"),
        col("email"),
        col("password_hash"),
      ],
      ["id"],
      [
        { id: "u-owner", tenant_id: OWNER_ADMIN_TENANT_ID, role: "admin", admin_level: "owner", active: true, approval_status: "approved", status: "active", is_demo_account: false, email: "owner@example.test", password_hash: SECRET_SENTINEL },
        // Uzman: admin_level='owner' OLSA BİLE role=expert → owner sayılmaz (senaryo 2).
        { id: "u-exp1", tenant_id: EXP1, role: "expert", admin_level: "owner", active: true, approval_status: "approved", status: "active", is_demo_account: false, email: "e1@example.test", password_hash: "hash-e1" },
        { id: "u-exp2", tenant_id: EXP2, role: "expert", admin_level: "member", active: true, approval_status: "approved", status: "active", is_demo_account: false, email: "e2@example.test", password_hash: "hash-e2" },
        { id: "u-exp3", tenant_id: EXP3, role: "expert", admin_level: "member", active: true, approval_status: "approved", status: "active", is_demo_account: false, email: "e3@example.test", password_hash: "hash-e3" },
        { id: "u-demo", tenant_id: DEMO_TENANT_ID, role: "expert", admin_level: "member", active: true, approval_status: "approved", status: "active", is_demo_account: true, email: "demo@example.test", password_hash: "hash-demo" },
      ],
    ),
  );

  // stones — owner + expert kopyaları (bağımsız satır/tenant)
  d.set(
    ...table(
      "stones",
      [col("id"), col("tenant_id"), col("stone_name"), col("images", "jsonb")],
      ["id"],
      [
        { id: "s-o1", tenant_id: OWNER_ADMIN_TENANT_ID, stone_name: "Ametist", images: [{ url: "u", file_path: "catalog/x/a.jpg" }] },
        { id: "s-e1a", tenant_id: EXP1, stone_name: "Ametist", images: [] },
        { id: "s-e2a", tenant_id: EXP2, stone_name: "Kuvars", images: [] },
        { id: "s-e3a", tenant_id: EXP3, stone_name: "Obsidyen", images: [] },
      ],
    ),
  );

  // stone_knowledge_articles — owner shared-read + null/shared
  d.set(
    ...table(
      "stone_knowledge_articles",
      [col("id"), col("tenant_id"), col("title")],
      ["id"],
      [
        { id: "ska-o1", tenant_id: OWNER_ADMIN_TENANT_ID, title: "Owner makale (shared-read)" },
        { id: "ska-o2", tenant_id: OWNER_ADMIN_TENANT_ID, title: "Owner makale 2" },
        { id: "ska-null", tenant_id: null, title: "Global shared makale" },
        { id: "ska-e1", tenant_id: EXP1, title: "Expert kendi eki" },
      ],
    ),
  );

  // combinations — tenant-only
  d.set(
    ...table(
      "combinations",
      [col("id"), col("tenant_id"), col("issue")],
      ["id"],
      [
        { id: "c-o1", tenant_id: OWNER_ADMIN_TENANT_ID, issue: "Uyku" },
        { id: "c-e1", tenant_id: EXP1, issue: "Stres" },
      ],
    ),
  );

  // stone_knowledge_categories — global canonical (KNOWN_CANONICAL)
  d.set(
    ...table("stone_knowledge_categories", [col("id"), col("name")], ["id"], [
      { id: "cat1", name: "Genel" },
      { id: "cat2", name: "Fiziksel" },
    ]),
  );

  // big_table — 2501 satır (2000 sınırı aşımı)
  const bigRows: Row[] = [];
  for (let i = 1; i <= 2501; i++) {
    bigRows.push({ id: i, tenant_id: i % 2 === 0 ? EXP1 : EXP2, payload: `row-${i}` });
  }
  d.set(...table("big_table", [col("id", "integer", false), col("tenant_id"), col("payload")], ["id"], bigRows));

  // composite_pk_table — bileşik PK
  d.set(
    ...table(
      "composite_pk_table",
      [col("a", "integer", false), col("b", "integer", false), col("tenant_id"), col("val")],
      ["a", "b"],
      [
        { a: 1, b: 1, tenant_id: EXP1, val: "x" },
        { a: 1, b: 2, tenant_id: EXP1, val: "y" },
        { a: 2, b: 1, tenant_id: EXP2, val: "z" },
      ],
    ),
  );

  // parent/child + FK metadata (RESTRICT/CASCADE/SET NULL)
  d.set(
    ...table("parent_table", [col("id"), col("tenant_id"), col("label")], ["id"], [
      { id: "p1", tenant_id: EXP1, label: "P1" },
      { id: "p2", tenant_id: EXP2, label: "P2" },
    ]),
  );
  d.set(
    ...table(
      "child_table",
      [col("id"), col("tenant_id"), col("parent_id"), col("note")],
      ["id"],
      [
        { id: "ch1", tenant_id: EXP1, parent_id: "p1", note: "n1" },
        { id: "ch2", tenant_id: EXP2, parent_id: "p2", note: "n2" },
      ],
      [{ table: "child_table", columns: ["parent_id"], refTable: "parent_table", refColumns: ["id"], onDelete: "CASCADE" }],
    ),
  );

  // pk-less küçük referans (tenant_id ile; tek sayfa, canonical sıra)
  d.set(
    ...table("pkless_ref", [col("tenant_id"), col("k"), col("v")], [], [
      { tenant_id: EXP1, k: "a", v: "1" },
      { tenant_id: EXP1, k: "b", v: "2" },
    ]),
  );

  // ARCHIVE_ONLY: security_events, support_messages
  d.set(
    ...table("security_events", [col("id"), col("user_id"), col("event")], ["id"], [
      { id: "se1", user_id: "u-owner", event: "login" },
    ]),
  );
  d.set(
    ...table("support_messages", [col("id"), col("tenant_id"), col("user_id"), col("message")], ["id"], [
      { id: "sm1", tenant_id: EXP1, user_id: "u-exp1", message: "yardım" },
    ]),
  );

  // DO_NOT_RESTORE: user_sessions (session_token — saklanmaz, sensitive gate exempt)
  d.set(
    ...table("user_sessions", [col("id"), col("user_id"), col("session_token")], ["id"], [
      { id: "sess1", user_id: "u-owner", session_token: "tok-DO-NOT-STORE" },
    ]),
  );

  // ARCHIVE_ONLY: yasam_hafizasi_index (tenant_id nullable) — forensic
  d.set(
    ...table(
      "yasam_hafizasi_index",
      [col("id"), col("tenant_id"), col("source_module"), col("source_table")],
      ["id"],
      [
        { id: "yi1", tenant_id: EXP1, source_module: "dogaltas", source_table: "stones" },
        { id: "yi2", tenant_id: null, source_module: "aromaterapi", source_table: "aromatherapy_oils" },
      ],
    ),
  );

  // userless/legacy: numeroloji legacy kaydı (tenant_id = 11111111)
  d.set(
    ...table("numerology_records", [col("id"), col("tenant_id"), col("name")], ["id"], [
      { id: "nr1", tenant_id: USERLESS_LEGACY_TENANT_ID, name: "Legacy kayıt" },
    ]),
  );

  return d;
}

export function buildBaseStorage(): FixtureStorageData {
  const s: FixtureStorageData = new Map();
  const put = (bucket: string, path: string, bytes: number, updatedAt: string): void => {
    const objs = s.get(bucket) ?? new Map();
    objs.set(path, { buffer: Buffer.alloc(bytes, 1), updatedAt });
    s.set(bucket, objs);
  };
  put("stone-photos", `catalog/${OWNER_ADMIN_TENANT_ID}/a.jpg`, 100, "2026-01-01T00:00:00Z");
  put("stone-photos", `healing-guides/${EXP1}/b.png`, 200, "2026-01-01T00:00:00Z");
  put("stone-photos", `${EXP2}/client1/stone1/c.jpg`, 150, "2026-01-01T00:00:00Z");
  put("personal-archive", `${USERLESS_LEGACY_TENANT_ID}/arch1/d.pdf`, 300, "2026-01-01T00:00:00Z");
  put("belge-ceviri", `output/job1.docx`, 250, "2026-01-01T00:00:00Z"); // legacy no-prefix
  put("video-temp", `${EXP3}/tmp1.mp4`, 400, "2026-01-01T00:00:00Z");
  put("hd-chart-images", `${OWNER_ADMIN_TENANT_ID}/client/chart.png`, 120, "2026-01-01T00:00:00Z");
  return s;
}

// ─── Negatif varyantlar ───────────────────────────────────────────────────────

/** Senaryo 15: plaintext password (users.password) non-null → fail. */
export function withPlaintextPassword(): FixtureDataset {
  const d = buildBaseDb();
  const users = d.get("users");
  if (users) {
    users.schema.columns.push(col("password"));
    users.rows[0] = { ...users.rows[0], password: "PLAINTEXT!" };
  }
  return d;
}

/** Senaryo 16: beklenmeyen dolu hassas kolon (clients.api_key) → fail. */
export function withUnexpectedSensitiveColumn(): FixtureDataset {
  const d = buildBaseDb();
  d.set(
    ...table("clients", [col("id"), col("tenant_id"), col("api_key")], ["id"], [
      { id: "cl1", tenant_id: EXP1, api_key: "sk-live-oops" },
    ]),
  );
  return d;
}

/** Senaryo 17: sahiplik kolonu olmayan + canonical olmayan dolu tablo → UNRESOLVED fail. */
export function withUnresolvedTable(): FixtureDataset {
  const d = buildBaseDb();
  d.set(...table("mystery_orphans", [col("id"), col("blob")], ["id"], [{ id: "m1", blob: "?" }]));
  return d;
}

/** Senaryo 18: tekrarlı PK → fail. */
export function withDuplicatePk(): FixtureDataset {
  const d = buildBaseDb();
  d.set(...table("dup_table", [col("id"), col("tenant_id"), col("v")], ["id"], [
    { id: "dup", tenant_id: EXP1, v: "1" },
    { id: "dup", tenant_id: EXP1, v: "2" },
  ]));
  return d;
}

/** Senaryo 19/27: non-nullable FK'nin parent'ı restore kapsamı dışında → dry-run fail (COMPLETE yok). */
export function withMissingFkParent(): FixtureDataset {
  const d = buildBaseDb();
  d.set(
    ...table(
      "orphan_child",
      [col("id"), col("tenant_id"), col("ghost_id")],
      ["id"],
      [{ id: "oc1", tenant_id: EXP1, ghost_id: "g1" }],
      [{ table: "orphan_child", columns: ["ghost_id"], refTable: "ghost_parent", refColumns: ["id"], onDelete: "RESTRICT" }],
    ),
  );
  return d;
}

/** Senaryo 1 negatif: owner gate exact-1 sağlanmaz (owner user yok). */
export function withNoOwner(): FixtureDataset {
  const d = buildBaseDb();
  const users = d.get("users");
  if (users) users.rows = users.rows.filter((r) => r.id !== "u-owner");
  return d;
}

// ─── Özel storage adaptörleri (negatif) ───────────────────────────────────────

/** Senaryo 22: list boyutu ile download boyutu uyuşmaz → fail. */
export class SizeMismatchStorage implements StorageReader {
  constructor(private readonly data: FixtureStorageData) {}
  async listAll(): Promise<StorageListItem[]> {
    const out: StorageListItem[] = [];
    let first = true;
    for (const [bucket, objs] of this.data) {
      for (const [path, o] of objs) {
        out.push({ bucket, path, size: o.buffer.length + (first ? 1 : 0), updatedAt: o.updatedAt });
        first = false;
      }
    }
    return out.sort((a, b) => (`${a.bucket}/${a.path}` < `${b.bucket}/${b.path}` ? -1 : 1));
  }
  async download(bucket: string, path: string): Promise<Buffer> {
    const o = this.data.get(bucket)?.get(path);
    if (!o) throw new Error("yok");
    return o.buffer;
  }
  source(): "fixture" | "production" {
    return "fixture";
  }
}

/** Senaryo 23: pre/post list drift → fail. */
export class DriftStorage implements StorageReader {
  private calls = 0;
  constructor(private readonly data: FixtureStorageData) {}
  async listAll(): Promise<StorageListItem[]> {
    this.calls += 1;
    const out: StorageListItem[] = [];
    for (const [bucket, objs] of this.data) {
      for (const [path, o] of objs) {
        const drift = this.calls > 1 ? "-DRIFTED" : "";
        out.push({ bucket, path, size: o.buffer.length, updatedAt: o.updatedAt + drift });
      }
    }
    return out.sort((a, b) => (`${a.bucket}/${a.path}` < `${b.bucket}/${b.path}` ? -1 : 1));
  }
  async download(bucket: string, path: string): Promise<Buffer> {
    const o = this.data.get(bucket)?.get(path);
    if (!o) throw new Error("yok");
    return o.buffer;
  }
  source(): "fixture" | "production" {
    return "fixture";
  }
}
