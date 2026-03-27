import { supabase } from "./supabaseClient";

export async function getCurrentUser() {
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  return {
    user: userData.user,
    profile,
  };
}