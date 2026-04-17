import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getCollegeDashboard } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

function StatCard({ label, value, color = 'text-gray-900', bg = 'bg-white', icon }) {
  return (
    <div className={`${bg} border border-gray-100 rounded-2xl p-5`}>
      {icon && <div className="text-2xl mb-2">{icon}</div>}
      <p className={`text-3xl font-extrabold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function FunnelBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 text-gray-600 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
        <div className={`h-full ${color} rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
          style={{ width: `${Math.max(pct, 2)}%` }}>
          {count > 0 && <span className="text-xs text-white font-bold">{count}</span>}
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  New: 'bg-blue-500',
  Contacted: 'bg-yellow-500',
  Visited: 'bg-purple-500',
  Applied: 'bg-indigo-500',
  Enrolled: 'bg-emerald-500',
  Dropped: 'bg-gray-400',
};

const STATUS_BADGE = {
  New: 'bg-blue-100 text-blue-700',
  Contacted: 'bg-yellow-100 text-yellow-700',
  Visited: 'bg-purple-100 text-purple-700',
  Applied: 'bg-indigo-100 text-indigo-700',
  Enrolled: 'bg-emerald-100 text-emerald-700',
  Dropped: 'bg-gray-100 text-gray-600',
};

export default function CollegeDashboard() {
  usePageTitle('College Dashboard');

  const { data, isLoading, error } = useQuery({
    queryKey: ['college-dashboard'],
    queryFn: getCollegeDashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm">
        Failed to load dashboard. {error.message}
      </div>
    </div>
  );

  const { college, leads, funnel, conversion, recentLeads } = data;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {college.logoUrl && <img src={college.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border" />}
          <div>
            <p className="font-semibold text-gray-900 text-sm">{college.name}</p>
            <p className="text-xs text-gray-500">{college.city}, {college.state}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
            college.partnershipTier === 'Elite' ? 'bg-yellow-100 text-yellow-700' :
            college.partnershipTier === 'Growth' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {college.partnershipTier}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📩" label="Total Leads" value={leads.total} color="text-emerald-700" bg="bg-emerald-50" />
        <StatCard icon="📅" label="This Month" value={leads.thisMonth} color="text-blue-700" bg="bg-blue-50" />
        <StatCard icon="🔥" label="Last 7 Days" value={leads.last7Days} color="text-orange-600" bg="bg-orange-50" />
        <StatCard icon="🎓" label="Conversion Rate" value={`${conversion.ratePct}%`} color="text-purple-700" bg="bg-purple-50" />
      </div>

      {/* Funnel + Recent Leads */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="font-bold text-gray-900 mb-4">Lead Funnel</h2>
          <div className="space-y-3">
            {funnel.map(f => (
              <FunnelBar key={f.status} label={f.status} count={f.count} total={leads.total}
                color={STATUS_COLORS[f.status] || 'bg-gray-400'} />
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">Enrolled</span>
            <span className="font-bold text-emerald-600">{conversion.enrolled} / {conversion.total}</span>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900">Recent Leads</h2>
            <Link to="/college-portal/enquiries" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              View all →
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No leads yet</p>
          ) : (
            <div className="space-y-3">
              {recentLeads.slice(0, 8).map(lead => (
                <Link key={lead.id} to={`/college-portal/enquiries?id=${lead.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-700 truncate">
                      {lead.student.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {lead.course?.name || lead.student.preferredCat || 'General'}
                      {lead.student.city ? ` · ${lead.student.city}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                      {lead.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lead cap warning */}
      {college.monthlyLeadCap && leads.thisMonth >= college.monthlyLeadCap * 0.8 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <strong>Lead cap notice:</strong> You've received {leads.thisMonth} of {college.monthlyLeadCap} leads this month.
          {leads.thisMonth >= college.monthlyLeadCap
            ? ' Your monthly cap has been reached. Contact Campus Search to increase your limit.'
            : ' You are approaching your monthly lead limit.'}
        </div>
      )}
    </div>
  );
}
