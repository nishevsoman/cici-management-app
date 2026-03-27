"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      setUser(userData.user);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .single();

      setProfile(profileData);
    };

    load();
  }, []);

  if (!user) return <div>Loading...</div>;

  return (
    <div className="p-10">
      <h1 className="text-xl">Dashboard</h1>
      <p>Email: {user.email}</p>
      <p>Role: {profile?.role}</p>
    </div>
  );
}