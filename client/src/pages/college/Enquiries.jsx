import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollegeEnquiries, updateCollegeEnquiry } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

const STATUSES = ['All', 'New', 'Contacted', 'Visited', 'Applied', 'Enrolled', 'Dropped'];

const STATUS_BADGE = {
  New: 'bg-blue-100 text-blue-700',
  Contacted: 'bg-yellow-100 text-yellow-700',
  Visited: 'bg-purple-100 text-purple-700',
  Applied: 'bg-indigo-100 text-indigo-700',
  Enrolled: 'bg-emerald-100 text-emerald-700',
  Dropped: 'bg-gray-100 text-gray-600',
};

const COLLEGE_ALLOWED_STATUSES = ['New', 'Contacted', 'Visited', 'Applied', 'Dropped'];

export default function CollegeEnquiries() {
  usePageTitle('Enquiries — College Portal');

  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const params = { page, limit: 30 };
  if (filter !== 'All') params.status = filter;
  if (search.trim()) params.search = search.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['college-enquiries', params],
    queryFn: () => getCollegeEnquiries(params),
    keepPreviousData: true,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCollegeEnquiry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['college-enquiries']);
      queryClient.invalidateQueries(['college-dashboard']);
      setSelected(null);
    },
  });

  function openDetail(enq) {
    setSelected(enq);
    setEditNotes(enq.notes || '');
    setEditStatus(enq.status);
  }

  function handleSave() {
    const changes = {};
    if (editStatus !== selected.status) changes.status = editStatus;
    if (editNotes !== (selected.notes || '')) changes.notes = editNotes;
    if (Object.keys(changes).length === 0) { setSelected(null); return; }
    updateMutation.mutate({ id: selected.id, data: changes });
  }

  const enquiries = data?.enquiries || [];
  const statusCounts = data?.statusCounts || {};
  const totalPages = data?.pages || 1;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Enquiries</h1>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => {
          const count = s === 'All' ? data?.total : statusCounts[s];
          return (
            <button key={s} onClick={() => { setFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === s ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-emerald-300'
              }`}>
              {s} {count !== undefined ? `(${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input type="text" placeholder="Search by student name or phone..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full sm:w-80 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-400" />

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : enquiries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">No enquiries found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Course</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Source</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map(enq => (
                  <tr key={enq.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{enq.student.name}</p>
                      <p className="text-xs text-gray-500">{enq.student.phone}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-600">{enq.course?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[enq.status] || 'bg-gray-100'}`}>
                        {enq.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">{enq.source || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(enq.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(enq)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40">← Prev</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40">Next →</button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-gray-900">Enquiry #{selected.id}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Student info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-semibold text-gray-900">{selected.student.name}</p>
                <p className="text-sm text-gray-500">{selected.student.phone} {selected.student.email ? `· ${selected.student.email}` : ''}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {selected.student.city || ''} {selected.student.stream ? `· ${selected.student.stream}` : ''}
                  {selected.student.percentage ? ` · ${selected.student.percentage}%` : ''}
                </p>
              </div>

              {/* Course */}
              {selected.course && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Course</p>
                  <p className="text-sm font-medium">{selected.course.name} {selected.course.category ? `(${selected.course.category})` : ''}</p>
                  {selected.course.totalFee && <p className="text-xs text-gray-500">Total fee: ₹{selected.course.totalFee?.toLocaleString('en-IN')}</p>}
                </div>
              )}

              {/* Status update */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400">
                  {COLLEGE_ALLOWED_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  {selected.status === 'Enrolled' && <option value="Enrolled" disabled>Enrolled (admin only)</option>}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                  placeholder="Add notes about this enquiry..." />
              </div>

              {/* Save */}
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={updateMutation.isPending}
                  className="flex-1 bg-emerald-600 text-white font-semibold py-2.5 rounded-lg hover:bg-emerald-700 transition-colors text-sm disabled:opacity-50">
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setSelected(null)} className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>

              {updateMutation.isError && (
                <p className="text-red-500 text-xs text-center">
                  {updateMutation.error?.response?.data?.error || 'Failed to update'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
