"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGuard from "@/components/AuthGuard";
import { useToast } from "@/lib/toast";

interface Batch {
  id: string;
  name: string;
  teacher_id: string | null;
  created_at: string;
  profiles?: { name: string | null; email: string } | null;
  student_count?: number;
}

interface Teacher {
  id: string;
  name: string | null;
  email: string;
}

export default function BatchesPage() {
  const toast = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [form, setForm] = useState({ name: "", teacher_id: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: batchData }, { data: teacherData }] = await Promise.all([
      supabase.from("batches").select("*, profiles(name, email)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, email").eq("role", "teacher").order("email"),
    ]);

    // Get student counts
    const batchList = batchData || [];
    const counts: Record<string, number> = {};
    if (batchList.length > 0) {
      const { data: sbData } = await supabase
        .from("student_batches")
        .select("batch_id");
      (sbData || []).forEach((sb: any) => {
        counts[sb.batch_id] = (counts[sb.batch_id] || 0) + 1;
      });
    }

    setBatches(batchList.map((b: any) => ({ ...b, student_count: counts[b.id] || 0 })));
    setTeachers(teacherData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditBatch(null);
    setForm({ name: "", teacher_id: teachers[0]?.id || "" });
    setShowModal(true);
  };

  const openEdit = (b: Batch) => {
    setEditBatch(b);
    setForm({ name: b.name, teacher_id: b.teacher_id || "" });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    if (editBatch) {
      const { error } = await supabase.from("batches").update({
        name: form.name,
        teacher_id: form.teacher_id || null,
      }).eq("id", editBatch.id);

      if (error) toast(error.message, "error");
      else { toast("Batch updated"); setShowModal(false); load(); }
    } else {
      const { error } = await supabase.from("batches").insert({
        name: form.name,
        teacher_id: form.teacher_id || null,
      });

      if (error) toast(error.message, "error");
      else { toast("Batch created"); setShowModal(false); load(); }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    // Delete student_batches first
    await supabase.from("student_batches").delete().eq("batch_id", deleteId);
    await supabase.from("attendance").delete().eq("batch_id", deleteId);
    const { error } = await supabase.from("batches").delete().eq("id", deleteId);
    if (error) toast(error.message, "error");
    else { toast("Batch deleted"); setDeleteId(null); load(); }
  };

  return (
    <AuthGuard adminOnly>
      <div className="page-header">
        <h1 className="page-title">Batches</h1>
        <p className="page-subtitle">Manage class batches and assign teachers</p>
      </div>

      <div className="page-body fade-in">
        <div className="card">
          <div className="card-header">
            <div className="card-title">{batches.length} Batch{batches.length !== 1 ? "es" : ""}</div>
            <button className="btn btn-primary" onClick={openAdd}>+ New Batch</button>
          </div>

          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : batches.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">◫</div>
              <div className="empty-state-text">No batches yet</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch Name</th>
                    <th>Assigned Teacher</th>
                    <th>Students</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => {
                    const teacherDisplay = b.profiles?.name || b.profiles?.email || null;
                    return (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block", flexShrink: 0 }} />
                            {b.name}
                          </div>
                        </td>
                        <td>
                          {teacherDisplay
                            ? <span className="badge badge-blue">{teacherDisplay}</span>
                            : <span className="badge badge-gray">Unassigned</span>
                          }
                        </td>
                        <td>
                          <span className="badge badge-gray">{b.student_count} students</span>
                        </td>
                        <td style={{ color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: 12 }}>
                          {new Date(b.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(b.id)}>Delete</button>
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
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editBatch ? "Edit Batch" : "New Batch"}</div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Batch Name</label>
                <input
                  type="text"
                  placeholder="e.g. JEE Morning Batch"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>Assign Teacher</label>
                <select
                  value={form.teacher_id}
                  onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                >
                  <option value="">— No teacher —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.email}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : (editBatch ? "Save Changes" : "Create Batch")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Batch?</div>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-2)", margin: 0, fontSize: 13.5 }}>
                This will permanently delete the batch, all student enrollments, and all attendance records for this batch. This cannot be undone.
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
