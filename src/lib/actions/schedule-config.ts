"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ScheduleConfig = {
  id: string;
  shift_names: string[];
  day_names: string[];
  row_counts: number[];
  start_date: string | null;
  end_date: string | null;
  remarks: string | null;
};

const DEFAULT_SHIFTS = ["Frühdienst", "Spätdienst"];
const DEFAULT_DAYS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
];
const DEFAULT_ROW_COUNTS = [7, 7];

export async function getScheduleConfig(): Promise<ScheduleConfig | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("schedule_configs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function upsertScheduleConfig(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet" };

  const shiftNamesRaw = formData.get("shift_names") as string;
  const dayNamesRaw = formData.get("day_names") as string;
  const rowCountsRaw = formData.get("row_counts") as string;
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;

  const shift_names = shiftNamesRaw
    ? shiftNamesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_SHIFTS;
  const day_names = dayNamesRaw
    ? dayNamesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_DAYS;
  const row_counts = rowCountsRaw
    ? rowCountsRaw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
    : DEFAULT_ROW_COUNTS;

  // Pad row_counts to match shift_names length
  while (row_counts.length < shift_names.length) {
    row_counts.push(7);
  }

  // Check if config exists
  const existing = await getScheduleConfig();

  if (existing) {
    const { error } = await supabase
      .from("schedule_configs")
      .update({
        shift_names,
        day_names,
        row_counts,
        start_date: startDate,
        end_date: endDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("schedule_configs").insert({
      user_id: user.id,
      shift_names,
      day_names,
      row_counts,
      start_date: startDate,
      end_date: endDate,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/dashboard/einstellungen");
  revalidatePath("/dashboard/dienstplan");
}
