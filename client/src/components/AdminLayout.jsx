import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/auth';

const NAV = [
  { to: '/admin',             label: '📊 Dashboard',    exact: true,  roles: ['admin','staff','consultant'] },
  { to: '/admin/enquiries',   label: '📋 Enquiries',                  roles: ['admin','staff','consultant'] },
  { to: '/admin/students',    label: '👥 Students',                   roles: ['admin','staff'] },
  { to: '/admin/colleges',    label: '🏫 Colleges',                   roles: ['admin','staff'] },
  { to: '/admin/commissions', label: '💰 Commissions',                roles: ['admin','staff'] },
  { to: '/admin/reports',     label: '📈 Reports',                    roles: ['admin','staff'] },
  { to: '/admin/team',        label: '👤 Team',                       roles: ['admin'] },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  function handleLogout() { logout(); navigate('/admin/login'); }

  const role = user?.role || 'staff';
  const visibleNav = NAV.filter(n => n.roles.includes(role));

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-60 bg-brand flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <img src="/logo.png" alt="Campus Search" className="h-8 w-auto object-contain bg-white rounded-md px-1.5 py-0.5 mb-0.5" />
          <p className="text-blue-300 text-xs mt-0.5">
            {role === 'admin' ? 'Admin Panel' : role === 'staff' ? 'Staff Panel' : 'Consultant Panel'}
          </p>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-3">
          {visibleNav.map(n => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-white/20 text-white' : 'text-blue-200 hover:bg-white/10 hover:text-white'}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-blue-200 text-xs font-medium">{user?.name}</p>
          <p className="text-blue-400 text-xs capitalize mb-2">{role}</p>
          <button onClick={handleLogout} className="text-sm text-red-300 hover:text-red-200 transition-colors">
            ← Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
