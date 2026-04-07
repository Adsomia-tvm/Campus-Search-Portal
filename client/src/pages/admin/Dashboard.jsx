import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboard } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard, refetchInterval: 60000 });

  const STATS = data ? [
    { label: 'New Today',       value: data.stats.newToday,             icon: '🆕', color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Enquiries', value: data.stats.totalEnquiries,       icon: '📋', color: 'bg-purple-50 text-purple-700' },
    { label: 'Enrolled Total',  value: data.stats.enrolledTotal,        icon: '🎓', color: 'bg-green-50 text-green-700' },
    { label: 'Enrolled This Month', value: data.stats.enrolledMonth,    icon: '📈', color: 'bg-teal-50 text-teal-700' },
    { label: 'Total Students',  value: data.stats.totalStudents,        icon: '👥', color: 'bg-orange-50 text-orange-700' },
    { label: 'Active Colleges', value: data.stats.totalColleges,        icon: '🏫', color: 'bg-indigo-50 text-indigo-700' },
    { label: 'Commission Pending', value: fmt(data.stats.commissionPending),  icon: '⏳', color: 'bg-yellow-50 text-yellow-700' },
    { label: 'Commission This Month', value: fmt(data.stats.commissionReceivedMonth), icon: '💰', color: 'bg-emerald-50 text-emerald-700' },
  ] : [];

  const STATUS_COLORS = {
    New:'bg-blue-100 text-blue-700', Contacted:'bg-yellow-100 text-yellow-700',
    Visited:'bg-purple-100 text-purple-700', Applied:'bg-orange-100 text-orange-700',
    Enrolled:'bg-green-100 text-green-700', Dropped:'bg-red-100 text-red-700',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-brand">Dashboard</h1>
        <p className="text-sm text-gray-400">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <div key={i} className="card p-5 animate-pulse h-24 bg-gray-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map(s => (
            <div key={s.label} className={`rounded-xl p-5 ${s.color.split(' ')[0]}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{s.icon}</span>
              </div>
              <p className={`text-2xl font-extrabold ${s.color.split(' ')[1]}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent enquiries */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-bold text-brand">Recent Enquiries</h2>
            <Link to="/admin/enquiries" className="text-xs text-brand-light hover:underline">View all →</Link>
          </div>
          <div className="divide-y">
            {data?.recentEnquiries?.map(e => (
              <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{e.student?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{e.college?.name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`badge ${STATUS_COLORS[e.status]}`}>{e.status}</span>
                  <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Follow-ups due */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-bold text-brand">⏰ Follow-ups Due (Next 3 days)</h2>
          </div>
          {data?.followUps?.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">No follow-ups due. 🎉</p>
          ) : (
            <div className="divide-y">
              {data?.followUps?.map(e => (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800">{e.student?.name}</p>
                    <p className="text-xs text-gray-400">{e.college?.name}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-semibold text-orange-600">
                      {new Date(e.followUpDate).toLocaleDateString('en-IN')}
                    </p>
                    <a href={`tel:${e.student?.phone}`} className="text-xs text-brand hover:underline">
                      📱 {e.student?.phone}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
