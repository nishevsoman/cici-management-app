"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGuard from "@/components/AuthGuard";
import { useToast } from "@/lib/toast";

interface Batch {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  phone: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent";
  student_id: string;
  batch_id: string;
  students: { name: string; phone: string } | null;
  batches: { name: string } | null;
}

interface StudentSummary {
  student: Student;
  present: number;
  absent: number;
  total: number;
  percentage: number;
  records: AttendanceRecord[];
}

export default function AttendanceHistoryPage() {
  const toast = useToast();

  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const [viewMode, setViewMode] = useState<"summary" | "detail">("summary");
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Load batches
  useEffect(() => {
    supabase.from("batches").select("id, name").order("name").then(({ data }) => {
      setBatches(data || []);
      if (data && data.length > 0) setSelectedBatch(data[0].id);
    });
  }, []);

  // Load students when batch changes
  useEffect(() => {
    if (!selectedBatch) return;
    supabase
      .from("student_batches")
      .select("students(id, name, phone)")
      .eq("batch_id", selectedBatch)
      .then(({ data }) => {
        const list: Student[] = (data || []).map((r: any) => r.students).filter(Boolean);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(list);
        setSelectedStudent("all");
      });
  }, [selectedBatch]);

  const fetchRecords = useCallback(async () => {
    if (!selectedBatch) return;
    setLoading(true);
    let query = supabase
      .from("attendance")
      .select("id, date, status, student_id, batch_id, students(name, phone), batches(name)")
      .eq("batch_id", selectedBatch)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: false });

    if (selectedStudent !== "all") {
      query = query.eq("student_id", selectedStudent);
    }

    const { data, error } = await query;
    if (error) toast(error.message, "error");
    setRecords((data as any) || []);
    setHasFetched(true);
    setLoading(false);
  }, [selectedBatch, selectedStudent, dateFrom, dateTo, toast]);

  // Build per-student summaries
  const summaries: StudentSummary[] = (() => {
    const map: Record<string, StudentSummary> = {};
    records.forEach(r => {
      if (!map[r.student_id]) {
        const s = students.find(s => s.id === r.student_id) ??
          { id: r.student_id, name: r.students?.name ?? "Unknown", phone: r.students?.phone ?? "" };
        map[r.student_id] = { student: s, present: 0, absent: 0, total: 0, percentage: 0, records: [] };
      }
      map[r.student_id].records.push(r);
      map[r.student_id].total++;
      if (r.status === "present") map[r.student_id].present++;
      else map[r.student_id].absent++;
    });
    return Object.values(map).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    })).sort((a, b) => a.student.name.localeCompare(b.student.name));
  })();

  // Unique dates for the detail table
  const uniqueDates = [...new Set(records.map(r => r.date))].sort((a, b) => b.localeCompare(a));

  // Per-student record map for detail view
  const studentDateMap: Record<string, Record<string, "present" | "absent">> = {};
  records.forEach(r => {
    if (!studentDateMap[r.student_id]) studentDateMap[r.student_id] = {};
    studentDateMap[r.student_id][r.date] = r.status;
  });

  const batchName = batches.find(b => b.id === selectedBatch)?.name ?? "";

  // ── PDF Generation ──
  const generatePDF = async () => {
    if (!hasFetched || records.length === 0) {
      toast("No data to export. Fetch records first.", "error");
      return;
    }
    setGeneratingPDF(true);
    try {
      const res = await fetch("/api/attendance-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName,
          dateFrom,
          dateTo,
          summaries: summaries.map(s => ({
            name: s.student.name,
            phone: s.student.phone,
            present: s.present,
            absent: s.absent,
            total: s.total,
            percentage: s.percentage,
            records: s.records.map(r => ({ date: r.date, status: r.status })),
          })),
          uniqueDates,
          studentDateMap,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast(err.error || "PDF generation failed", "error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${batchName.replace(/\s+/g, "_")}_${dateFrom}_to_${dateTo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast("PDF downloaded successfully", "success");
    } catch (e: any) {
      toast(e.message || "Failed to generate PDF", "error");
    } finally {
      setGeneratingPDF(false);
    }
  };

  const totalPresent = summaries.reduce((s, r) => s + r.present, 0);
  const totalAbsent = summaries.reduce((s, r) => s + r.absent, 0);
  const avgPct = summaries.length > 0
    ? Math.round(summaries.reduce((s, r) => s + r.percentage, 0) / summaries.length)
    : 0;

  return (
    <AuthGuard>
      <div className="page-header">
        <h1 className="page-title">Attendance History</h1>
        <p className="page-subtitle">View, filter and export attendance records as PDF</p>
      </div>

      <div className="page-body fade-in">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-field">
              <label>Batch</label>
              <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)}>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>Student</label>
              <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
                <option value="all">All Students</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>From</label>
              <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} />
            </div>

            <div className="form-field">
              <label>To</label>
              <input type="date" value={dateTo} min={dateFrom} max={new Date().toISOString().split("T")[0]} onChange={e => setDateTo(e.target.value)} />
            </div>

            <button className="btn btn-primary" onClick={fetchRecords} disabled={loading || !selectedBatch}>
              {loading ? <><span className="spinner" /> Loading…</> : "Fetch Records"}
            </button>

            {hasFetched && records.length > 0 && (
              <button className="btn btn-secondary" onClick={generatePDF} disabled={generatingPDF}>
                {generatingPDF ? <><span className="spinner" /> Generating…</> : "⬇ Download PDF"}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {hasFetched && summaries.length > 0 && (
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card blue">
              <div className="stat-icon">👥</div>
              <div className="stat-value">{summaries.length}</div>
              <div className="stat-label">Students</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-icon">📅</div>
              <div className="stat-value">{uniqueDates.length}</div>
              <div className="stat-label">Days Tracked</div>
            </div>
            <div className="stat-card green">
              <div className="stat-icon">✓</div>
              <div className="stat-value">{totalPresent}</div>
              <div className="stat-label">Present Entries</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon">✕</div>
              <div className="stat-value">{totalAbsent}</div>
              <div className="stat-label">Absent Entries</div>
            </div>
            <div className="stat-card amber">
              <div className="stat-icon">📊</div>
              <div className="stat-value">{avgPct}%</div>
              <div className="stat-label">Avg Attendance</div>
            </div>
          </div>
        )}

        {/* View tabs */}
        {hasFetched && summaries.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="tab-bar">
              <button className={`tab ${viewMode === "summary" ? "active" : ""}`} onClick={() => setViewMode("summary")}>
                Summary View
              </button>
              <button className={`tab ${viewMode === "detail" ? "active" : ""}`} onClick={() => setViewMode("detail")}>
                Detail View
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              {batchName} · {dateFrom} → {dateTo}
            </div>
          </div>
        )}

        {/* ── SUMMARY VIEW ── */}
        {hasFetched && viewMode === "summary" && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">{summaries.length} Student{summaries.length !== 1 ? "s" : ""}</div>
            </div>
            {summaries.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">No records found for this period</div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Total Days</th>
                      <th>Attendance %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map(({ student, present, absent, total, percentage }) => (
                      <tr key={student.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: "var(--bg-3)", border: "1px solid var(--border)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 700, fontSize: 12, color: "var(--text-2)", flexShrink: 0,
                            }}>
                              {student.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{student.name}</div>
                              {student.phone && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{student.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-green">✓ {present}</span>
                        </td>
                        <td>
                          <span className="badge badge-red">✕ {absent}</span>
                        </td>
                        <td style={{ fontFamily: "DM Mono, monospace", fontSize: 13 }}>{total}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {/* Mini progress bar */}
                            <div style={{
                              width: 80, height: 6, background: "var(--bg-3)",
                              borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)",
                            }}>
                              <div style={{
                                width: `${percentage}%`, height: "100%",
                                background: percentage >= 75 ? "var(--green)" : percentage >= 50 ? "var(--amber)" : "var(--red)",
                                borderRadius: 3, transition: "width 0.4s ease",
                              }} />
                            </div>
                            <span style={{
                              fontFamily: "DM Mono, monospace", fontSize: 13, fontWeight: 600,
                              color: percentage >= 75 ? "var(--green)" : percentage >= 50 ? "var(--amber)" : "var(--red)",
                            }}>
                              {percentage}%
                            </span>
                          </div>
                        </td>
                        <td>
                          {percentage >= 75
                            ? <span className="badge badge-green">Good</span>
                            : percentage >= 50
                            ? <span className="badge badge-amber">Low</span>
                            : <span className="badge badge-red">Critical</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── DETAIL VIEW ── */}
        {hasFetched && viewMode === "detail" && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Day-by-day Breakdown</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                <span className="badge badge-green" style={{ marginRight: 6 }}>P = Present</span>
                <span className="badge badge-red">A = Absent</span>
              </div>
            </div>
            {summaries.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">No records found</div>
              </div>
            ) : (
              <div className="table-wrap" style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 160, position: "sticky", left: 0, background: "var(--bg-2)", zIndex: 2 }}>Student</th>
                      {uniqueDates.map(d => (
                        <th key={d} style={{ minWidth: 80, textAlign: "center", fontFamily: "DM Mono, monospace", fontWeight: 500 }}>
                          {new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </th>
                      ))}
                      <th style={{ minWidth: 80, textAlign: "center" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map(({ student, percentage }) => (
                      <tr key={student.id}>
                        <td style={{ fontWeight: 500, position: "sticky", left: 0, background: "var(--bg-2)", zIndex: 1 }}>
                          {student.name}
                        </td>
                        {uniqueDates.map(d => {
                          const status = studentDateMap[student.id]?.[d];
                          return (
                            <td key={d} style={{ textAlign: "center", padding: "8px 6px" }}>
                              {status === "present"
                                ? <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 13 }}>P</span>
                                : status === "absent"
                                ? <span style={{ color: "var(--red)", fontWeight: 700, fontSize: 13 }}>A</span>
                                : <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>
                              }
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center" }}>
                          <span style={{
                            fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 600,
                            color: percentage >= 75 ? "var(--green)" : percentage >= 50 ? "var(--amber)" : "var(--red)",
                          }}>
                            {percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty / initial state */}
        {!hasFetched && !loading && (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">Select a batch and date range, then click "Fetch Records"</div>
            </div>
          </div>
        )}

        {loading && (
          <div className="card">
            <div className="empty-state"><span className="spinner" /></div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
