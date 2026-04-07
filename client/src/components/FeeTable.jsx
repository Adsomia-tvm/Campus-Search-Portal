import { useState } from 'react';
import { useStudentStore } from '../context/studentAuth';
import StudentAuthModal from './StudentAuthModal';

const fmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

function CourseCard({ c }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-800 text-sm leading-snug flex-1">{c.name}</p>
        {c.degreeLevel && (
          <span className="badge bg-blue-100 text-blue-700 flex-shrink-0">{c.degreeLevel}</span>
        )}
      </div>
      {c.quota && <p className="text-xs text-gray-500">Quota: {c.quota}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {c.y1Fee > 0 && <div className="flex justify-between"><span className="text-gray-400">Year 1</span><span>{fmt(c.y1Fee)}</span></div>}
        {c.y2Fee > 0 && <div className="flex justify-between"><span className="text-gray-400">Year 2</span><span>{fmt(c.y2Fee)}</span></div>}
        {c.y3Fee > 0 && <div className="flex justify-between"><span className="text-gray-400">Year 3</span><span>{fmt(c.y3Fee)}</span></div>}
        {c.y4Fee > 0 && <div className="flex justify-between"><span className="text-gray-400">Year 4</span><span>{fmt(c.y4Fee)}</span></div>}
        {c.y5Fee > 0 && <div className="flex justify-between"><span className="text-gray-400">Year 5</span><span>{fmt(c.y5Fee)}</span></div>}
        {c.hostelPerYr > 0 && <div className="flex justify-between"><span className="text-gray-400">Hostel/yr</span><span>{fmt(c.hostelPerYr)}</span></div>}
      </div>
      {c.totalFee > 0 && (
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Total Fee</span>
          <span className="font-bold text-brand">{fmt(c.totalFee)}</span>
        </div>
      )}
    </div>
  );
}

export default function FeeTable({ courses, collegeId, collegeName }) {
  const student = useStudentStore(s => s.student);
  const [showModal, setShowModal] = useState(false);

  if (!courses?.length) return <p className="text-gray-400 text-sm">No fee data available.</p>;

  // Group by category
  const byCat = courses.reduce((acc, c) => {
    const k = c.category || 'Other';
    if (!acc[k]) acc[k] = [];
    acc[k].push(c);
    return acc;
  }, {});

  // ── Not logged in → show blurred preview + unlock CTA ──────────────────────
  if (!student) {
    const preview = courses.slice(0, 3);
    const previewByCat = preview.reduce((acc, c) => {
      const k = c.category || 'Other';
      if (!acc[k]) acc[k] = [];
      acc[k].push(c);
      return acc;
    }, {});

    return (
      <div className="relative">
        {/* Blurred preview */}
        <div className="blur-sm pointer-events-none select-none" aria-hidden>
          {/* Desktop table preview */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand text-white">
                  <th className="px-4 py-3 text-left">Course</th>
                  <th className="px-3 py-3 text-center">Degree</th>
                  <th className="px-3 py-3 text-right">Year 1</th>
                  <th className="px-3 py-3 text-right">Year 2</th>
                  <th className="px-3 py-3 text-right">Year 3</th>
                  <th className="px-3 py-3 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{c.name}</td>
                    <td className="px-3 py-2.5 text-center"><span className="badge bg-blue-100 text-blue-700">{c.degreeLevel || '—'}</span></td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y1Fee)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y2Fee)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y3Fee)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-brand">{fmt(c.totalFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile card preview */}
          <div className="md:hidden space-y-2">
            {Object.entries(previewByCat).map(([cat, catCourses]) => (
              <div key={cat}>
                <p className="text-xs font-bold text-brand uppercase tracking-wider mb-2 px-1">{cat}</p>
                {catCourses.map(c => <CourseCard key={c.id} c={c} />)}
              </div>
            ))}
          </div>
        </div>

        {/* Unlock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 rounded-xl">
          <div className="bg-white rounded-2xl shadow-xl border border-brand/20 p-6 mx-4 text-center max-w-sm w-full">
            <div className="text-4xl mb-3">🔒</div>
            <h3 className="text-lg font-bold text-brand mb-1">See Full Fee Breakdown</h3>
            <p className="text-sm text-gray-500 mb-4">
              {courses.length} courses available. Quick free signup to unlock all fees, year-wise breakdown &amp; hostel charges.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="w-full btn-primary py-3 text-base font-semibold">
              🔓 Unlock Fees — Free
            </button>
            <p className="text-xs text-gray-400 mt-3">Takes 10 seconds · No spam ever</p>
          </div>
        </div>

        {showModal && (
          <StudentAuthModal
            onClose={() => setShowModal(false)}
            collegeId={collegeId}
            collegeName={collegeName}
          />
        )}
      </div>
    );
  }

  // ── Logged in → show full fee table ────────────────────────────────────────
  return (
    <>
      {/* Logged-in badge */}
      <div className="flex items-center gap-2 mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span>✅</span>
        <span>Showing full fees for <strong>{student.name}</strong></span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand text-white">
              <th className="px-4 py-3 text-left">Course</th>
              <th className="px-3 py-3 text-center whitespace-nowrap">Degree</th>
              <th className="px-3 py-3 text-center">Quota</th>
              <th className="px-3 py-3 text-right">Year 1</th>
              <th className="px-3 py-3 text-right">Year 2</th>
              <th className="px-3 py-3 text-right">Year 3</th>
              <th className="px-3 py-3 text-right">Year 4</th>
              <th className="px-3 py-3 text-right font-bold">Total</th>
              <th className="px-3 py-3 text-right">Hostel/yr</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byCat).map(([cat, catCourses]) => (
              <>
                <tr key={`cat-${cat}`} className="bg-brand-pale">
                  <td colSpan={9} className="px-4 py-1.5 text-xs font-bold text-brand uppercase tracking-wider">{cat}</td>
                </tr>
                {catCourses.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-xs">{c.name}</td>
                    <td className="px-3 py-2.5 text-center"><span className="badge bg-blue-100 text-blue-700">{c.degreeLevel || '—'}</span></td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{c.quota || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y1Fee)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y2Fee)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y3Fee)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmt(c.y4Fee)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-brand">{fmt(c.totalFee)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmt(c.hostelPerYr)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {Object.entries(byCat).map(([cat, catCourses]) => (
          <div key={cat}>
            <p className="text-xs font-bold text-brand uppercase tracking-wider mb-2 px-1">{cat}</p>
            <div className="space-y-2">
              {catCourses.map(c => <CourseCard key={c.id} c={c} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
