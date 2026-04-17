import { useQuery } from '@tanstack/react-query';
import { getCollegeCourses } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

function fmtFee(val) {
  if (!val) return '—';
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${Math.round(val / 1000)}K`;
  return `₹${val}`;
}

export default function CollegeCourses() {
  usePageTitle('Courses — College Portal');

  const { data, isLoading, error } = useQuery({
    queryKey: ['college-courses'],
    queryFn: getCollegeCourses,
  });

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

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500 mt-1">{courses.length} courses listed</p>
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
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Enquiries</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
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
                      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{course._count?.enquiries || 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          course.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {course.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
        Need to update course details or fees? Contact your Campus Search relationship manager or email <a href="mailto:md@adsomia.com" className="text-emerald-600 underline">md@adsomia.com</a>.
      </div>
    </div>
  );
}
