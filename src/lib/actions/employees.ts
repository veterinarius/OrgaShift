"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Employee = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export async function getEmployees(): Promise<Employee[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return data ?? [];
}

export async function addEmployee(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name darf nicht leer sein" };

  // Get max sort_order
  const { data: existing } = await supabase
    .from("employees")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;

  const { error } = await supabase.from("employees").insert({
    user_id: user.id,
    name,
    sort_order: nextOrder,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/mitarbeiter");
}

export async function updateEmployee(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name darf nicht leer sein" };

  const { error } = await supabase
    .from("employees")
    .update({ name })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/mitarbeiter");
}

export async function deleteEmployee(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;

  const { error } = await supabase.from("employees").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/mitarbeiter");
}
