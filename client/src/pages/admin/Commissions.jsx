import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCommissions, updateCommission, createCommission } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

const STATUS_COLORS = {
  Pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Received: 'bg-green-100 text-green-700 border-green-200',
  Partial: 'bg-blue-100 text-blue-700 border-blue-200',
};

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

export default function Commissions() {
  usePageTitle('Commissions');
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['commissions', filter],
    queryFn: () => getCommissions(filter),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => updateCommission(id, d),
    onSuccess: () => qc.invalidateQueries(['commissions']),
  });

  const createMut = useMutation({
    mutationFn: createCommission,
    onSuccess: () => { qc.invalidateQueries(['commissions']); setShowAdd(false); },
  });

  const summary = data?.summary || {};

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold text-brand">Commissions</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Commission</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Expected', value: fmt(summary.totalExpected), color: 'bg-purple-50 text-purple-700' },
          { label: 'Total Received', value: fmt(summary.totalReceived), color: 'bg-green-50 text-green-700' },
          { label: 'Pending Amount', value: fmt(summary.totalPending), color: 'bg-yellow-50 text-yellow-700' },
          { label: 'Records', value: data?.total || 0, color: 'bg-blue-50 text-blue-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color.split(' ')[0]}`}>
            <p className={`text-xl font-extrabold ${s.color.split(' ')[1]}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input className="input max-w-xs" placeholder="Search college or student…"
          value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} />
        <select className="input w-40" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          {['Pending', 'Partial', 'Received'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand text-white">
            <tr>
              {['Student','College','Expected','Received','Status','Payment Date','Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(6).fill(0).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td colSpan={7} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded" /></td>
                </tr>
              ))
            ) : data?.commissions?.map((c, i) => (
              <tr key={c.id} className={`border-b ${i % 2 ? 'bg-gray-50' : ''} hover:bg-brand-pale/40 transition-colors`}>
                <td className="px-4 py-3 font-medium">{c.enquiry?.student?.name || '—'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{c.enquiry?.college?.name || '—'}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">{fmt(c.expectedAmount)}</td>
                <td className="px-4 py-3 text-green-700 font-semibold">{fmt(c.receivedAmount)}</td>
                <td className="px-4 py-3">
                  <select
                    value={c.status}
                    onChange={ev => updateMut.mutate({ id: c.id, status: ev.target.value })}
                    className={`badge border text-xs px-2 py-1 rounded-full cursor-pointer ${STATUS_COLORS[c.status]}`}
                  >
                    {['Pending', 'Partial', 'Received'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {c.paymentDate ? new Date(c.paymentDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => updateMut.mutate({ id: c.id, status: 'Received', receivedAmount: c.expectedAmount })}
                    disabled={c.status === 'Received' || updateMut.isPending}
                    className="text-xs text-green-600 hover:underline disabled:text-gray-300 disabled:no-underline"
                  >
                    ✓ Mark Received
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !data?.commissions?.length && (
          <p className="text-center py-12 text-gray-400 text-sm">No commissions found.</p>
        )}
      </div>

      {/* Add Commission Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-brand text-lg mb-4">Add Commission Record</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = Object.fromEntries(new FormData(e.target));
              ['expectedAmount', 'receivedAmount'].forEach(k => { if (fd[k]) fd[k] = Number(fd[k]); else delete fd[k]; });
              createMut.mutate(fd);
            }} className="space-y-3">
              <div><label className="label">Enquiry ID *</label><input name="enquiryId" className="input" required placeholder="e.g. clxyz123" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Expected (₹) *</label><input name="expectedAmount" type="number" className="input" required /></div>
                <div><label className="label">Received (₹)</label><input name="receivedAmount" type="number" className="input" /></div>
              </div>
              <div><label className="label">Status</label>
                <select name="status" className="input">
                  {['Pending', 'Partial', 'Received'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Notes</label><textarea name="notes" rows={2} className="input" /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={createMut.isPending}>Save</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-outline flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
