import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { agentRefer, getAgentColleges } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

export default function AgentRefer() {
  usePageTitle('Refer Student — Agent Portal');
  const navigate = useNavigate();
  const [form, setForm] = useState({
    studentName: '', studentPhone: '', studentEmail: '',
    collegeId: '', courseId: '', preferredCat: '', notes: '',
  });
  const [collegeSearch, setCollegeSearch] = useState('');
  const [selectedCollege, setSelectedCollege] = useState(null);
  const [success, setSuccess] = useState(null);

  const { data: collegesData } = useQuery({
    queryKey: ['agent-colleges', collegeSearch],
    queryFn: () => getAgentColleges({ search: collegeSearch }),
    enabled: collegeSearch.length >= 2,
  });

  const filteredColleges = collegesData?.colleges || [];

  const mutation = useMutation({
    mutationFn: agentRefer,
    onSuccess: (data) => {
      setSuccess(data);
      setSelectedCollege(null);
      setForm({ studentName: '', studentPhone: '', studentEmail: '', collegeId: '', courseId: '', preferredCat: '', notes: '' });
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.studentName.trim() || !form.studentPhone.trim() || !form.collegeId) return;
    mutation.mutate({
      ...form,
      collegeId: Number(form.collegeId),
      courseId: form.courseId ? Number(form.courseId) : undefined,
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Refer a Student</h1>
      <p className="text-sm text-gray-500 mb-6">Submit a student referral to earn commissions when they enrol.</p>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <p className="text-green-700 font-medium text-sm">Referral submitted successfully!</p>
          <p className="text-green-600 text-xs mt-1">
            {success.student?.name} → {success.college?.name}
          </p>
          <div className="flex gap-3 mt-3">
            <button onClick={() => setSuccess(null)}
              className="text-xs text-green-600 hover:underline font-medium">Refer Another</button>
            <button onClick={() => navigate('/agent-portal/leads')}
              className="text-xs text-green-600 hover:underline font-medium">View My Leads →</button>
          </div>
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Student Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Student Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Student Name *</label>
                <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g. Rahul Kumar"
                  value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Phone *</label>
                <input type="tel" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  placeholder="+91 98765 43210"
                  value={form.studentPhone} onChange={e => setForm(f => ({ ...f, studentPhone: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  placeholder="student@email.com"
                  value={form.studentEmail} onChange={e => setForm(f => ({ ...f, studentEmail: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Preferred Category</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  value={form.preferredCat} onChange={e => setForm(f => ({ ...f, preferredCat: e.target.value }))}>
                  <option value="">Select...</option>
                  {['Nursing', 'Allied Health', 'Engineering', 'Management', 'Commerce', 'Science', 'Arts', 'Medical', 'Pharmacy', 'Law', 'Education', 'Other'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* College Selection */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900">College *</h3>
            {selectedCollege ? (
              <div className="flex items-center justify-between bg-orange-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedCollege.name}</p>
                  <p className="text-xs text-gray-500">{selectedCollege.city}, {selectedCollege.state}</p>
                </div>
                <button type="button" onClick={() => { setForm(f => ({ ...f, collegeId: '', courseId: '' })); setSelectedCollege(null); }}
                  className="text-xs text-red-500 hover:underline">Change</button>
              </div>
            ) : (
              <div>
                <input type="text" placeholder="Search colleges by name or city..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  value={collegeSearch} onChange={e => setCollegeSearch(e.target.value)} />
                {filteredColleges.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg">
                    {filteredColleges.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { setForm(f => ({ ...f, collegeId: String(c.id) })); setSelectedCollege(c); setCollegeSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.city}, {c.state}</p>
                      </button>
                    ))}
                  </div>
                )}
                {collegeSearch && filteredColleges.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">No colleges found for "{collegeSearch}"</p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <label className="text-xs font-medium text-gray-600 block mb-1">Notes (optional)</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
              rows={3} placeholder="Any additional info about the student..."
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {mutation.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-sm">{mutation.error?.response?.data?.error || 'Failed to submit referral'}</p>
            </div>
          )}

          <button type="submit" disabled={mutation.isPending || !form.studentName || !form.studentPhone || !form.collegeId}
            className="w-full bg-orange-600 text-white font-semibold py-3 rounded-xl hover:bg-orange-700 disabled:opacity-50 transition-colors">
            {mutation.isPending ? 'Submitting…' : 'Submit Referral'}
          </button>
        </form>
      )}
    </div>
  );
}
