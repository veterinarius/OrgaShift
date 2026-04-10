import { getScheduleConfig } from "@/lib/actions/schedule-config";
import { getScheduleEntries } from "@/lib/actions/schedule-entries";
import { ScheduleGrid } from "./schedule-grid";

export default async function DienstplanPage() {
  const config = await getScheduleConfig();

  if (!config) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Dienstplan</h1>
        <p className="mt-4 text-sm text-gray-500">
          Bitte zuerst in{" "}
          <a
            href="/dashboard/einstellungen"
            className="text-blue-600 underline"
          >
            Einstellungen
          </a>{" "}
          Schichten und Tage konfigurieren.
        </p>
      </div>
    );
  }

  const entries = await getScheduleEntries(config.id);

  return (
    <ScheduleGrid
      config={config}
      entries={entries}
      configId={config.id}
    />
  );
}
