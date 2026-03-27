"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Batches() {
  const [batches, setBatches] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const fetchData = async () => {
    const { data: userData } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userData.user?.id)
      .single();

    let query = supabase.from("batches").select("*");

    if (profile.role === "teacher") {
      query = query.eq("teacher_id", userData.user?.id);
    }

    const { data } = await query;
    setBatches(data || []);

    const { data: teachersData } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "teacher");

    setTeachers(teachersData || []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createBatch = async () => {
    await supabase.from("batches").insert({
      name,
      teacher_id: teacherId,
    });

    fetchData();
  };

  return (
    <div className="p-10">
      <h1 className="text-xl mb-4">Batches</h1>

      <input placeholder="Batch name" onChange={(e) => setName(e.target.value)} className="border p-2"/>

      <select onChange={(e) => setTeacherId(e.target.value)} className="border p-2 ml-2">
        <option>Select Teacher</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>{t.email}</option>
        ))}
      </select>

      <button onClick={createBatch} className="bg-black text-white p-2 ml-2">Create</button>

      <div className="mt-6">
        {batches.map((b) => (
          <div key={b.id} className="border p-2 mt-2">
            {b.name}
            <a href={`/attendance/${b.id}`} className="ml-4 text-blue-500">Take Attendance</a>
          </div>
        ))}
      </div>
    </div>
  );
}