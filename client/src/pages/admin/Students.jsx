import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStudents, createStudent } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

export default function Students() {
  usePageTitle('Students');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['students', search],
    queryFn: () => getStudents({ search }),
  });

  const mutation = useMutation({
    mutationFn: createStudent,
    onSuccess: () => { qc.invalidateQueries(['students']); setShowAdd(false); },
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold text-brand">Students</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Student</button>
      </div>

      <div className="flex gap-3">
        <input className="input max-w-xs" placeholder="Search name, phone, email…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="text-sm text-gray-400 self-center">{data?.total || 0} students</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand text-white">
            <tr>
              {['Name','Phone','City','Category','Budget','12th %','Source','Enquiries'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(8).fill(0).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td colSpan={8} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded" /></td>
                </tr>
              ))
            ) : data?.students?.map((s, i) => (
              <tr key={s.id} className={`border-b ${i % 2 ? 'bg-gray-50' : ''} hover:bg-brand-pale/40`}>
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3"><a href={`tel:${s.phone}`} className="text-brand hover:underline">{s.phone}</a></td>
                <td className="px-4 py-3 text-gray-500">{s.city || '—'}</td>
                <td className="px-4 py-3"><span className="badge bg-brand-pale text-brand">{s.preferredCat || '—'}</span></td>
                <td className="px-4 py-3 text-gray-600">{s.budgetMax ? `₹${(s.budgetMax/100000).toFixed(1)}L` : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{s.percentage ? `${s.percentage}%` : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.source || '—'}</td>
                <td className="px-4 py-3 text-center font-bold text-brand">{s._count?.enquiries || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add student modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-brand text-lg mb-4">Add New Student</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = Object.fromEntries(new FormData(e.target));
              ['budgetMax','percentage'].forEach(k => { if (fd[k]) fd[k] = Number(fd[k]); else delete fd[k]; });
              mutation.mutate(fd);
            }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Name *</label><input name="name" className="input" required /></div>
                <div><label className="label">Phone *</label><input name="phone" className="input" required /></div>
              </div>
              <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">City</label><input name="city" className="input" /></div>
                <div><label className="label">Source</label>
                  <select name="source" className="input">
                    {['Website','WhatsApp','Referral','Walk-in','Phone'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Preferred Stream</label>
                  <select name="preferredCat" className="input">
                    <option value="">—</option>
                    {['Nursing','Engineering','Allied Health','Medical','Management','CS & IT'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="label">12th %</label><input name="percentage" type="number" step="0.1" className="input" /></div>
              </div>
              <div><label className="label">Max Budget (₹)</label><input name="budgetMax" type="number" className="input" /></div>
              <div><label className="label">Notes</label><textarea name="notes" rows={2} className="input" /></div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>Save</button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-outline flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
