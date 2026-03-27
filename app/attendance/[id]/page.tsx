"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Attendance({ params }: any) {
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<any>({});

  const today = new Date().toISOString().split("T")[0];

  const fetchData = async () => {
    // get students in this batch
    const { data: studentData } = await supabase
      .from("student_batches")
      .select("students(*)")
      .eq("batch_id", params.id);

    const studentsList = studentData.map((d: any) => d.students);
    setStudents(studentsList);

    // get today's attendance
    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("*")
      .eq("batch_id", params.id)
      .eq("date", today);

    // map: student_id -> status
    const map: any = {};
    attendanceData?.forEach((a) => {
      map[a.student_id] = a.status;
    });

    setAttendanceMap(map);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const mark = async (studentId: string, status: string) => {
    const existing = attendanceMap[studentId];

    if (existing) {
      // UPDATE
      await supabase
        .from("attendance")
        .update({ status })
        .eq("student_id", studentId)
        .eq("batch_id", params.id)
        .eq("date", today);
    } else {
      // INSERT
      await supabase.from("attendance").insert({
        student_id: studentId,
        batch_id: params.id,
        date: today,
        status,
      });
    }

    fetchData(); // refresh UI
  };

  return (
    <div className="p-10">
      <h1 className="text-xl mb-4">Attendance (Today)</h1>

      {students.map((s) => {
        const status = attendanceMap[s.id];

        return (
          <div key={s.id} className="border p-2 mt-2 flex justify-between">
            <span>{s.name}</span>

            <div>
              <button
                onClick={() => mark(s.id, "present")}
                className={`p-1 mr-2 ${
                  status === "present" ? "bg-green-700" : "bg-green-500"
                } text-white`}
              >
                Present
              </button>

              <button
                onClick={() => mark(s.id, "absent")}
                className={`p-1 ${
                  status === "absent" ? "bg-red-700" : "bg-red-500"
                } text-white`}
              >
                Absent
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}