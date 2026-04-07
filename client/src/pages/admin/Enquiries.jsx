import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEnquiries, updateEnquiry } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

const STATUSES = ['New','Contacted','Visited','Applied','Enrolled','Dropped'];
const STATUS_COLORS = {
  New:'bg-blue-100 text-blue-700 border-blue-200',
  Contacted:'bg-yellow-100 text-yellow-700 border-yellow-200',
  Visited:'bg-purple-100 text-purple-700 border-purple-200',
  Applied:'bg-orange-100 text-orange-700 border-orange-200',
  Enrolled:'bg-green-100 text-green-700 border-green-200',
  Dropped:'bg-red-100 text-red-700 border-red-200',
};

export default function Enquiries() {
  usePageTitle('Enquiries');
  const [filter, setFilter]   = useState({ status: '', search: '' });
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-enquiries', filter],
    queryFn: () => getEnquiries(filter),
  });

  const mutation = useMutation({
    mutationFn: ({ id, ...d }) => updateEnquiry(id, d),
    onSuccess: () => { qc.invalidateQueries(['admin-enquiries']); qc.invalidateQueries(['dashboard']); setEditing(null); },
  });

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-extrabold text-brand">Enquiries</h1>

      {/* Status count badges */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter(f => ({ ...f, status: '' }))}
          className={`badge text-sm px-3 py-1 border ${!filter.status ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'}`}>
          All ({data?.total || 0})
        </button>
        {data?.statusCounts?.map(s => (
          <button key={s.status} onClick={() => setFilter(f => ({ ...f, status: s.status }))}
            className={`badge text-sm px-3 py-1 border ${filter.status === s.status ? STATUS_COLORS[s.status] : 'bg-white text-gray-600 border-gray-200'}`}>
            {s.status} ({s.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <input className="input max-w-xs" placeholder="Search by name, phone, college…"
        value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} />

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand text-white">
            <tr>
              {['Student','Phone','College','Course','Status','Follow-up','Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(8).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse border-b">
                  <td colSpan={7} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-full" /></td>
                </tr>
              ))
            ) : data?.enquiries?.map((e, i) => (
              <tr key={e.id} className={`border-b ${i % 2 === 0 ? '' : 'bg-gray-50'} hover:bg-brand-pale/40 transition-colors`}>
                <td className="px-4 py-3 font-medium">{e.student?.name}</td>
                <td className="px-4 py-3">
                  <a href={`tel:${e.student?.phone}`} className="text-brand hover:underline">{e.student?.phone}</a>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{e.college?.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{e.course?.name || '—'}</td>
                <td className="px-4 py-3">
                  <select
                    value={e.status}
                    onChange={ev => mutation.mutate({ id: e.id, status: ev.target.value })}
                    className={`badge border text-xs px-2 py-1 rounded-full cursor-pointer ${STATUS_COLORS[e.status]}`}
                  >
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {e.followUpDate ? new Date(e.followUpDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditing(e)} className="text-xs text-brand hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="font-bold text-brand text-lg mb-4">Edit Enquiry — {editing.student?.name}</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.target);
              mutation.mutate({ id: editing.id, status: fd.get('status'), notes: fd.get('notes'), followUpDate: fd.get('followUpDate') || null });
            }} className="space-y-3">
              <div>
                <label className="label">Status</label>
                <select name="status" defaultValue={editing.status} className="input">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Follow-up Date</label>
                <input name="followUpDate" type="date" className="input"
                  defaultValue={editing.followUpDate ? editing.followUpDate.split('T')[0] : ''} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea name="notes" rows={3} className="input" defaultValue={editing.notes || ''} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>Save</button>
                <button type="button" onClick={() => setEditing(null)} className="btn-outline flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
