import { useSearchParams, Link } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { useCompareStore } from '../context/compare';
import { getCompare } from '../api';

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

export default function Compare() {
  usePageTitle('Compare Colleges');
  const { colleges: selected, clear } = useCompareStore();
  const ids = selected.map(c => c.id).join(',');

  const { data, isLoading } = useQuery({
    queryKey: ['compare', ids],
    queryFn: () => getCompare(ids),
    enabled: !!ids,
  });

  if (!selected.length) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <div className="text-6xl mb-4">↔</div>
          <h1 className="text-2xl font-bold text-brand mb-3">No colleges selected</h1>
          <p className="text-gray-500 mb-6">Go to college search and tick the checkbox on up to 3 colleges to compare them.</p>
          <Link to="/search" className="btn-primary">Browse Colleges →</Link>
        </div>
      </div>
    );
  }

  const colleges = data || selected;

  // Collect all unique category+course names across colleges
  const allCourseKeys = [...new Set(
    colleges.flatMap(c => (c.courses || []).map(r => `${r.category}||${r.name}`))
  )];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-extrabold text-brand">College Comparison</h1>
          <button onClick={clear} className="text-sm text-red-500 hover:underline">✕ Clear all</button>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-brand text-xl animate-pulse">Loading comparison…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr>
                  <td className="w-48 bg-gray-100 p-3 text-sm font-bold text-gray-500 uppercase">Feature</td>
                  {colleges.map(c => (
                    <th key={c.id} className="bg-brand text-white p-4 text-left text-sm font-bold">
                      <Link to={`/college/${c.id}`} className="hover:underline">{c.name}</Link>
                      {c.city && <p className="font-normal text-blue-200 text-xs">📍 {c.city}</p>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Info rows */}
                {[
                  ['Type',          c => c.type || '—'],
                  ['Approved by',   c => c.approvedBy || '—'],
                  ['Accreditation', c => c.accreditation || '—'],
                  ['Phone',         c => c.phone || '—'],
                ].map(([label, fn]) => (
                  <tr key={label} className="border-b">
                    <td className="p-3 bg-gray-50 text-sm font-semibold text-gray-600">{label}</td>
                    {colleges.map(c => <td key={c.id} className="p-3 text-sm text-gray-700">{fn(c)}</td>)}
                  </tr>
                ))}

                {/* Fee rows */}
                <tr><td colSpan={colleges.length + 1} className="bg-brand-pale px-3 py-2 text-xs font-bold text-brand uppercase tracking-wider">Courses & Fees</td></tr>

                {allCourseKeys.slice(0, 30).map(key => {
                  const [cat, courseName] = key.split('||');
                  return (
                    <tr key={key} className="border-b even:bg-gray-50">
                      <td className="p-3 text-xs text-gray-600">
                        <span className="badge bg-gray-100 text-gray-600 mb-1 block">{cat}</span>
                        {courseName}
                      </td>
                      {colleges.map(c => {
                        const course = c.courses?.find(r => r.category === cat && r.name === courseName);
                        return (
                          <td key={c.id} className="p-3 text-sm text-right">
                            {course ? (
                              <div>
                                <p className="font-bold text-brand">{fmt(course.totalFee)}</p>
                                {course.y1Fee && <p className="text-xs text-gray-400">Y1: {fmt(course.y1Fee)}</p>}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Link to="/search" className="btn-outline">← Back to Search</Link>
          <Link to="/enquire" className="btn-primary">Enquire Now →</Link>
        </div>
      </div>
    </div>
  );
}
