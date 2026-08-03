/**
 * BF-14 Paket 2 — Teslim Entegrasyonları harness (PASS/BLOCKED).
 *
 * Kapsam (SAF birimler + gerçek DOCX yapısal doğrulama + rota statik denetimi):
 *   - snapshot seçim isteği doğrulama (server-derived; içerik/tenant/client reddi)
 *   - snapshot güvenli DTO (ham tenant/client/tablo/uuid YOK)
 *   - buildSnapshotSection → gerçek .docx üret → word/document.xml içeriğini denetle
 *   - 3 teslim rotasının regresyon-güvenli guard'ı (selectionGroupId yoksa değişmez)
 * Production/DB YOK.  npm run yh:bf14:delivery:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { Document, Packer } from "docx";
import {
  parseSnapshotCreate,
  parseSnapshotDelete,
  SNAPSHOT_MAX_ITEMS,
} from "@/lib/yasam-hafizasi/client/snapshotSelection";
import {
  toSnapshotDto,
  toSnapshotReportItem,
  snapshotModuleLabel,
  compareSnapshotRows,
  type SnapshotRow,
} from "@/lib/yasam-hafizasi/client/snapshotDto";
import { buildSnapshotSection, SNAPSHOT_SECTION_HEADING } from "@/lib/yasam-hafizasi/client/snapshotReport";

const U1 = "11111111-1111-4111-1111-111111111111";
const U2 = "22222222-2222-4222-2222-222222222222";
const GROUP = "33333333-3333-4333-3333-333333333333";
const SNAP = "44444444-4444-4444-4444-444444444444";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

// ── 1) parseSnapshotCreate (server-derived; içerik/tenant/client reddi) ──
{
  const good = parseSnapshotCreate({ targetKind: "report", items: [{ scope: "professional", indexId: U1 }] });
  add("create-report-ok", good.ok && good.value.targetKind === "report" && good.value.targetRef === null, good.ok ? "" : good.code);

  const proto = parseSnapshotCreate({ targetKind: "protocol", targetRef: U2, items: [{ scope: "client", indexId: U1 }] });
  add("create-protocol-targetref", proto.ok && proto.value.targetRef === U2, proto.ok ? "" : proto.code);

  add("create-protocol-needs-targetref", !parseSnapshotCreate({ targetKind: "protocol", items: [{ scope: "client", indexId: U1 }] }).ok);
  add("create-invalid-targetkind", !parseSnapshotCreate({ targetKind: "x", items: [{ scope: "client", indexId: U1 }] }).ok);
  add("create-invalid-scope", !parseSnapshotCreate({ targetKind: "report", items: [{ scope: "evil", indexId: U1 }] }).ok);
  add("create-invalid-indexid", !parseSnapshotCreate({ targetKind: "report", items: [{ scope: "client", indexId: "nope" }] }).ok);
  add("create-no-items", !parseSnapshotCreate({ targetKind: "report", items: [] }).ok);
  add("create-too-many", !parseSnapshotCreate({ targetKind: "report", items: Array.from({ length: SNAPSHOT_MAX_ITEMS + 1 }, () => ({ scope: "client", indexId: U1 })) }).ok);

  // İçerik/tenant/client alanları GÖRMEZDEN GELİNİR (server-derived sözleşme).
  const injected = parseSnapshotCreate({
    targetKind: "report",
    items: [{ scope: "professional", indexId: U1, title: "HACK", selectedText: "PII", evidence: [{ text: "x" }], provenance: {}, sourceTable: "clients", sourceId: U2, tenantId: "EVIL", clientId: "EVIL" }],
  });
  const injectedJson = injected.ok ? JSON.stringify(injected.value) : "";
  add(
    "create-ignores-content-fields",
    injected.ok &&
      !injectedJson.includes("HACK") && !injectedJson.includes("PII") &&
      !injectedJson.includes("EVIL") && !injectedJson.includes("clients") &&
      !("title" in injected.value.items[0]!) && !("tenantId" in injected.value.items[0]!),
    injectedJson,
  );

  // expertNote sınırı
  add("create-note-too-long", !parseSnapshotCreate({ targetKind: "report", items: [{ scope: "client", indexId: U1, expertNote: "x".repeat(2001) }] }).ok);
  const noteOk = parseSnapshotCreate({ targetKind: "report", items: [{ scope: "client", indexId: U1, expertNote: "kısa not" }] });
  add("create-note-kept", noteOk.ok && noteOk.value.items[0]!.expertNote === "kısa not", noteOk.ok ? "" : noteOk.code);

  // aynı istek içinde (scope+indexId) tekrarı düşer (idempotent)
  const dup = parseSnapshotCreate({ targetKind: "report", items: [{ scope: "client", indexId: U1 }, { scope: "client", indexId: U1 }] });
  add("create-dedupes-same-item", dup.ok && dup.value.items.length === 1, dup.ok ? String(dup.value.items.length) : dup.code);

  // ordering korunur
  const ord = parseSnapshotCreate({ targetKind: "guide", targetRef: U2, items: [{ scope: "professional", indexId: U1, ordering: 5 }] });
  add("create-ordering-kept", ord.ok && ord.value.items[0]!.ordering === 5, ord.ok ? "" : ord.code);
  add("create-invalid-ordering", !parseSnapshotCreate({ targetKind: "guide", targetRef: U2, items: [{ scope: "professional", indexId: U1, ordering: -1 }] }).ok);
  add("create-invalid-group", !parseSnapshotCreate({ targetKind: "report", selectionGroupId: "nope", items: [{ scope: "client", indexId: U1 }] }).ok);
}

// ── 2) parseSnapshotDelete ──
{
  add("delete-ok", parseSnapshotDelete({ selectionGroupId: GROUP, snapshotId: SNAP }).ok);
  add("delete-bad-group", !parseSnapshotDelete({ selectionGroupId: "x", snapshotId: SNAP }).ok);
  add("delete-bad-snap", !parseSnapshotDelete({ selectionGroupId: GROUP, snapshotId: "x" }).ok);
}

// ── 3) DTO (ham tenant/client/selected_by/source_id/source_table YOK) ──
{
  const row: SnapshotRow = {
    id: SNAP, target_kind: "protocol", target_ref: U2, selection_group: GROUP,
    source_module: "danisan_tas", title: "Ametist", selected_text: "mor kuvars",
    evidence: [{ kind: "title", text: "ametist" }], provenance: { sourceTable: "client_stones", sourceId: U1, sourceModule: "danisan_tas" },
    source_updated_at: "2026-01-10T00:00:00Z", ordering: 2, expert_note: "danışana özel",
    source_available_at_snapshot: true, created_at: "2026-02-01T00:00:00Z",
  };
  const dto = toSnapshotDto(row);
  const dtoJson = JSON.stringify(dto);
  add("dto-mapped", dto.id === SNAP && dto.targetKind === "protocol" && dto.moduleLabel === "Danışan Taşı", dto.moduleLabel);
  add("dto-no-raw-scope-leak", !("tenant_id" in (dto as unknown as Record<string, unknown>)) && !("client_id" in (dto as unknown as Record<string, unknown>)) && !("selected_by" in (dto as unknown as Record<string, unknown>)) && !("source_id" in (dto as unknown as Record<string, unknown>)) && !("source_table" in (dto as unknown as Record<string, unknown>)));
  add("dto-no-source-table-value", !dtoJson.includes("client_stones") && !dtoJson.includes(U1), dtoJson);
  add("dto-keeps-content", dto.title === "Ametist" && dto.selectedText === "mor kuvars" && dto.evidence.length === 1);
  add("dto-module-label-professional", snapshotModuleLabel("dogaltas") === "Doğaltaş");
  add("dto-module-label-client", snapshotModuleLabel("danisan_seans") === "Seans");
  add("dto-module-label-unknown", snapshotModuleLabel("zzz") === "zzz");

  // kararlı sıralama: ordering → created_at → id
  const rows: SnapshotRow[] = [
    { ...row, id: U2, ordering: 1, created_at: "2026-02-02T00:00:00Z" },
    { ...row, id: U1, ordering: 0, created_at: "2026-02-03T00:00:00Z" },
  ];
  const sorted = rows.slice().sort(compareSnapshotRows);
  add("dto-stable-ordering", sorted[0]!.id === U1 && sorted[1]!.id === U2);

  const item = toSnapshotReportItem({ ...row, source_available_at_snapshot: false });
  add("report-item-source-missing", item.sourceAvailable === false && item.moduleLabel === "Danışan Taşı");
}

// ── 4) buildSnapshotSection → gerçek DOCX yapısal doğrulama ──
async function docxChecks(): Promise<void> {
  add("section-empty-noop", buildSnapshotSection([]).length === 0);

  const items = [
    { moduleLabel: "Refleksoloji", title: "Karaciğer Protokolü", selectedText: "taban orta bölge çalışması", evidence: [{ kind: "tag", text: "karaciğer" }], sourceUpdatedAt: "2026-01-15T00:00:00Z", expertNote: "danışana özel uygulama", sourceAvailable: true },
    { moduleLabel: "Şifa Rehberi", title: "Uyku Düzeni", selectedText: "akşam rutini", evidence: [], sourceUpdatedAt: null, expertNote: null, sourceAvailable: false },
  ];
  const section = buildSnapshotSection(items, { headingNumber: 9 });
  add("section-builds-children", section.length > 0);

  const doc = new Document({ sections: [{ properties: {}, children: section }] });
  const buf = await Packer.toBuffer(doc);
  const xml = extractDocumentXml(buf);
  add("docx-generated", buf.length > 0 && xml.length > 0, `bytes=${buf.length}`);
  add("docx-has-heading", xml.includes(SNAPSHOT_SECTION_HEADING), "");
  add("docx-has-heading-number", xml.includes(`9. ${SNAPSHOT_SECTION_HEADING}`), "");
  add("docx-has-title", xml.includes("Karaciğer Protokolü") && xml.includes("Uyku Düzeni"), "");
  add("docx-has-provenance-label", xml.includes("Kaynak Modül") && xml.includes("Refleksoloji"), "");
  add("docx-has-selected-content", xml.includes("taban orta bölge çalışması"), "");
  add("docx-has-expert-note", xml.includes("danışana özel uygulama"), "");
  add("docx-source-missing-note", xml.includes("teslim anında korunan snapshot"), "");
  // Teknik tablo/UUID Word'e SIZMAZ (öğeler zaten taşımaz; yine de doğrula).
  add("docx-no-uuid-leak", !new RegExp("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "i").test(xml), "");
  add("docx-no-source-table-leak", !xml.includes("client_stones") && !xml.includes("healing_guides") && !xml.includes("reflexology_protocols"), "");
}

/** ZIP (docx) merkezî dizininden word/document.xml çıkarır (bağımlılıksız). */
function extractDocumentXml(buf: Buffer): string {
  const name = "word/document.xml";
  // End of Central Directory: PK\x05\x06
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) return "";
  let off = buf.readUInt32LE(eocd + 16); // central directory offset
  const count = buf.readUInt16LE(eocd + 10);
  for (let e = 0; e < count; e++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break; // PK\x01\x02
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? data.toString("utf8") : inflateRawSync(data).toString("utf8");
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return "";
}

// ── 5) Teslim rotaları: regresyon-güvenli guard'ı statik denetle ──
function routeGuardChecks(): void {
  const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");

  const clientRoute = read("app/api/clients/[id]/word-report/route.ts");
  add("client-route-imports-section", clientRoute.includes("buildSnapshotSection") && clientRoute.includes("readSnapshotsForDelivery"));
  add("client-route-guarded", /selectionGroupId["\s\S]{0,40}UUID_RE\.test\(selectionGroupId\)/.test(clientRoute));
  add("client-route-report-scope", clientRoute.includes('targetKind: "report"') && clientRoute.includes("targetRef: null"));

  const proto = read("app/api/refleksoloji/protocol-report/route.ts");
  add("proto-route-imports-section", proto.includes("buildSnapshotSection") && proto.includes("readSnapshotsForDelivery"));
  add("proto-route-single-only", proto.includes('exportMode === "single"') && proto.includes('targetKind: "protocol"'));
  add("proto-route-client-ownership", proto.includes(".eq(\"tenant_id\", tenantId)") && proto.includes("Danışan bulunamadı veya erişim yok"));
  add("proto-route-no-protocol-mutation", !/\.from\("reflexology_protocols"\)[\s\S]{0,80}\.(update|insert|delete|upsert)\(/.test(proto));

  const sifa = read("app/api/sifa-rehberi/word-report/route.ts");
  add("sifa-route-imports-section", sifa.includes("buildSnapshotSection") && sifa.includes("readSnapshotsForDelivery"));
  add("sifa-route-single-only", sifa.includes('exportMode === "single"') && sifa.includes('targetKind: "guide"'));
  add("sifa-route-no-guide-mutation", !/\.from\("healing_guides?(_sections)?"\)[\s\S]{0,80}\.(update|insert|delete|upsert)\(/.test(sifa));

  // Snapshot API route ownership + flag gate
  const snapRoute = read("app/api/clients/[id]/yasam-hafizasi/snapshots/route.ts");
  add("snap-route-client-from-url", snapRoute.includes("clientBelongsToTenant") && snapRoute.includes("verifyUserRequest"));
  add("snap-route-flag-gate", snapRoute.includes("flags.yh_enabled") && snapRoute.includes("hasModulePermissionForProfile"));
  add("snap-route-demo-write-block", snapRoute.includes("YH_DEMO_READONLY"));

  // Migration YAZILMADI (Paket 2 mevcut foundation'ı kullanır)
  add("no-new-migration", !readFileSync(join(process.cwd(), "supabase/migrations/20260923000000_yasam_hafizasi_client_memory_core.sql"), "utf8").includes("BF-14 Paket 2"));
}

async function main(): Promise<void> {
  await docxChecks();
  routeGuardChecks();

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-14 P2 DELIVERY HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
