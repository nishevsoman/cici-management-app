"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [batchId, setBatchId] = useState("");

  const fetchData = async () => {
    const { data: studentsData } = await supabase.from("students").select("*");
    setStudents(studentsData || []);

    const { data: batchesData } = await supabase.from("batches").select("*");
    setBatches(batchesData || []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createStudent = async () => {
    const { data: student } = await supabase
      .from("students")
      .insert({ name, phone })
      .select()
      .single();

    if (batchId) {
      await supabase.from("student_batches").insert({
        student_id: student.id,
        batch_id: batchId,
      });
    }

    fetchData();
  };

  return (
    <div className="p-10">
      <h1 className="text-xl mb-4">Students</h1>

      <input
        placeholder="Name"
        onChange={(e) => setName(e.target.value)}
        className="border p-2"
      />

      <input
        placeholder="Phone"
        onChange={(e) => setPhone(e.target.value)}
        className="border p-2 ml-2"
      />

      <select
        onChange={(e) => setBatchId(e.target.value)}
        className="border p-2 ml-2"
      >
        <option>Select Batch</option>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <button
        onClick={createStudent}
        className="bg-black text-white p-2 ml-2"
      >
        Add
      </button>

      <div className="mt-6">
        {students.map((s) => (
          <div key={s.id} className="border p-2 mt-2">
            {s.name} ({s.phone})
          </div>
        ))}
      </div>
    </div>
  );
}