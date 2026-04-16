import { Link } from 'react-router-dom';
import { useCompareStore } from '../context/compare';

const CAT_COLORS = {
  Nursing:        'bg-red-100 text-red-700',
  Engineering:    'bg-blue-100 text-blue-700',
  'Allied Health':'bg-green-100 text-green-700',
  Medical:        'bg-purple-100 text-purple-700',
  Management:     'bg-orange-100 text-orange-700',
  'CS & IT':      'bg-teal-100 text-teal-700',
  Pharmacy:       'bg-pink-100 text-pink-700',
  Private:        'bg-gray-100 text-gray-700',
};

export default function CollegeCard({ college }) {
  const { addCollege, removeCollege, isSelected } = useCompareStore();
  const minFee = college.courses?.reduce((min, c) => c.totalFee && c.totalFee < min ? c.totalFee : min, Infinity);
  const detailUrl = college.slug && college.citySlug ? `/colleges/${college.citySlug}/${college.slug}` : `/college/${college.id}`;

  return (
    <div className="card flex flex-col active:scale-[0.99] transition-transform">
      <div className="p-4 md:p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link to={detailUrl}
            className="font-bold text-brand hover:text-brand-light leading-snug text-sm md:text-base">
            {college.name}
          </Link>
          {/* Compare checkbox — larger tap target on mobile */}
          <label className="flex items-center gap-1 cursor-pointer flex-shrink-0 mt-0.5 p-1 -m-1 rounded">
            <input
              type="checkbox"
              checked={isSelected(college.id)}
              onChange={e => e.target.checked ? addCollege(college) : removeCollege(college.id)}
              className="accent-brand w-4 h-4"
              title="Add to compare"
            />
          </label>
        </div>

        {college.city && (
          <p className="text-xs text-gray-500 mb-3">📍 {college.city}</p>
        )}

        {/* Top courses */}
        <div className="space-y-1.5 mb-3">
          {college.courses?.slice(0, 3).map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs md:text-sm gap-2">
              <span className={`badge ${CAT_COLORS[c.category] || 'bg-gray-100 text-gray-600'} truncate max-w-[120px]`}>
                {c.category || 'Course'}
              </span>
              {c.totalFee > 0 && (
                <span className="font-semibold text-gray-700 flex-shrink-0">
                  ₹{(c.totalFee / 100000).toFixed(1)}L
                </span>
              )}
            </div>
          ))}
        </div>

        {minFee < Infinity && (
          <p className="text-xs text-gray-400">
            Fees from <span className="font-bold text-brand">₹{minFee.toLocaleString('en-IN')}</span>
          </p>
        )}
      </div>

      {/* Action buttons — full width touch targets */}
      <div className="border-t px-4 md:px-5 py-3 flex gap-2">
        <Link to={detailUrl}
          className="btn-primary text-sm flex-1 text-center py-2.5">
          View Details
        </Link>
        <Link to={`/enquire?college=${college.id}`}
          className="btn-outline text-sm flex-1 text-center py-2.5">
          Enquire
        </Link>
      </div>
    </div>
  );
}
