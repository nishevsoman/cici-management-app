"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

interface NavItem {
  icon: string;
  label: string;
  href: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { icon: "⬡",  label: "Dashboard",          href: "/dashboard" },
  { icon: "✓",  label: "Attendance",          href: "/attendance" },
  { icon: "📋", label: "Attendance History",  href: "/attendance-history" },
  { icon: "◫",  label: "Batches",             href: "/batches",    adminOnly: true },
  { icon: "⬟",  label: "Students",            href: "/students",   adminOnly: true },
  { icon: "◈",  label: "Teachers",            href: "/teachers",   adminOnly: true },
  { icon: "₹",  label: "Fees",                href: "/fees",       adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isAdmin, signOut } = useAuth();

  const filteredItems = navItems.filter(i => !i.adminOnly || isAdmin);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const initials = profile?.name
    ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🎓</div>
          <div>
            <div className="sidebar-logo-text">AttendTrack</div>
            <div className="sidebar-logo-sub">Coaching Manager</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {filteredItems.map(item => (
          <a
            key={item.href}
            className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`}
            href={item.href}
            onClick={e => { e.preventDefault(); router.push(item.href); }}
          >
            <span className="nav-item-icon">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{profile?.name || profile?.email}</div>
            <div className="user-role">{profile?.role}</div>
          </div>
          <button className="sign-out-btn" onClick={handleSignOut} title="Sign out">↪</button>
        </div>
      </div>
    </aside>
  );
}
