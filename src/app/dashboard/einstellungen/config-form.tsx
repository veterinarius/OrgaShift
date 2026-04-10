"use client";

import {
  upsertScheduleConfig,
  type ScheduleConfig,
} from "@/lib/actions/schedule-config";
import { useState, useTransition } from "react";

export function ConfigForm({ config }: { config: ScheduleConfig | null }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await upsertScheduleConfig(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Einstellungen gespeichert.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium">
          Schichten (kommagetrennt)
        </label>
        <input
          name="shift_names"
          type="text"
          defaultValue={
            config?.shift_names?.join(", ") ?? "Frühdienst, Spätdienst"
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          z.B. Frühdienst, Spätdienst, Nachtdienst
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium">
          Tage (kommagetrennt)
        </label>
        <input
          name="day_names"
          type="text"
          defaultValue={
            config?.day_names?.join(", ") ??
            "Montag, Dienstag, Mittwoch, Donnerstag, Freitag"
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">
          Zeilen pro Schicht (kommagetrennt)
        </label>
        <input
          name="row_counts"
          type="text"
          defaultValue={config?.row_counts?.join(", ") ?? "7, 7"}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Anzahl Zeilen für jede Schicht (Reihenfolge wie Schichten)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Startdatum</label>
          <input
            name="start_date"
            type="date"
            defaultValue={config?.start_date ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Enddatum</label>
          <input
            name="end_date"
            type="date"
            defaultValue={config?.end_date ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "Wird gespeichert..." : "Speichern"}
      </button>
    </form>
  );
}
