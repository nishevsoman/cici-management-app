"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGuard from "@/components/AuthGuard";
import { useToast } from "@/lib/toast";

interface Student {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  batches?: { id: string; name: string }[];
}

interface Batch {
  id: string;
  name: string;
}

export default function StudentsPage() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", batchIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: studentsData }, { data: batchesData }, { data: sbData }] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("batches").select("id, name").order("name"),
      supabase.from("student_batches").select("student_id, batches(id, name)"),
    ]);

    // Map batches to students
    const batchMap: Record<string, { id: string; name: string }[]> = {};
    (sbData || []).forEach((sb: any) => {
      if (!batchMap[sb.student_id]) batchMap[sb.student_id] = [];
      if (sb.batches) batchMap[sb.student_id].push(sb.batches);
    });

    setStudents((studentsData || []).map((s: any) => ({
      ...s,
      batches: batchMap[s.id] || [],
    })));
    setBatches(batchesData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditStudent(null);
    setForm({ name: "", phone: "", batchIds: [] });
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditStudent(s);
    setForm({
      name: s.name,
      phone: s.phone,
      batchIds: (s.batches || []).map(b => b.id),
    });
    setShowModal(true);
  };

  const toggleBatch = (batchId: string) => {
    setForm(f => ({
      ...f,
      batchIds: f.batchIds.includes(batchId)
        ? f.batchIds.filter(id => id !== batchId)
        : [...f.batchIds, batchId],
    }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    if (editStudent) {
      const { error } = await supabase
        .from("students")
        .update({ name: form.name, phone: form.phone })
        .eq("id", editStudent.id);

      if (error) { toast(error.message, "error"); setSaving(false); return; }

      // Update batch enrollments
      await supabase.from("student_batches").delete().eq("student_id", editStudent.id);
      if (form.batchIds.length > 0) {
        await supabase.from("student_batches").insert(
          form.batchIds.map(batchId => ({ student_id: editStudent.id, batch_id: batchId }))
        );
      }

      toast("Student updated");
      setShowModal(false);
      load();
    } else {
      const { data, error } = await supabase
        .from("students")
        .insert({ name: form.name, phone: form.phone })
        .select()
        .single();

      if (error) { toast(error.message, "error"); setSaving(false); return; }

      if (form.batchIds.length > 0) {
        await supabase.from("student_batches").insert(
          form.batchIds.map(batchId => ({ student_id: data.id, batch_id: batchId }))
        );
      }

      toast("Student added");
      setShowModal(false);
      load();
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await supabase.from("student_batches").delete().eq("student_id", deleteId);
    await supabase.from("attendance").delete().eq("student_id", deleteId);
    const { error } = await supabase.from("students").delete().eq("id", deleteId);
    if (error) toast(error.message, "error");
    else { toast("Student deleted"); setDeleteId(null); load(); }
  };

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );

  return (
    <AuthGuard adminOnly>
      <div className="page-header">
        <h1 className="page-title">Students</h1>
        <p className="page-subtitle">Manage student profiles and batch enrollments</p>
      </div>

      <div className="page-body fade-in">
        <div className="card">
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
              <div className="card-title">{students.length} Student{students.length !== 1 ? "s" : ""}</div>
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ maxWidth: 240, fontSize: 13 }}
              />
            </div>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Student</button>
          </div>

          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-text">
                {search ? "No students match your search" : "No students yet — add one to get started"}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Phone</th>
                    <th>Batches</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "var(--bg-3)", border: "1px solid var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 700, fontSize: 12, color: "var(--text-2)", flexShrink: 0,
                          }}>
                            {s.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <span style={{ fontWeight: 500 }}>{s.name}</span>
                        </div>
                      </td>
                      <td style={{ color: "var(--text-2)", fontFamily: "DM Mono, monospace", fontSize: 12.5 }}>
                        {s.phone || "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(s.batches || []).length === 0
                            ? <span className="badge badge-gray">No batch</span>
                            : (s.batches || []).map(b => (
                              <span key={b.id} className="badge badge-blue">{b.name}</span>
                            ))
                          }
                        </div>
                      </td>
                      <td style={{ color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: 12 }}>
                        {new Date(s.created_at).toLocaleDateString("en-IN")}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(s.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editStudent ? "Edit Student" : "Add Student"}</div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Arjun Mehta"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>Fees</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>Enroll in Batches</label>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  maxHeight: 180, overflowY: "auto",
                  background: "var(--bg-3)", borderRadius: 7,
                  border: "1px solid var(--border)", padding: "8px 12px",
                }}>
                  {batches.length === 0 ? (
                    <div style={{ color: "var(--text-3)", fontSize: 13 }}>No batches available</div>
                  ) : batches.map(b => (
                    <label key={b.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: "pointer", padding: "4px 0",
                      color: "var(--text)", fontSize: 13.5,
                    }}>
                      <input
                        type="checkbox"
                        checked={form.batchIds.includes(b.id)}
                        onChange={() => toggleBatch(b.id)}
                        style={{ width: 15, height: 15, accentColor: "var(--accent)" }}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : (editStudent ? "Save Changes" : "Add Student")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Student?</div>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-2)", margin: 0, fontSize: 13.5 }}>
                This will permanently delete the student, remove them from all batches, and delete all their attendance records.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
