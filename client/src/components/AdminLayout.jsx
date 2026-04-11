import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/auth';

const NAV = [
  { to: '/admin',             label: 'Dashboard',    icon: '📊', exact: true,  roles: ['admin','staff','consultant'] },
  { to: '/admin/enquiries',   label: 'Enquiries',    icon: '📋',               roles: ['admin','staff','consultant'] },
  { to: '/admin/students',    label: 'Students',     icon: '👥',               roles: ['admin','staff'] },
  { to: '/admin/colleges',    label: 'Colleges',     icon: '🏫',               roles: ['admin','staff'] },
  { to: '/admin/commissions', label: 'Commissions',  icon: '💰',               roles: ['admin','staff'] },
  { to: '/admin/reports',     label: 'Reports',      icon: '📈',               roles: ['admin','staff'] },
  { to: '/admin/team',        label: 'Team',         icon: '👤',               roles: ['admin'] },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Close sidebar on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function handleLogout() { logout(); navigate('/admin/login'); }

  const role = user?.role || 'staff';
  const visibleNav = NAV.filter(n => n.roles.includes(role));

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* ── Mobile overlay backdrop ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-brand flex flex-col flex-shrink-0
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo + close btn */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <img src="/logo.png" alt="Campus Search" className="h-8 w-auto object-contain bg-white rounded-md px-1.5 py-0.5 mb-0.5" />
            <p className="text-blue-300 text-xs mt-0.5">
              {role === 'admin' ? 'Admin Panel' : role === 'staff' ? 'Staff Panel' : 'Consultant Panel'}
            </p>
          </div>
          <button
            className="lg:hidden text-white/70 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-0.5 px-3 overflow-y-auto">
          {visibleNav.map(n => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-white/20 text-white' : 'text-blue-200 hover:bg-white/10 hover:text-white'}`}>
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-blue-200 text-xs font-medium truncate">{user?.name}</p>
          <p className="text-blue-400 text-xs capitalize mb-2">{role}</p>
          <button onClick={handleLogout} className="text-sm text-red-300 hover:text-red-200 transition-colors">
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Open sidebar"
          >
            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/logo.png" alt="Campus Search" className="h-6 w-auto object-contain" />
          <span className="text-sm font-semibold text-gray-700 truncate">
            {visibleNav.find(n => n.exact ? pathname === n.to : pathname.startsWith(n.to))?.label || 'Admin'}
          </span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
