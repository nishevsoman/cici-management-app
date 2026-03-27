"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/authContext";
import AuthGuard from "@/components/AuthGuard";

interface Stats {
  totalStudents: number;
  totalBatches: number;
  totalTeachers: number;
  todayPresent: number;
  todayAbsent: number;
  todayTotal: number;
}

interface RecentAttendance {
  id: string;
  date: string;
  status: string;
  students: { name: string } | null;
  batches: { name: string } | null;
}

export default function DashboardPage() {
  const { isAdmin, profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    totalBatches: 0,
    totalTeachers: 0,
    todayPresent: 0,
    todayAbsent: 0,
    todayTotal: 0,
  });
  const [recent, setRecent] = useState<RecentAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const load = async () => {
      const promises: Promise<any>[] = [];

      if (isAdmin) {
        promises.push(
          supabase.from("students").select("id", { count: "exact", head: true }),
          supabase.from("batches").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
          supabase.from("attendance").select("status").eq("date", today),
        );
      } else {
        promises.push(
          supabase.from("batches").select("id", { count: "exact", head: true }),
          supabase.from("attendance").select("status").eq("date", today),
        );
      }

      const results = await Promise.all(promises);

      if (isAdmin) {
        const [studentsR, batchesR, teachersR, attendanceR] = results;
        const att = attendanceR.data || [];
        setStats({
          totalStudents: studentsR.count || 0,
          totalBatches: batchesR.count || 0,
          totalTeachers: teachersR.count || 0,
          todayPresent: att.filter((a: any) => a.status === "present").length,
          todayAbsent: att.filter((a: any) => a.status === "absent").length,
          todayTotal: att.length,
        });
      } else {
        const [batchesR, attendanceR] = results;
        const att = attendanceR.data || [];
        setStats({
          totalStudents: 0,
          totalBatches: batchesR.count || 0,
          totalTeachers: 0,
          todayPresent: att.filter((a: any) => a.status === "present").length,
          todayAbsent: att.filter((a: any) => a.status === "absent").length,
          todayTotal: att.length,
        });
      }

      // Recent attendance
      const { data: recentData } = await supabase
        .from("attendance")
        .select("id, date, status, students(name), batches(name)")
        .order("created_at", { ascending: false })
        .limit(8);

      setRecent((recentData as any) || []);
      setLoading(false);
    };

    load();
  }, [isAdmin, today]);

  const attendancePct = stats.todayTotal > 0
    ? Math.round((stats.todayPresent / stats.todayTotal) * 100)
    : null;

  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  if (loading) {
    return (
      <AuthGuard>
        <div className="loading-screen">
          <span className="spinner" /> Loading dashboard…
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">{dateStr}</p>
      </div>

      <div className="page-body fade-in">
        {/* Welcome */}
        <div className="card" style={{ marginBottom: 24, padding: "20px 24px", background: "linear-gradient(135deg, rgba(79,126,248,0.15) 0%, rgba(79,126,248,0.05) 100%)", borderColor: "rgba(79,126,248,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {profile?.name || profile?.email?.split("@")[0]} 👋
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                {isAdmin ? "You have full access to manage the institute." : "You can mark attendance for your batches."}
              </div>
            </div>
            <a href="/attendance" className="btn btn-primary">Mark Attendance →</a>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          {isAdmin && (
            <>
              <div className="stat-card blue">
                <div className="stat-icon">👥</div>
                <div className="stat-value">{stats.totalStudents}</div>
                <div className="stat-label">Total Students</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-icon">◫</div>
                <div className="stat-value">{stats.totalBatches}</div>
                <div className="stat-label">Total Batches</div>
              </div>
              <div className="stat-card green">
                <div className="stat-icon">◈</div>
                <div className="stat-value">{stats.totalTeachers}</div>
                <div className="stat-label">Teachers</div>
              </div>
            </>
          )}
          <div className="stat-card green">
            <div className="stat-icon">✓</div>
            <div className="stat-value">{stats.todayPresent}</div>
            <div className="stat-label">Present Today</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">✕</div>
            <div className="stat-value">{stats.todayAbsent}</div>
            <div className="stat-label">Absent Today</div>
          </div>
          {attendancePct !== null && (
            <div className="stat-card blue">
              <div className="stat-icon">📊</div>
              <div className="stat-value">{attendancePct}%</div>
              <div className="stat-label">Today's Attendance</div>
            </div>
          )}
        </div>

        {/* Recent */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Attendance Records</div>
            <a href="/attendance" className="btn btn-secondary btn-sm">View All</a>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">No attendance records yet</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Batch</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.students?.name ?? "—"}</td>
                      <td>{r.batches?.name ?? "—"}</td>
                      <td style={{ color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: 12.5 }}>{r.date}</td>
                      <td>
                        <span className={`badge ${r.status === "present" ? "badge-green" : "badge-red"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
