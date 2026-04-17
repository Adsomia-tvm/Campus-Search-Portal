import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/auth';

const NAV = [
  { to: '/college-portal',            label: 'Dashboard',  icon: '📊', exact: true },
  { to: '/college-portal/enquiries',  label: 'Enquiries',  icon: '📋' },
  { to: '/college-portal/courses',    label: 'Courses',    icon: '📚' },
  { to: '/college-portal/profile',    label: 'Profile',    icon: '🏫' },
];

export default function CollegeLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function handleLogout() { logout(); navigate('/admin/login'); }

  return (
    <div className="min-h-screen flex bg-gray-100">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-emerald-700 flex flex-col flex-shrink-0
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <img src="/logo.png" alt="Campus Search" className="h-8 w-auto object-contain bg-white rounded-md px-1.5 py-0.5 mb-0.5" />
            <p className="text-emerald-200 text-xs mt-0.5">College Portal</p>
          </div>
          <button className="lg:hidden text-white/70 hover:text-white p-1" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-3 overflow-y-auto">
          {NAV.map(n => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-white/20 text-white' : 'text-emerald-200 hover:bg-white/10 hover:text-white'}`}>
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-emerald-200 text-xs font-medium truncate">{user?.name}</p>
          <p className="text-emerald-400 text-xs mb-2">College Account</p>
          <button onClick={handleLogout} className="text-sm text-red-300 hover:text-red-200 transition-colors">
            Logout →
          </button>
          <Link to="/" className="block text-sm text-emerald-300 hover:text-emerald-100 mt-1 transition-colors">
            ← Back to Website
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Open sidebar">
            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/logo.png" alt="Campus Search" className="h-6 w-auto object-contain" />
          <span className="text-sm font-semibold text-gray-700 truncate">College Portal</span>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
