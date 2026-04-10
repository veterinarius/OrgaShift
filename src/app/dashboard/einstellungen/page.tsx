import { getScheduleConfig } from "@/lib/actions/schedule-config";
import { ConfigForm } from "./config-form";

export default async function EinstellungenPage() {
  const config = await getScheduleConfig();

  return (
    <div>
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <p className="mt-1 text-sm text-gray-600">
        Konfigurieren Sie Schichten, Tage und den Planungszeitraum.
      </p>
      <div className="mt-6 max-w-lg">
        <ConfigForm config={config} />
      </div>
    </div>
  );
}
