// I18N rapor golden (grup C+D) — `@/lib/dogaltas/reportAuth` yerine sahte kapı (DB/oturum YOK).
"use strict";
const guard = () => globalThis.__RAB_GUARD__;
exports.requireDogaltasReportAccess = async () => guard();
