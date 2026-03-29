"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGuard from "@/components/AuthGuard";
import { useToast } from "@/lib/toast";

interface Student {
  id: string;
  name: string;
  phone: string;
}

interface FeeRecord {
  id: string;
  student_id: string;
  month: string; // "YYYY-MM"
  amount_due: number;
  amount_paid: number;
  paid_on: string | null;
  note: string | null;
  created_at: string;
}

interface StudentFeeConfig {
  id?: string;
  student_id: string;
  monthly_fee: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getStatus(amountDue: number, amountPaid: number): "paid" | "partial" | "unpaid" | "no-fee" {
  if (amountDue <= 0) return "no-fee";
  if (amountPaid >= amountDue) return "paid";
  if (amountPaid > 0) return "partial";
  return "unpaid";
}

export default function FeesPage() {
  const toast = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [feeConfigs, setFeeConfigs] = useState<Record<string, StudentFeeConfig>>({});
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [allFeeRecords, setAllFeeRecords] = useState<FeeRecord[]>([]); // for history view
  const [loading, setLoading] = useState(true);

  // View mode
  const [viewMode, setViewMode] = useState<"month" | "history">("month");
  const [selectedMonth, setSelectedMonth] = useState(currentYM());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "unpaid" | "partial">("all");

  // History: selected student
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);

  // Config modal
  const [configModal, setConfigModal] = useState<Student | null>(null);
  const [configFee, setConfigFee] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Payment modal
  const [payModal, setPayModal] = useState<{
    student: Student;
    record: FeeRecord | null;
    month: string;
    amountDue: number;
  } | null>(null);
  const [payForm, setPayForm] = useState({ amount_paid: "", paid_on: "", note: "", amount_due: "" });
  const [savingPay, setSavingPay] = useState(false);

  // Add month modal (for history view - add a new month record)
  const [addMonthModal, setAddMonthModal] = useState<Student | null>(null);
  const [addMonthYM, setAddMonthYM] = useState(currentYM());

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: studentsData }, { data: configsData }, { data: recordsData }, { data: allRecordsData }] =
      await Promise.all([
        supabase.from("students").select("id, name, phone").order("name"),
        supabase.from("student_fee_configs").select("*"),
        supabase.from("fee_records").select("*").eq("month", selectedMonth),
        supabase.from("fee_records").select("*").order("month", { ascending: false }),
      ]);

    setStudents(studentsData || []);

    const cfgMap: Record<string, StudentFeeConfig> = {};
    (configsData || []).forEach((c: StudentFeeConfig) => { cfgMap[c.student_id] = c; });
    setFeeConfigs(cfgMap);
    setFeeRecords(recordsData || []);
    setAllFeeRecords(allRecordsData || []);
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { load(); }, [load]);

  // ── Month view rows ──
  const monthRows = students
    .filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone?.includes(search)
    )
    .map(s => {
      const cfg = feeConfigs[s.id];
      const rec = feeRecords.find(r => r.student_id === s.id);
      const amountDue = rec?.amount_due ?? cfg?.monthly_fee ?? 0;
      const amountPaid = rec?.amount_paid ?? 0;
      const status = getStatus(amountDue, amountPaid);
      return { student: s, cfg, rec, amountDue, amountPaid, status };
    })
    .filter(row => {
      if (filterStatus === "all") return true;
      return row.status === filterStatus;
    });

  // ── Summary stats ──
  const totalDue = monthRows.reduce((s, r) => s + r.amountDue, 0);
  const totalCollected = monthRows.reduce((s, r) => s + r.amountPaid, 0);
  const totalPending = totalDue - totalCollected;
  const paidCount = monthRows.filter(r => r.status === "paid").length;
  const unpaidCount = monthRows.filter(r => r.status === "unpaid").length;
  const partialCount = monthRows.filter(r => r.status === "partial").length;

  // ── History for selected student ──
  const studentHistory = historyStudent
    ? allFeeRecords
        .filter(r => r.student_id === historyStudent.id)
        .sort((a, b) => b.month.localeCompare(a.month))
    : [];

  const historyTotalDue = studentHistory.reduce((s, r) => s + Number(r.amount_due), 0);
  const historyTotalPaid = studentHistory.reduce((s, r) => s + Number(r.amount_paid), 0);

  // ── Save fee config ──
  const saveConfig = async () => {
    if (!configModal) return;
    const fee = parseFloat(configFee);
    if (isNaN(fee) || fee < 0) { toast("Enter a valid fee amount", "error"); return; }
    setSavingConfig(true);
    const existing = feeConfigs[configModal.id];
    if (existing?.id) {
      const { error } = await supabase.from("student_fee_configs").update({ monthly_fee: fee }).eq("id", existing.id);
      if (error) toast(error.message, "error"); else toast("Fee updated");
    } else {
      const { error } = await supabase.from("student_fee_configs").insert({ student_id: configModal.id, monthly_fee: fee });
      if (error) toast(error.message, "error"); else toast("Fee set");
    }
    setSavingConfig(false);
    setConfigModal(null);
    load();
  };

  // ── Open pay modal ──
  const openPayModal = (student: Student, rec: FeeRecord | null, amountDue: number, month: string) => {
    setPayModal({ student, record: rec, month, amountDue });
    setPayForm({
      amount_due: String(amountDue || feeConfigs[student.id]?.monthly_fee || ""),
      amount_paid: String(rec?.amount_paid ?? ""),
      paid_on: rec?.paid_on ?? new Date().toISOString().split("T")[0],
      note: rec?.note ?? "",
    });
  };

  // ── Save payment ──
  const savePayment = async () => {
    if (!payModal) return;
    const amtDue = parseFloat(payForm.amount_due);
    const amtPaid = parseFloat(payForm.amount_paid);
    if (isNaN(amtDue) || amtDue < 0) { toast("Enter valid amount due", "error"); return; }
    if (isNaN(amtPaid) || amtPaid < 0) { toast("Enter valid amount paid", "error"); return; }
    setSavingPay(true);
    const payload = {
      student_id: payModal.student.id,
      month: payModal.month,
      amount_due: amtDue,
      amount_paid: amtPaid,
      paid_on: payForm.paid_on || null,
      note: payForm.note || null,
    };
    if (payModal.record?.id) {
      const { error } = await supabase.from("fee_records").update(payload).eq("id", payModal.record.id);
      if (error) toast(error.message, "error"); else toast("Payment updated");
    } else {
      const { error } = await supabase.from("fee_records").insert(payload);
      if (error) toast(error.message, "error"); else toast("Payment recorded");
    }
    setSavingPay(false);
    setPayModal(null);
    load();
  };

  // ── Delete record ──
  const deleteRecord = async (rec: FeeRecord) => {
    const { error } = await supabase.from("fee_records").delete().eq("id", rec.id);
    if (error) toast(error.message, "error");
    else { toast("Record cleared"); load(); }
  };

  // ── Month navigation ──
  const shiftMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <AuthGuard adminOnly>
      <div className="page-header">
        <h1 className="page-title">Fees</h1>
        <p className="page-subtitle">Track monthly fee collection and view full payment history</p>
      </div>

      <div className="page-body fade-in">

        {/* View mode tabs */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <div className="tab-bar">
            <button className={`tab ${viewMode === "month" ? "active" : ""}`} onClick={() => { setViewMode("month"); setHistoryStudent(null); }}>
              Monthly View
            </button>
            <button className={`tab ${viewMode === "history" ? "active" : ""}`} onClick={() => setViewMode("history")}>
              Student History
            </button>
          </div>
        </div>

        {/* ══════════════════════ MONTHLY VIEW ══════════════════════ */}
        {viewMode === "month" && (
          <>
            {/* Controls */}
            <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
              <div className="form-row" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shiftMonth(-1)}>‹</button>
                  <div style={{
                    fontWeight: 700, fontSize: 15, color: "var(--text)",
                    minWidth: 160, textAlign: "center",
                    background: "var(--bg-3)", border: "1px solid var(--border)",
                    borderRadius: 7, padding: "6px 16px",
                  }}>
                    {monthLabel(selectedMonth)}
                  </div>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => shiftMonth(1)}
                    disabled={selectedMonth >= currentYM()}
                  >›</button>
                </div>

                <div className="form-field" style={{ flex: 1, minWidth: 180 }}>
                  <input
                    type="text"
                    placeholder="Search student…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>

                <div className="tab-bar">
                  {(["all","paid","partial","unpaid"] as const).map(f => (
                    <button
                      key={f}
                      className={`tab ${filterStatus === f ? "active" : ""}`}
                      onClick={() => setFilterStatus(f)}
                      style={{ textTransform: "capitalize" }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              <div className="stat-card blue">
                <div className="stat-icon">₹</div>
                <div className="stat-value" style={{ fontSize: 22 }}>₹{totalDue.toLocaleString("en-IN")}</div>
                <div className="stat-label">Total Due</div>
              </div>
              <div className="stat-card green">
                <div className="stat-icon">✓</div>
                <div className="stat-value" style={{ fontSize: 22 }}>₹{totalCollected.toLocaleString("en-IN")}</div>
                <div className="stat-label">Collected</div>
              </div>
              <div className="stat-card red">
                <div className="stat-icon">⏳</div>
                <div className="stat-value" style={{ fontSize: 22 }}>₹{totalPending.toLocaleString("en-IN")}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-card green">
                <div className="stat-icon">👤</div>
                <div className="stat-value">{paidCount}</div>
                <div className="stat-label">Fully Paid</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-icon">◑</div>
                <div className="stat-value">{partialCount}</div>
                <div className="stat-label">Partial</div>
              </div>
              <div className="stat-card red">
                <div className="stat-icon">✕</div>
                <div className="stat-value">{unpaidCount}</div>
                <div className="stat-label">Unpaid</div>
              </div>
            </div>

            {/* Table */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  {loading ? "Loading…" : `${monthRows.length} student${monthRows.length !== 1 ? "s" : ""}`}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  <strong style={{ color: "var(--text-2)" }}>Set Fee</strong> to configure · <strong style={{ color: "var(--text-2)" }}>Record</strong> to log payment
                </div>
              </div>

              {loading ? (
                <div className="empty-state"><span className="spinner" /></div>
              ) : monthRows.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">💸</div>
                  <div className="empty-state-text">No students found</div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Monthly Fee</th>
                        <th>Due</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Paid On</th>
                        <th>Note</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map(({ student, cfg, rec, amountDue, amountPaid, status }) => {
                        const balance = amountDue - amountPaid;
                        return (
                          <tr key={student.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: "50%",
                                  background: "var(--bg-3)", border: "1px solid var(--border)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontWeight: 700, fontSize: 12, color: "var(--text-2)", flexShrink: 0,
                                }}>
                                  {student.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 500 }}>{student.name}</div>
                                  {student.phone && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{student.phone}</div>}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {cfg ? (
                                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13 }}>
                                    ₹{Number(cfg.monthly_fee).toLocaleString("en-IN")}
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--text-3)", fontSize: 12 }}>Not set</span>
                                )}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: "3px 8px" }}
                                  onClick={() => { setConfigModal(student); setConfigFee(String(cfg?.monthly_fee ?? "")); }}
                                >
                                  {cfg ? "Edit" : "Set Fee"}
                                </button>
                              </div>
                            </td>
                            <td style={{ fontFamily: "DM Mono, monospace", fontSize: 13 }}>
                              {amountDue > 0 ? `₹${amountDue.toLocaleString("en-IN")}` : <span style={{ color: "var(--text-3)" }}>—</span>}
                            </td>
                            <td style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: amountPaid > 0 ? "var(--green)" : "var(--text-3)" }}>
                              {amountPaid > 0 ? `₹${amountPaid.toLocaleString("en-IN")}` : "—"}
                            </td>
                            <td style={{
                              fontFamily: "DM Mono, monospace", fontSize: 13,
                              color: balance > 0 ? "var(--red)" : balance < 0 ? "var(--amber)" : "var(--green)",
                              fontWeight: amountDue > 0 ? 600 : 400,
                            }}>
                              {amountDue > 0
                                ? balance === 0 ? <span style={{ color: "var(--green)" }}>Cleared</span>
                                  : balance < 0 ? `+₹${Math.abs(balance).toLocaleString("en-IN")}`
                                  : `₹${balance.toLocaleString("en-IN")}`
                                : <span style={{ color: "var(--text-3)" }}>—</span>}
                            </td>
                            <td style={{ fontSize: 12.5, color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>
                              {rec?.paid_on ? new Date(rec.paid_on).toLocaleDateString("en-IN") : "—"}
                            </td>
                            <td style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 140 }}>
                              {rec?.note ? (
                                <span title={rec.note} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 130 }}>
                                  {rec.note}
                                </span>
                              ) : "—"}
                            </td>
                            <td>
                              {status === "paid" && <span className="badge badge-green">✓ Paid</span>}
                              {status === "partial" && <span className="badge badge-amber">◑ Partial</span>}
                              {status === "unpaid" && <span className="badge badge-red">✕ Unpaid</span>}
                              {status === "no-fee" && <span className="badge badge-gray">— No fee</span>}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => openPayModal(student, rec ?? null, amountDue, selectedMonth)}
                                >
                                  {rec ? "Edit" : "Record"}
                                </button>
                                {rec && (
                                  <button className="btn btn-danger btn-sm" onClick={() => deleteRecord(rec)}>Clear</button>
                                )}
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => { setViewMode("history"); setHistoryStudent(student); }}
                                  title="View full history"
                                >
                                  History
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════ HISTORY VIEW ══════════════════════ */}
        {viewMode === "history" && (
          <>
            {/* Student selector */}
            <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
              <div className="form-row" style={{ alignItems: "center" }}>
                <div className="form-field" style={{ flex: 1, maxWidth: 340 }}>
                  <label>Select Student</label>
                  <select
                    value={historyStudent?.id ?? ""}
                    onChange={e => {
                      const s = students.find(x => x.id === e.target.value) ?? null;
                      setHistoryStudent(s);
                    }}
                  >
                    <option value="">— Choose a student —</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {historyStudent && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setAddMonthModal(historyStudent);
                      setAddMonthYM(currentYM());
                    }}
                  >
                    + Add Month Record
                  </button>
                )}
              </div>
            </div>

            {!historyStudent ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon">👤</div>
                  <div className="empty-state-text">Select a student to view their fee history</div>
                </div>
              </div>
            ) : (
              <>
                {/* Student summary */}
                <div className="card" style={{ marginBottom: 20, padding: "20px 24px", background: "linear-gradient(135deg, rgba(79,126,248,0.12) 0%, rgba(79,126,248,0.04) 100%)", borderColor: "rgba(79,126,248,0.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: "50%",
                        background: "var(--accent)", display: "flex", alignItems: "center",
                        justifyContent: "center", fontWeight: 700, fontSize: 18, color: "white",
                      }}>
                        {historyStudent.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{historyStudent.name}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                          {historyStudent.phone || "No phone"} ·{" "}
                          {feeConfigs[historyStudent.id]
                            ? `₹${Number(feeConfigs[historyStudent.id].monthly_fee).toLocaleString("en-IN")}/month`
                            : "No monthly fee set"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", fontFamily: "DM Mono, monospace" }}>
                          ₹{historyTotalDue.toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Total Billed</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--green)", fontFamily: "DM Mono, monospace" }}>
                          ₹{historyTotalPaid.toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Total Paid</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: historyTotalDue - historyTotalPaid > 0 ? "var(--red)" : "var(--green)", fontFamily: "DM Mono, monospace" }}>
                          ₹{Math.abs(historyTotalDue - historyTotalPaid).toLocaleString("en-IN")}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {historyTotalDue - historyTotalPaid > 0 ? "Outstanding" : "Balance"}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>
                          {studentHistory.length}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Months</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* History timeline */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Payment History — {historyStudent.name}</div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setConfigModal(historyStudent); setConfigFee(String(feeConfigs[historyStudent.id]?.monthly_fee ?? "")); }}
                    >
                      {feeConfigs[historyStudent.id] ? "Edit Monthly Fee" : "Set Monthly Fee"}
                    </button>
                  </div>

                  {studentHistory.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📋</div>
                      <div className="empty-state-text">No payment records yet — click "+ Add Month Record" to start</div>
                    </div>
                  ) : (
                    <div style={{ padding: "8px 0" }}>
                      {studentHistory.map((rec, idx) => {
                        const status = getStatus(Number(rec.amount_due), Number(rec.amount_paid));
                        const balance = Number(rec.amount_due) - Number(rec.amount_paid);
                        return (
                          <div key={rec.id} style={{
                            display: "flex", alignItems: "flex-start", gap: 0,
                            position: "relative",
                          }}>
                            {/* Timeline line */}
                            <div style={{
                              display: "flex", flexDirection: "column", alignItems: "center",
                              width: 48, flexShrink: 0, paddingTop: 20,
                            }}>
                              <div style={{
                                width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                                background: status === "paid" ? "var(--green)"
                                  : status === "partial" ? "var(--amber)"
                                  : status === "unpaid" ? "var(--red)" : "var(--border)",
                                border: "2px solid var(--bg-2)",
                                zIndex: 1,
                              }} />
                              {idx < studentHistory.length - 1 && (
                                <div style={{ width: 2, flex: 1, minHeight: 24, background: "var(--border)", marginTop: 4 }} />
                              )}
                            </div>

                            {/* Card */}
                            <div style={{
                              flex: 1, background: "var(--bg-3)", border: "1px solid var(--border)",
                              borderRadius: 10, padding: "14px 18px", margin: "8px 20px 8px 0",
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                                    {monthLabel(rec.month)}
                                  </div>
                                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-2)" }}>
                                    <span>Due: <strong style={{ color: "var(--text)", fontFamily: "DM Mono, monospace" }}>₹{Number(rec.amount_due).toLocaleString("en-IN")}</strong></span>
                                    <span>Paid: <strong style={{ color: Number(rec.amount_paid) > 0 ? "var(--green)" : "var(--text-3)", fontFamily: "DM Mono, monospace" }}>₹{Number(rec.amount_paid).toLocaleString("en-IN")}</strong></span>
                                    {balance !== 0 && (
                                      <span>
                                        Balance: <strong style={{ color: balance > 0 ? "var(--red)" : "var(--amber)", fontFamily: "DM Mono, monospace" }}>
                                          {balance > 0 ? `₹${balance.toLocaleString("en-IN")}` : `+₹${Math.abs(balance).toLocaleString("en-IN")}`}
                                        </strong>
                                      </span>
                                    )}
                                  </div>
                                  {rec.paid_on && (
                                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                                      Paid on {new Date(rec.paid_on).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                                    </div>
                                  )}
                                  {rec.note && (
                                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, fontStyle: "italic" }}>
                                      "{rec.note}"
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  {status === "paid" && <span className="badge badge-green">✓ Paid</span>}
                                  {status === "partial" && <span className="badge badge-amber">◑ Partial</span>}
                                  {status === "unpaid" && <span className="badge badge-red">✕ Unpaid</span>}
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => openPayModal(historyStudent, rec, Number(rec.amount_due), rec.month)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => deleteRecord(rec)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Set Fee Modal ── */}
      {configModal && (
        <div className="modal-overlay" onClick={() => setConfigModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Monthly Fee — {configModal.name}</div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setConfigModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Monthly Fee Amount (₹)</label>
                <input
                  type="number" min="0" placeholder="e.g. 2500"
                  value={configFee}
                  onChange={e => setConfigFee(e.target.value)}
                  autoFocus
                />
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: 0 }}>
                This sets the default monthly fee. You can still override the due amount per month when recording a payment.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfigModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveConfig} disabled={savingConfig}>
                {savingConfig ? <><span className="spinner" /> Saving…</> : "Save Fee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record/Edit Payment Modal ── */}
      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {payModal.record ? "Edit Payment" : "Record Payment"} — {payModal.student.name}
              </div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setPayModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{
                background: "var(--accent-dim)", border: "1px solid rgba(79,126,248,0.25)",
                borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--accent)", marginBottom: 4,
              }}>
                Month: <strong>{monthLabel(payModal.month)}</strong>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Amount Due (₹)</label>
                  <input
                    type="number" min="0" placeholder="e.g. 2500"
                    value={payForm.amount_due}
                    onChange={e => setPayForm(f => ({ ...f, amount_due: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Amount Paid (₹)</label>
                  <input
                    type="number" min="0" placeholder="e.g. 2500"
                    value={payForm.amount_paid}
                    onChange={e => setPayForm(f => ({ ...f, amount_paid: e.target.value }))}
                    autoFocus
                  />
                </div>
              </div>

              {payForm.amount_due && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["25","50","75"].map(pct => {
                    const amt = Math.round((parseFloat(payForm.amount_due) * parseInt(pct)) / 100);
                    return (
                      <button key={pct} className="btn btn-secondary btn-sm" style={{ fontSize: 11.5 }}
                        onClick={() => setPayForm(f => ({ ...f, amount_paid: String(amt) }))}>
                        {pct}% (₹{amt.toLocaleString("en-IN")})
                      </button>
                    );
                  })}
                  <button className="btn btn-success btn-sm" style={{ fontSize: 11.5 }}
                    onClick={() => setPayForm(f => ({ ...f, amount_paid: f.amount_due }))}>
                    Full (₹{parseFloat(payForm.amount_due || "0").toLocaleString("en-IN")})
                  </button>
                </div>
              )}

              <div className="form-field">
                <label>Payment Date</label>
                <input
                  type="date"
                  value={payForm.paid_on}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={e => setPayForm(f => ({ ...f, paid_on: e.target.value }))}
                />
              </div>

              <div className="form-field">
                <label>Note (optional)</label>
                <input
                  type="text" placeholder="e.g. Cash, cheque no. 1234…"
                  value={payForm.note}
                  onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>

              {payForm.amount_due && payForm.amount_paid && (
                <div style={{
                  background: "var(--bg-3)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "10px 14px", fontSize: 13,
                }}>
                  {(() => {
                    const due = parseFloat(payForm.amount_due) || 0;
                    const paid = parseFloat(payForm.amount_paid) || 0;
                    const bal = due - paid;
                    return (
                      <span style={{ color: bal <= 0 ? "var(--green)" : bal < due ? "var(--amber)" : "var(--red)" }}>
                        {bal === 0 ? "✓ Fully paid"
                          : bal < 0 ? `Overpaid by ₹${Math.abs(bal).toLocaleString("en-IN")}`
                          : `Balance remaining: ₹${bal.toLocaleString("en-IN")}`}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPayModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePayment} disabled={savingPay}>
                {savingPay ? <><span className="spinner" /> Saving…</> : (payModal.record ? "Update" : "Record Payment")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Month Record Modal (from history view) ── */}
      {addMonthModal && (
        <div className="modal-overlay" onClick={() => setAddMonthModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Add Month Record — {addMonthModal.name}</div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setAddMonthModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Select Month</label>
                <input
                  type="month"
                  value={addMonthYM}
                  max={currentYM()}
                  onChange={e => setAddMonthYM(e.target.value)}
                />
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: 0 }}>
                You'll be able to enter payment details in the next step.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAddMonthModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                const existing = allFeeRecords.find(r => r.student_id === addMonthModal.id && r.month === addMonthYM);
                const cfg = feeConfigs[addMonthModal.id];
                setAddMonthModal(null);
                openPayModal(addMonthModal, existing ?? null, existing?.amount_due ?? cfg?.monthly_fee ?? 0, addMonthYM);
              }}>
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
