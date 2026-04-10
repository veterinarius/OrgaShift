import { getEmployees } from "@/lib/actions/employees";
import { EmployeeList } from "./employee-list";

export default async function MitarbeiterPage() {
  const employees = await getEmployees();

  return (
    <div>
      <h1 className="text-2xl font-bold">Mitarbeiter</h1>
      <p className="mt-1 text-sm text-gray-600">
        Verwalten Sie Ihre Mitarbeiter für die Dienstplanung.
      </p>
      <div className="mt-6">
        <EmployeeList employees={employees} />
      </div>
    </div>
  );
}
