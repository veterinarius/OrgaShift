"use client";

import {
  addEmployee,
  deleteEmployee,
  updateEmployee,
  type Employee,
} from "@/lib/actions/employees";
import { useState, useTransition } from "react";

export function EmployeeList({ employees }: { employees: Employee[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addEmployee(formData);
      if (result?.error) setError(result.error);
    });
  }

  function handleUpdate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateEmployee(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setEditingId(null);
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const result = await deleteEmployee(fd);
      if (result?.error) setError(result.error);
    });
  }

  // Sort: Dr. names first, then alphabetical
  const sorted = [...employees].sort((a, b) => {
    const aDr = a.name.toLowerCase().includes("dr.");
    const bDr = b.name.toLowerCase().includes("dr.");
    if (aDr && !bDr) return -1;
    if (!aDr && bDr) return 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form action={handleAdd} className="flex gap-2">
        <input
          name="name"
          type="text"
          placeholder="Mitarbeitername"
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">
          Noch keine Mitarbeiter hinzugefügt.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {sorted.map((emp) => (
            <li
              key={emp.id}
              className="flex items-center justify-between px-4 py-3"
            >
              {editingId === emp.id ? (
                <form action={handleUpdate} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={emp.id} />
                  <input
                    name="name"
                    type="text"
                    defaultValue={emp.name}
                    autoFocus
                    required
                    className="flex-1 rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Abbrechen
                  </button>
                </form>
              ) : (
                <>
                  <span
                    className={`text-sm ${
                      emp.name.toLowerCase().includes("dr.")
                        ? "font-medium text-blue-700"
                        : ""
                    }`}
                  >
                    {emp.name}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(emp.id)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => handleDelete(emp.id)}
                      disabled={isPending}
                      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Entfernen
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
