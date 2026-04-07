import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminColleges } from '../../api/index';
import api from '../../api/index';
import usePageTitle from '../../hooks/usePageTitle';

const EMPTY_COLLEGE = {
  name: '', city: '', state: '', type: 'Private',
  phone: '', email: '', website: '', address: '',
  approvedBy: '', accreditation: '', description: '', isActive: true,
};

const TYPES = ['Private', 'Government', 'Deemed', 'Autonomous'];

export default function Colleges() {
  usePageTitle('Colleges');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null); // null = add mode
  const [form, setForm]           = useState(EMPTY_COLLEGE);
  const [tab, setTab]             = useState('details'); // details | courses
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState({ name: '', category: '', degreeLevel: 'UG', totalFee: '', y1Fee: '', y2Fee: '', y3Fee: '', y4Fee: '', hostelPerYr: '', quota: 'Management', notes: '' });
  const [selectedCollege, setSelectedCollege] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-colleges', search, page],
    queryFn: () => getAdminColleges({ search, page, limit: 25 }),
  });

  const { data: collegeDetail } = useQuery({
    queryKey: ['admin-college-detail', selectedCollege?.id],
    queryFn: () => api.get(`/admin/colleges/${selectedCollege.id}`).then(r => r.data),
    enabled: !!selectedCollege?.id,
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editing
      ? api.put(`/admin/colleges/${editing.id}`, d).then(r => r.data)
      : api.post('/admin/colleges', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['admin-colleges']); setShowForm(false); setEditing(null); setForm(EMPTY_COLLEGE); },
  });

  const courseMutation = useMutation({
    mutationFn: (d) => api.post(`/admin/colleges/${selectedCollege.id}/courses`, d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['admin-college-detail', selectedCollege?.id]); setShowCourseForm(false); setCourseForm({ name: '', category: '', degreeLevel: 'UG', totalFee: '', y1Fee: '', y2Fee: '', y3Fee: '', y4Fee: '', hostelPerYr: '', quota: 'Management', notes: '' }); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.put(`/admin/colleges/${id}`, { isActive }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['admin-colleges']),
  });

  function openAdd() { setEditing(null); setForm(EMPTY_COLLEGE); setShowForm(true); }
  function openEdit(c) { setEditing(c); setForm({ name: c.name, city: c.city||'', state: c.state||'', type: c.type||'Private', phone: c.phone||'', email: c.email||'', website: c.website||'', address: c.address||'', approvedBy: c.approvedBy||'', accreditation: c.accreditation||'', description: c.description||'', isActive: c.isActive }); setShowForm(true); }
  function openCollege(c) { setSelectedCollege(c); setTab('details'); }

  const colleges = data?.colleges || [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Colleges</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} colleges total</p>
        </div>
        <button onClick={openAdd} className="btn-primary">+ Add College</button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input className="input max-w-sm" placeholder="Search by name, city…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand text-white">
            <tr>
              {['College', 'City', 'Type', 'Courses', 'Enquiries', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(8).fill(0).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td colSpan={7} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded" /></td>
                </tr>
              ))
            ) : colleges.map((c, i) => (
              <tr key={c.id} className={`border-b ${i % 2 === 0 ? '' : 'bg-gray-50'} hover:bg-brand-pale/30 cursor-pointer`}
                onClick={() => openCollege(c)}>
                <td className="px-4 py-3 font-medium text-brand hover:underline max-w-[220px]">
                  <div className="truncate">{c.name}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.city || '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {c.type || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center font-medium">{c._count?.courses || 0}</td>
                <td className="px-4 py-3 text-center font-medium">{c._count?.enquiries || 0}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(c)} className="text-xs text-brand hover:underline">Edit</button>
                    <button onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })}
                      className={`text-xs hover:underline ${c.isActive ? 'text-red-500' : 'text-green-600'}`}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1 rounded text-sm ${p === page ? 'bg-brand text-white' : 'bg-white border hover:bg-gray-50'}`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Add/Edit College Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl my-4">
            <h2 className="text-lg font-bold text-brand mb-4">
              {editing ? `Edit — ${editing.name}` : 'Add New College'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">College Name *</label>
                <input className="input" placeholder="e.g. St. Joseph's College of Nursing" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" placeholder="Bangalore" value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className="label">State</label>
                <input className="input" placeholder="Karnataka" value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Approved By (INC / AICTE etc.)</label>
                <input className="input" placeholder="INC, KNC" value={form.approvedBy}
                  onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="+91 98765 43210" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="info@college.edu" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Website</label>
                <input className="input" placeholder="https://college.edu" value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                <label className="label">Accreditation (NAAC / NBA)</label>
                <input className="input" placeholder="NAAC A+" value={form.accreditation}
                  onChange={e => setForm(f => ({ ...f, accreditation: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Address</label>
                <input className="input" placeholder="Full address" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Description</label>
                <textarea className="input" rows={3} placeholder="Brief description of the college…" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="active" checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-brand" />
                <label htmlFor="active" className="text-sm text-gray-700">Active (visible on portal)</label>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name}
                className="btn-primary flex-1">
                {saveMutation.isPending ? 'Saving…' : (editing ? 'Save Changes' : 'Add College')}
              </button>
            </div>
            {saveMutation.error && (
              <p className="text-red-500 text-sm mt-2">{saveMutation.error?.response?.data?.error || 'An error occurred'}</p>
            )}
          </div>
        </div>
      )}

      {/* College Detail Side Panel */}
      {selectedCollege && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-bold text-brand">{selectedCollege.name}</h2>
                <p className="text-sm text-gray-500">{selectedCollege.city}, {selectedCollege.state}</p>
              </div>
              <button onClick={() => setSelectedCollege(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            {/* Tabs */}
            <div className="flex border-b px-5">
              {['details', 'courses'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                  {t === 'courses' ? `Courses (${collegeDetail?.courses?.length || 0})` : 'Details'}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {tab === 'details' && collegeDetail && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    ['Type', collegeDetail.type],
                    ['City', collegeDetail.city],
                    ['State', collegeDetail.state],
                    ['Approved By', collegeDetail.approvedBy],
                    ['Accreditation', collegeDetail.accreditation],
                    ['Phone', collegeDetail.phone],
                    ['Email', collegeDetail.email],
                    ['Website', collegeDetail.website],
                    ['Total Enquiries', collegeDetail._count?.enquiries],
                  ].map(([k, v]) => v ? (
                    <div key={k}>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{k}</p>
                      <p className="text-gray-800 mt-0.5">{v}</p>
                    </div>
                  ) : null)}
                  {collegeDetail.address && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Address</p>
                      <p className="text-gray-800 mt-0.5">{collegeDetail.address}</p>
                    </div>
                  )}
                  {collegeDetail.description && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Description</p>
                      <p className="text-gray-600 mt-0.5 text-xs leading-relaxed">{collegeDetail.description}</p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'courses' && (
                <div className="space-y-3">
                  <button onClick={() => setShowCourseForm(true)} className="btn-primary text-sm">+ Add Course</button>
                  {collegeDetail?.courses?.map(course => (
                    <div key={course.id} className="border rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{course.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{course.category} · {course.degreeLevel} · {course.quota}</p>
                        </div>
                        <div className="text-right">
                          {course.totalFee ? (
                            <p className="font-bold text-brand">₹{Number(course.totalFee).toLocaleString('en-IN')}</p>
                          ) : null}
                          {course.hostelPerYr ? (
                            <p className="text-xs text-gray-400">Hostel: ₹{Number(course.hostelPerYr).toLocaleString('en-IN')}/yr</p>
                          ) : null}
                        </div>
                      </div>
                      {(course.y1Fee || course.y2Fee || course.y3Fee || course.y4Fee) && (
                        <div className="flex gap-3 mt-2 text-xs text-gray-500">
                          {[course.y1Fee, course.y2Fee, course.y3Fee, course.y4Fee, course.y5Fee].map((f, i) => f ? (
                            <span key={i}>Y{i+1}: ₹{Number(f).toLocaleString('en-IN')}</span>
                          ) : null)}
                        </div>
                      )}
                      {course.notes && <p className="text-xs text-gray-400 mt-2 italic">{course.notes}</p>}
                    </div>
                  ))}
                  {!collegeDetail?.courses?.length && (
                    <p className="text-center text-gray-400 py-8">No courses added yet. Click "+ Add Course" to add one.</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button onClick={() => { openEdit(selectedCollege); setSelectedCollege(null); }}
                className="btn-secondary text-sm">Edit College Info</button>
              <button onClick={() => setSelectedCollege(null)} className="btn-primary text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Course Modal */}
      {showCourseForm && selectedCollege && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-brand mb-4">Add Course — {selectedCollege.name}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Course Name *</label>
                <input className="input" placeholder="e.g. B.Sc Nursing" value={courseForm.name}
                  onChange={e => setCourseForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Category</label>
                <input className="input" placeholder="Nursing / Engineering / Allied Health" value={courseForm.category}
                  onChange={e => setCourseForm(f => ({ ...f, category: e.target.value }))} />
              </div>
              <div>
                <label className="label">Degree Level</label>
                <select className="input" value={courseForm.degreeLevel}
                  onChange={e => setCourseForm(f => ({ ...f, degreeLevel: e.target.value }))}>
                  {['UG','PG','Diploma','Lateral','Certificate'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Quota</label>
                <select className="input" value={courseForm.quota}
                  onChange={e => setCourseForm(f => ({ ...f, quota: e.target.value }))}>
                  {['Management','General','NRI','Government'].map(q => <option key={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Total Fee (₹)</label>
                <input className="input" type="number" placeholder="500000" value={courseForm.totalFee}
                  onChange={e => setCourseForm(f => ({ ...f, totalFee: e.target.value }))} />
              </div>
              {['y1Fee','y2Fee','y3Fee','y4Fee'].map((k, i) => (
                <div key={k}>
                  <label className="label">Year {i+1} Fee (₹)</label>
                  <input className="input" type="number" placeholder="125000" value={courseForm[k]}
                    onChange={e => setCourseForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="label">Hostel/yr (₹)</label>
                <input className="input" type="number" placeholder="80000" value={courseForm.hostelPerYr}
                  onChange={e => setCourseForm(f => ({ ...f, hostelPerYr: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <input className="input" placeholder="Any special notes" value={courseForm.notes}
                  onChange={e => setCourseForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCourseForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => {
                  const d = { ...courseForm };
                  ['totalFee','y1Fee','y2Fee','y3Fee','y4Fee','hostelPerYr'].forEach(k => { if (d[k]) d[k] = Number(d[k]); else delete d[k]; });
                  courseMutation.mutate(d);
                }}
                disabled={courseMutation.isPending || !courseForm.name}
                className="btn-primary flex-1">
                {courseMutation.isPending ? 'Saving…' : 'Add Course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
