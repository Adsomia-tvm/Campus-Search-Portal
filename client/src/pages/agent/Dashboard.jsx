import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getAgentDashboard } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

function fmtMoney(val) {
  if (!val) return '₹0';
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val}`;
}

const STATUS_COLORS = {
  New: 'bg-blue-100 text-blue-700',
  Contacted: 'bg-yellow-100 text-yellow-700',
  Visited: 'bg-purple-100 text-purple-700',
  Applied: 'bg-indigo-100 text-indigo-700',
  Enrolled: 'bg-green-100 text-green-700',
  Dropped: 'bg-red-100 text-red-700',
};

export default function AgentDashboard() {
  usePageTitle('Dashboard — Agent Portal');

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: getAgentDashboard,
  });

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm">Failed to load dashboard.</div>
    </div>
  );

  const { referralCode, commissionRate, isVerified, stats, commissions, recentLeads } = data;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Referral Code Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-orange-200 text-sm">Your Referral Code</p>
            <p className="text-3xl font-extrabold tracking-wider">{referralCode}</p>
            <p className="text-orange-200 text-sm mt-1">Commission Rate: {commissionRate}%</p>
          </div>
          <Link to="/agent-portal/refer"
            className="inline-flex items-center gap-2 bg-white text-orange-600 font-semibold px-5 py-2.5 rounded-xl hover:bg-orange-50 transition-colors text-sm">
            ➕ Refer a Student
          </Link>
        </div>
        {!isVerified && (
          <div className="mt-3 bg-orange-700/50 rounded-lg px-3 py-2 text-sm text-orange-100">
            ⚠️ Your account is pending verification. Complete your profile to start earning commissions.
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: stats.totalLeads, color: 'text-gray-900' },
          { label: 'Active', value: stats.active, color: 'text-blue-600' },
          { label: 'Enrolled', value: stats.enrolled, color: 'text-green-600' },
          { label: 'Dropped', value: stats.dropped, color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className={`text-2xl font-extrabold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Commission Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium">Total Earned</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmtMoney(commissions.total)}</p>
          <p className="text-xs text-gray-400 mt-1">{commissions.count} commissions</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium">Pending</p>
          <p className="text-2xl font-extrabold text-yellow-600 mt-1">{fmtMoney(commissions.pending)}</p>
          <p className="text-xs text-gray-400 mt-1">Awaiting payment</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500 font-medium">Paid Out</p>
          <p className="text-2xl font-extrabold text-green-600 mt-1">{fmtMoney(commissions.paid)}</p>
          <p className="text-xs text-gray-400 mt-1">Received in bank</p>
        </div>
      </div>

      {/* Lead Funnel */}
      {stats.statusBreakdown && Object.keys(stats.statusBreakdown).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Lead Funnel</h3>
          <div className="space-y-2">
            {['New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'].map(status => {
              const count = stats.statusBreakdown[status] || 0;
              const pct = stats.totalLeads > 0 ? (count / stats.totalLeads * 100) : 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-20 text-gray-600">{status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_COLORS[status]?.split(' ')[0] || 'bg-gray-300'}`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Leads */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">Recent Leads</h3>
          <Link to="/agent-portal/leads" className="text-xs text-orange-600 hover:underline font-medium">View All →</Link>
        </div>
        {recentLeads?.length ? (
          <div className="space-y-2">
            {recentLeads.map(lead => (
              <div key={lead.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{lead.student?.name}</p>
                  <p className="text-xs text-gray-400">{lead.college?.name} · {lead.course?.name || lead.student?.preferredCat || '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                  {lead.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No leads yet. Start by referring a student!</p>
        )}
      </div>
    </div>
  );
}
