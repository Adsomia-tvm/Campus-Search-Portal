import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAgentLeads } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

const STATUS_COLORS = {
  New: 'bg-blue-100 text-blue-700',
  Contacted: 'bg-yellow-100 text-yellow-700',
  Visited: 'bg-purple-100 text-purple-700',
  Applied: 'bg-indigo-100 text-indigo-700',
  Enrolled: 'bg-green-100 text-green-700',
  Dropped: 'bg-red-100 text-red-700',
};

const TABS = ['All', 'New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];

export default function AgentLeads() {
  usePageTitle('My Leads — Agent Portal');
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-leads', tab, search, page],
    queryFn: () => getAgentLeads({
      status: tab === 'All' ? undefined : tab,
      search: search || undefined,
      page,
    }),
    keepPreviousData: true,
  });

  const leads = data?.leads || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">My Leads</h1>
        <p className="text-sm text-gray-500 mt-1">{total} total referred leads</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setPage(1); }}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              tab === t ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, phone, or college..."
        className="w-full max-w-md border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
      />

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">College</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Course</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Commission</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td colSpan={6} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-3/4" /></td>
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  <p className="text-3xl mb-2">👥</p>
                  <p className="font-medium">No leads found</p>
                  <p className="text-xs mt-1">Refer students to see them here</p>
                </td>
              </tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{lead.student?.name}</p>
                  <p className="text-xs text-gray-400">{lead.student?.phone}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                  <p className="truncate max-w-[200px]">{lead.college?.name}</p>
                  <p className="text-xs text-gray-400">{lead.college?.city}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {lead.course?.name || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status] || 'bg-gray-100'}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  {lead.commission ? (
                    <span className={`text-xs font-medium ${lead.commission.status === 'Received' ? 'text-green-600' : 'text-yellow-600'}`}>
                      ₹{lead.commission.amount?.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-400 hidden lg:table-cell">
                  {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-xs text-gray-500">Page {page} of {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
