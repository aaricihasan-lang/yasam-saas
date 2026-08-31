"use client";
/**
 * Yeni beslenme planı oluşturma modalı. createPlan çağırır; end >= start istemci
 * doğrulaması (daysBetween). Başarıda onCreated(plan) tetiklenir.
 */
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { createPlan, type Plan } from "@/lib/beslenme/planClient";
import { cleanDate, daysBetween } from "@/lib/beslenme/planContracts";
import { Field, PrimaryButton, GhostButton, StatusMessage, TextInput } from "../../_components/primitives";
import { Modal } from "./planUi";
import { friendlyPlanError } from "./planFormat";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewPlanDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (plan: Plan) => void;
}) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const t = title.trim();
    if (!t) {
      setErr("Plan adı zorunludur.");
      return;
    }
    const s = cleanDate(start);
    const e = cleanDate(end);
    if (!s || !e) {
      setErr("Geçerli başlangıç ve bitiş tarihi girin.");
      return;
    }
    if (daysBetween(s, e) < 0) {
      setErr("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
      return;
    }
    let dailyTarget: number | null = null;
    const rawTarget = target.trim().replace(",", ".");
    if (rawTarget) {
      const n = Number(rawTarget);
      if (!Number.isFinite(n) || n <= 0) {
        setErr("Günlük kalori hedefi geçerli bir sayı olmalı.");
        return;
      }
      dailyTarget = Math.round(n);
    }
    setSaving(true);
    const r = await createPlan({ title: t, start_date: s, end_date: e, daily_energy_target: dailyTarget });
    setSaving(false);
    if (r.ok && r.data?.plan) {
      onCreated(r.data.plan);
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Yeni Plan" subtitle="Bir beslenme planı oluşturun">
      <div className="flex flex-col gap-3">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}

        <Field label="Plan Adı" required>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn: Haftalık Denge Planı"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Başlangıç Tarihi" required>
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Bitiş Tarihi" required>
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} />
          </Field>
        </div>

        <Field label="Günlük Kalori Hedefi" hint="opsiyonel — kcal cinsinden">
          <TextInput
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Örn: 2000"
          />
        </Field>

        <div className="mt-1 flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Vazgeç</GhostButton>
          <PrimaryButton icon={<CalendarPlus className="h-4 w-4" />} loading={saving} onClick={() => void submit()}>
            Plan Oluştur
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
