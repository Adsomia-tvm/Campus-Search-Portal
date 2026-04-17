import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollegeCourses, updateCollegeCourse } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

function fmtFee(val) {
  if (!val) return '—';
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${Math.round(val / 1000)}K`;
  return `₹${val}`;
}

function FeeInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
        <input
          type="number"
          className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="0"
        />
      </div>
    </div>
  );
}

export default function CollegeCourses() {
  usePageTitle('Courses — College Portal');
  const qc = useQueryClient();
  const [editingCourse, setEditingCourse] = useState(null);
  const [feeForm, setFeeForm] = useState({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['college-courses'],
    queryFn: getCollegeCourses,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...fees }) => updateCollegeCourse(id, fees),
    onSuccess: () => {
      qc.invalidateQueries(['college-courses']);
      setEditingCourse(null);
    },
  });

  function openEdit(course) {
    setEditingCourse(course);
    setFeeForm({
      y1Fee: course.y1Fee,
      y2Fee: course.y2Fee,
      y3Fee: course.y3Fee,
      y4Fee: course.y4Fee,
      y5Fee: course.y5Fee,
      totalFee: course.totalFee,
      hostelPerYr: course.hostelPerYr,
    });
  }

  function handleSave() {
    updateMutation.mutate({ id: editingCourse.id, ...feeForm });
  }

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm">Failed to load courses.</div>
    </div>
  );

  const courses = data?.courses || [];

  // Group by category
  const grouped = {};
  courses.forEach(c => {
    const cat = c.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  // Determine year columns based on max duration
  const maxDuration = Math.max(...courses.map(c => c.durationYrs || 0), 1);

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500 mt-1">{courses.length} courses listed — click Edit to update fees</p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📚</p>
          <p className="font-medium">No courses listed yet</p>
          <p className="text-sm mt-1">Contact Campus Search to add your courses.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              {category}
              <span className="text-sm font-normal text-gray-500 ml-2">({items.length})</span>
            </h2>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Course Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Level</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Duration</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Year 1 Fee</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Total Fee</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Hostel/Yr</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Enquiries</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(course => (
                    <tr key={course.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{course.name}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{course.degreeLevel || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{course.durationYrs ? `${course.durationYrs} yrs` : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtFee(course.y1Fee)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtFee(course.totalFee)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{fmtFee(course.hostelPerYr)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{course._count?.enquiries || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          course.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {course.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEdit(course)}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium hover:underline"
                        >
                          Edit Fees
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {/* Edit Fee Modal */}
      {editingCourse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Edit Fees</h2>
            <p className="text-sm text-gray-500 mb-5">{editingCourse.name} — {editingCourse.degreeLevel || ''} {editingCourse.category || ''}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FeeInput label="Year 1 Fee" value={feeForm.y1Fee} onChange={v => setFeeForm(f => ({ ...f, y1Fee: v }))} />
                <FeeInput label="Year 2 Fee" value={feeForm.y2Fee} onChange={v => setFeeForm(f => ({ ...f, y2Fee: v }))} />
              </div>
              {(maxDuration > 2 || feeForm.y3Fee) && (
                <div className="grid grid-cols-2 gap-3">
                  <FeeInput label="Year 3 Fee" value={feeForm.y3Fee} onChange={v => setFeeForm(f => ({ ...f, y3Fee: v }))} />
                  {(maxDuration > 3 || feeForm.y4Fee) && (
                    <FeeInput label="Year 4 Fee" value={feeForm.y4Fee} onChange={v => setFeeForm(f => ({ ...f, y4Fee: v }))} />
                  )}
                </div>
              )}
              {(maxDuration > 4 || feeForm.y5Fee) && (
                <div className="grid grid-cols-2 gap-3">
                  <FeeInput label="Year 5 Fee" value={feeForm.y5Fee} onChange={v => setFeeForm(f => ({ ...f, y5Fee: v }))} />
                  <div />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <FeeInput label="Total Fee" value={feeForm.totalFee} onChange={v => setFeeForm(f => ({ ...f, totalFee: v }))} />
                <FeeInput label="Hostel Per Year" value={feeForm.hostelPerYr} onChange={v => setFeeForm(f => ({ ...f, hostelPerYr: v }))} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingCourse(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Fees'}
              </button>
            </div>

            {updateMutation.error && (
              <p className="text-red-500 text-sm mt-2 text-center">
                {updateMutation.error?.response?.data?.error || 'Failed to update fees'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
