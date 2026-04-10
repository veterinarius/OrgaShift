"use server";

/*
  Required Supabase SQL (run once in SQL editor):

  create table if not exists schedule_entries (
    id          uuid        default gen_random_uuid() primary key,
    user_id     uuid        references auth.users not null,
    config_id   uuid        references schedule_configs not null,
    shift_index integer     not null,
    row_index   integer     not null,
    col_index   integer     not null,
    content     text        not null default '',
    bg_color    text,
    updated_at  timestamptz default now(),
    unique(config_id, shift_index, row_index, col_index)
  );

  alter table schedule_entries enable row level security;

  create policy "Users can manage own entries"
    on schedule_entries for all
    using (auth.uid() = user_id);

  -- Also add remarks column to schedule_configs:
  alter table schedule_configs add column if not exists remarks text;
*/

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ScheduleEntry = {
  shift_index: number;
  row_index: number;
  col_index: number;
  content: string;
  bg_color: string | null;
};

export async function getScheduleEntries(
  configId: string
): Promise<ScheduleEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_entries")
    .select("shift_index, row_index, col_index, content, bg_color")
    .eq("config_id", configId);
  return data ?? [];
}

export async function upsertCell(
  configId: string,
  shiftIndex: number,
  rowIndex: number,
  colIndex: number,
  content: string,
  bgColor: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase.from("schedule_entries").upsert(
    {
      user_id: user.id,
      config_id: configId,
      shift_index: shiftIndex,
      row_index: rowIndex,
      col_index: colIndex,
      content,
      bg_color: bgColor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "config_id,shift_index,row_index,col_index" }
  );

  if (error) return { error: error.message };
  revalidatePath("/dashboard/dienstplan");
}

export async function upsertRemarks(configId: string, remarks: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase
    .from("schedule_configs")
    .update({ remarks, updated_at: new Date().toISOString() })
    .eq("id", configId);

  if (error) return { error: error.message };
}
