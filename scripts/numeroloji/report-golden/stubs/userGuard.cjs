// Numeroloji rapor golden — `@/lib/auth/userGuard` yerine sahte kapı (DB/oturum YOK).
// Guard harness tarafından `globalThis.__NRG_GUARD__` ile verilir.
"use strict";
const guard = () => globalThis.__NRG_GUARD__;
exports.requireModuleAccess = async () => guard();
exports.verifyUserRequest = async () => guard();
exports.requireUser = async () => guard();
