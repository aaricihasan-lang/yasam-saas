// I18N rapor golden (grup C+D) — `@/lib/auth/requireUser` yerine sahte kapı (DB/oturum YOK).
"use strict";
const guard = () => globalThis.__RAB_GUARD__;
exports.requireDigitalContentUser = async () => ({ ok: true, user: guard() });
