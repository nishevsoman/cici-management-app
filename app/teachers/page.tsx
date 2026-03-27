"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthGuard from "@/components/AuthGuard";
import { useToast } from "@/lib/toast";

interface Teacher {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}

export default function TeachersPage() {
  const toast = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "teacher")
      .order("created_at", { ascending: false });
    setTeachers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditTeacher(null);
    setForm({ name: "", email: "", password: "" });
    setShowModal(true);
  };

  const openEdit = (t: Teacher) => {
    setEditTeacher(t);
    setForm({ name: t.name || "", email: t.email, password: "" });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);

    if (editTeacher) {
      // Update profile only (name)
      const { error } = await supabase
        .from("profiles")
        .update({ name: form.name, email: form.email })
        .eq("id", editTeacher.id);

      if (error) toast(error.message, "error");
      else { toast("Teacher updated"); setShowModal(false); load(); }
    } else {
      // Create new auth user and profile
      if (!form.password.trim()) { toast("Password is required", "error"); setSaving(false); return; }

      const { data: authData, error: authError } = await supabase.auth.admin
        ? // Try admin API - won't work from client
          { data: null, error: { message: "Use service role" } }
        : { data: null, error: { message: "Use service role" } };

      // Fallback: Use signUp flow - user will need to confirm email
      // For demo purposes, we create via signUp
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } }
      });

      if (error) {
        toast(error.message, "error");
      } else if (data.user) {
        // Insert/update profile
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email: form.email,
          name: form.name,
          role: "teacher",
        });
        toast("Teacher created — they need to confirm their email");
        setShowModal(false);
        load();
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("profiles").delete().eq("id", deleteId);
    if (error) toast(error.message, "error");
    else { toast("Teacher removed"); setDeleteId(null); load(); }
  };

  return (
    <AuthGuard adminOnly>
      <div className="page-header">
        <h1 className="page-title">Teachers</h1>
        <p className="page-subtitle">Manage teaching staff accounts</p>
      </div>

      <div className="page-body fade-in">
        <div className="card">
          <div className="card-header">
            <div className="card-title">{teachers.length} Teacher{teachers.length !== 1 ? "s" : ""}</div>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Teacher</button>
          </div>

          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : teachers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div className="empty-state-text">No teachers yet — add one to get started</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-dim)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "var(--accent)", flexShrink: 0 }}>
                            {(t.name || t.email).split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <span style={{ fontWeight: 500 }}>{t.name || "—"}</span>
                        </div>
                      </td>
                      <td style={{ color: "var(--text-2)" }}>{t.email}</td>
                      <td style={{ color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: 12 }}>
                        {new Date(t.created_at).toLocaleDateString("en-IN")}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(t.id)}>Remove</button>
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
              <div className="modal-title">{editTeacher ? "Edit Teacher" : "Add Teacher"}</div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Priya Sharma"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="teacher@school.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={!!editTeacher}
                />
              </div>
              {!editTeacher && (
                <div className="form-field">
                  <label>Initial Password</label>
                  <input
                    type="password"
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : (editTeacher ? "Save Changes" : "Create Teacher")}
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
              <div className="modal-title">Remove Teacher?</div>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-2)", margin: 0, fontSize: 13.5 }}>
                This will remove the teacher profile. Their batches will still exist but become unassigned.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Yes, Remove</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
