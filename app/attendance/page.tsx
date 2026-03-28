"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/authContext";
import AuthGuard from "@/components/AuthGuard";
import { useToast } from "@/lib/toast";

interface Batch {
  id: string;
  name: string;
  teacher_id: string;
  profiles?: { name: string | null; email: string } | null;
}

interface Student {
  id: string;
  name: string;
  phone: string;
}

type AttendanceMap = Record<string, "present" | "absent">;

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [sendingSMS, setSendingSMS] = useState(false);

  useEffect(() => {
    const loadBatches = async () => {
      const query = supabase
        .from("batches")
        .select("*, profiles(name, email)")
        .order("name");
      const { data } = await query;
      setBatches(data || []);
      if (data && data.length > 0) setSelectedBatch(data[0].id);
    };
    loadBatches();
  }, []);

  useEffect(() => {
    if (!selectedBatch) return;
    const load = async () => {
      setLoadingStudents(true);

      const { data: sbData } = await supabase
        .from("student_batches")
        .select("students(id, name, phone)")
        .eq("batch_id", selectedBatch);

      const studentsList: Student[] = (sbData || [])
        .map((r: any) => r.students)
        .filter(Boolean);
      setStudents(studentsList);

      const { data: attData } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("batch_id", selectedBatch)
        .eq("date", date);

      const map: AttendanceMap = {};
      (attData || []).forEach((a: any) => {
        map[a.student_id] = a.status;
      });
      setAttendanceMap(map);
      setLoadingStudents(false);
    };
    load();
  }, [selectedBatch, date]);

  const mark = async (studentId: string, status: "present" | "absent") => {
    setSaving(studentId);
    const existing = attendanceMap[studentId];

    if (status === attendanceMap[studentId]) {
      // Toggle off — delete
      await supabase
        .from("attendance")
        .delete()
        .eq("student_id", studentId)
        .eq("batch_id", selectedBatch)
        .eq("date", date);

      setAttendanceMap((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } else if (existing) {
      await supabase
        .from("attendance")
        .update({ status })
        .eq("student_id", studentId)
        .eq("batch_id", selectedBatch)
        .eq("date", date);
      setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
    } else {
      const { error } = await supabase.from("attendance").insert({
        student_id: studentId,
        batch_id: selectedBatch,
        date,
        status,
      });
      if (error) toast(error.message, "error");
      else setAttendanceMap((prev) => ({ ...prev, [studentId]: status }));
    }

    setSaving(null);
  };

  const markAll = async (status: "present" | "absent") => {
    const toMark = students.filter((s) => attendanceMap[s.id] !== status);
    for (const s of toMark) await mark(s.id, status);
    toast(`All students marked as ${status}`, "success");
  };

  const sendAbsenceSMS = async () => {
    const absentCount = students.filter(
      (s) => attendanceMap[s.id] === "absent"
    ).length;

    if (absentCount === 0) {
      toast("No absent students to notify.", "error");
      return;
    }

    setSendingSMS(true);
    try {
      const res = await fetch("/api/send-absence-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: selectedBatch, date }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || "Failed to send SMS", "error");
      } else if (data.sent === 0 && data.skipped > 0) {
        toast(
          `No SMS sent — ${data.skipped} student(s) have no phone number.`,
          "error"
        );
      } else {
        toast(
          `SMS sent to ${data.sent} student(s)${data.failed > 0 ? `, ${data.failed} failed` : ""}${data.skipped > 0 ? `, ${data.skipped} skipped (no phone)` : ""}.`,
          "success"
        );
      }
    } catch {
      toast("Network error while sending SMS.", "error");
    } finally {
      setSendingSMS(false);
    }
  };

  const presentCount = students.filter(
    (s) => attendanceMap[s.id] === "present"
  ).length;
  const absentCount = students.filter(
    (s) => attendanceMap[s.id] === "absent"
  ).length;
  const unmarkedCount = students.length - presentCount - absentCount;

  const selectedBatchObj = batches.find((b) => b.id === selectedBatch);

  return (
    <AuthGuard>
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
        <p className="page-subtitle">Mark daily attendance for your batches</p>
      </div>

      <div className="page-body fade-in">
        {/* Controls */}
        <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
          <div className="form-row">
            <div className="form-field">
              <label>Batch</label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Date</label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <button
                className="btn btn-success btn-sm"
                onClick={() => markAll("present")}
              >
                ✓ All Present
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => markAll("absent")}
              >
                ✕ All Absent
              </button>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        {students.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span className="badge badge-green">✓ Present: {presentCount}</span>
            <span className="badge badge-red">✕ Absent: {absentCount}</span>
            <span className="badge badge-gray">? Unmarked: {unmarkedCount}</span>
            {selectedBatchObj && (
              <span className="badge badge-blue">
                {selectedBatchObj.name} •{" "}
                {selectedBatchObj.profiles?.name ||
                  selectedBatchObj.profiles?.email ||
                  "No teacher"}
              </span>
            )}

            {/* SMS button — shown when there are absent students */}
            {absentCount > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={sendAbsenceSMS}
                disabled={sendingSMS}
                style={{ marginLeft: "auto" }}
              >
                {sendingSMS ? (
                  <>
                    <span className="spinner" /> Sending SMS…
                  </>
                ) : (
                  <>📲 Send Absence SMS ({absentCount})</>
                )}
              </button>
            )}
          </div>
        )}

        {/* Students */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {loadingStudents
                ? "Loading…"
                : `${students.length} student${students.length !== 1 ? "s" : ""}`}
            </div>
          </div>

          {loadingStudents ? (
            <div className="empty-state">
              <span className="spinner" />
            </div>
          ) : students.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">No students in this batch</div>
            </div>
          ) : (
            <div style={{ padding: "12px" }} className="attendance-grid">
              {students.map((s) => {
                const status = attendanceMap[s.id];
                const isSaving = saving === s.id;

                return (
                  <div key={s.id} className="attendance-row">
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "var(--bg-2)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text-2)",
                        flexShrink: 0,
                      }}
                    >
                      {s.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="attendance-name">
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      {s.phone ? (
                        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                          {s.phone}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--amber)",
                            opacity: 0.8,
                          }}
                        >
                          No phone — SMS will be skipped
                        </div>
                      )}
                    </div>

                    {isSaving ? (
                      <span className="spinner" />
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className={`attend-btn ${status === "present" ? "present" : "present-inactive"}`}
                          onClick={() => mark(s.id, "present")}
                        >
                          ✓ Present
                        </button>
                        <button
                          className={`attend-btn ${status === "absent" ? "absent" : "absent-inactive"}`}
                          onClick={() => mark(s.id, "absent")}
                        >
                          ✕ Absent
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
