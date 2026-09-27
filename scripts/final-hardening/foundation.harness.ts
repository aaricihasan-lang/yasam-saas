/**
 * FAZ1 Final Hardening — ortak yardımcı testleri (saf, DB/ağ yok).
 * Çalıştırma: npx tsx scripts/final-hardening/foundation.harness.ts
 * Farklı süreç saat dilimlerinde de çalıştırılır (TZ=UTC, TZ=America/Los_Angeles).
 */
import assert from "node:assert/strict";
import {
  formatInstantDate,
  formatInstantDateTime,
  formatInstantTime,
  formatDateOnly,
  formatDateLoose,
  zonedDayKey,
  todayInZone,
  reportFileDate,
  reportGeneratedLabel,
  resolveReportTimeZone,
  calendarDayDiff,
  looseDayKey,
  DEFAULT_TIME_ZONE,
} from "../../lib/time/reportTime";
import { pruneSelection, visibleSelection } from "../../lib/ui/selection";
import { buildNameListLines, buildBulkDeleteMessage } from "../../lib/ui/deleteConfirmMessage";
import { composeDeleteMessage } from "../../hooks/useDeleteConfirm";
import { createSubmitLock, SubmitTimeoutError } from "../../lib/ui/submitLock";
import { filenameFromContentDisposition } from "../../lib/http/downloadResponse";
import { normalizeConfirmText } from "../../components/ui/ConfirmProvider";
import { wellnessNote, expertDisplayName } from "../../lib/docx/reportDisclaimer";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

(async () => {
  // ── reportTime ────────────────────────────────────────────────────────────
  await t("instant datetime Istanbul", () =>
    assert.equal(formatInstantDateTime("2026-09-26T22:22:00Z"), "27.09.2026 01:22"));
  await t("instant time 10:00", () => assert.equal(formatInstantTime("2026-09-27T07:00:00Z"), "10:00"));
  await t("instant date long", () =>
    assert.equal(formatInstantDate("2026-09-26T21:30:00Z", { style: "long" }), "27 Eylül 2026"));
  await t("instant +00:00 suffix", () =>
    assert.equal(formatInstantDateTime("2026-01-02T10:23:45.123+00:00"), "02.01.2026 13:23"));
  await t("zonedDayKey crosses midnight", () => assert.equal(zonedDayKey("2026-09-26T22:30:00Z"), "2026-09-27"));
  await t("reportFileDate at 01:15 TR", () =>
    assert.equal(reportFileDate(undefined, new Date("2026-09-26T22:15:00Z")), "2026-09-27"));
  await t("todayInZone", () => assert.equal(todayInZone(undefined, new Date("2026-09-26T21:00:00Z")), "2026-09-27"));
  await t("generated label", () =>
    assert.equal(reportGeneratedLabel(undefined, new Date("2026-09-26T22:15:00Z")), "27 Eylül 2026"));
  await t("date-only never shifts (NY)", () =>
    assert.equal(formatDateOnly("2026-09-27", { locale: "tr-TR" }), "27.09.2026"));
  await t("date-only long", () => assert.equal(formatDateOnly("2026-09-27", { style: "long" }), "27 Eylül 2026"));
  await t("date-only DMY text", () => assert.equal(formatDateOnly("7.9.2026"), "07.09.2026"));
  await t("date-only invalid → fallback", () => assert.equal(formatDateOnly("2026-02-30", { fallback: "—" }), "—"));
  await t("loose EXP-011 timestamptz", () => assert.equal(formatDateLoose("2026-01-02T10:23:45.123+00:00"), "02.01.2026"));
  await t("loose date-only", () => assert.equal(formatDateLoose("2026-01-02"), "02.01.2026"));
  await t("loose garbage keeps text", () => assert.equal(formatDateLoose("Ocak başı"), "Ocak başı"));
  await t("loose null fallback", () => assert.equal(formatDateLoose(null, { fallback: "-" }), "-"));
  await t("instant invalid no throw", () => assert.equal(formatInstantDateTime("not-a-date", { fallback: "?" }), "?"));
  await t("tz resolve invalid → default", () =>
    assert.equal(resolveReportTimeZone({ userTz: "Mars/Olympus" }), DEFAULT_TIME_ZONE));
  await t("tz resolve valid user", () => assert.equal(resolveReportTimeZone({ userTz: "Europe/London" }), "Europe/London"));
  await t("other tz", () =>
    assert.equal(formatInstantTime("2026-09-27T07:00:00Z", { timeZone: "Europe/London" }), "08:00"));
  await t("calendarDayDiff", () => assert.equal(calendarDayDiff("2026-09-27", "2026-10-01"), 4));
  await t("looseDayKey date-only", () => assert.equal(looseDayKey("27.09.2026"), "2026-09-27"));

  // ── selection ─────────────────────────────────────────────────────────────
  await t("prune keeps reference when unchanged", () => {
    const s = new Set(["a", "b"]);
    assert.equal(pruneSelection(s, ["a", "b", "c"]), s);
  });
  await t("prune removes hidden", () => {
    const s = new Set(["a", "b"]);
    assert.deepEqual([...pruneSelection(s, ["b", "c"])], ["b"]);
  });
  await t("visibleSelection intersection", () =>
    assert.deepEqual(visibleSelection(new Set(["a", "x"]), ["x", "y", "a"]), ["x", "a"]));

  // ── delete confirm ────────────────────────────────────────────────────────
  await t("name list 15 → 10 + ve 5", () => {
    const lines = buildNameListLines(Array.from({ length: 15 }, (_, i) => `Ad ${i}`));
    assert.equal(lines.length, 11);
    assert.equal(lines[10], "• ve 5 kayıt daha");
  });
  await t("bulk message single", () =>
    assert.match(buildBulkDeleteMessage({ noun: "danışan", names: ["Ayşe Yılmaz"], total: 1 }), /Ayşe Yılmaz/));
  await t("compose adds irreversible", () =>
    assert.match(composeDeleteMessage({ message: "Silinsin mi?" }), /geri alınamaz/));
  await t("compose skips when reversible", () =>
    assert.doesNotMatch(composeDeleteMessage({ message: "Gizlensin mi?", irreversible: false }), /geri alınamaz/));
  await t("compose no duplicate", () =>
    assert.equal(composeDeleteMessage({ message: "Bu işlem geri alınamaz." }).match(/geri alınamaz/g)?.length, 1));
  await t("confirm text tr fold", () => assert.equal(normalizeConfirmText("  İĞDIR  Işık "), normalizeConfirmText("iğdır ışık")));

  // ── submit lock ───────────────────────────────────────────────────────────
  await t("lock blocks concurrent", async () => {
    const lock = createSubmitLock(1000);
    let calls = 0;
    const slow = () => new Promise<number>((r) => setTimeout(() => r(++calls), 30));
    const [a, b] = await Promise.all([lock.run(slow), lock.run(slow)]);
    assert.equal(calls, 1);
    assert.equal(a, 1);
    assert.equal(b, undefined);
  });
  await t("lock released on throw", async () => {
    const lock = createSubmitLock(1000);
    await assert.rejects(lock.run(async () => { throw new Error("x"); }));
    assert.equal(lock.isLocked(), false);
    assert.equal(await lock.run(async () => 5), 5);
  });
  await t("lock timeout releases + aborts", async () => {
    const lock = createSubmitLock(20);
    let aborted = false;
    await assert.rejects(
      lock.run((signal) => new Promise((r) => { signal.addEventListener("abort", () => { aborted = true; }); setTimeout(r, 200); })),
      SubmitTimeoutError,
    );
    assert.equal(aborted, true);
    assert.equal(lock.isLocked(), false);
  });

  // ── download filename ─────────────────────────────────────────────────────
  await t("cd filename*", () =>
    assert.equal(filenameFromContentDisposition(`attachment; filename="a.docx"; filename*=UTF-8''%C3%B6rnek-2026-09-27.docx`), "örnek-2026-09-27.docx"));
  await t("cd plain", () => assert.equal(filenameFromContentDisposition(`attachment; filename="rapor.docx"`), "rapor.docx"));
  await t("cd none", () => assert.equal(filenameFromContentDisposition(null), null));

  // ── disclaimer ────────────────────────────────────────────────────────────
  await t("wellness note text", () => assert.match(wellnessNote("sifa").full, /tıbbi tanı veya tedavinin yerine geçmez/));
  await t("expert name", () => assert.equal(expertDisplayName({ full_name: "  Ayşe  Kaya " }), "Ayşe Kaya"));
  await t("expert name null", () => assert.equal(expertDisplayName({ full_name: " " }), null));

  console.log(`foundation harness (TZ=${process.env.TZ ?? "system"}): ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
})();
