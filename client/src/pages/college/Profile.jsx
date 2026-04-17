import { useQuery } from '@tanstack/react-query';
import { getCollegeProfile } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-2 border-b border-gray-50">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

const TIER_COLORS = {
  Starter: 'bg-gray-100 text-gray-700',
  Growth: 'bg-blue-100 text-blue-700',
  Elite: 'bg-yellow-100 text-yellow-800',
  Institutional: 'bg-purple-100 text-purple-700',
};

const VERIFY_COLORS = {
  Unverified: 'bg-red-50 text-red-600',
  Basic: 'bg-yellow-50 text-yellow-700',
  Verified: 'bg-emerald-50 text-emerald-700',
  Premium: 'bg-blue-50 text-blue-700',
};

export default function CollegeProfile() {
  usePageTitle('Profile — College Portal');

  const { data, isLoading, error } = useQuery({
    queryKey: ['college-profile'],
    queryFn: getCollegeProfile,
  });

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm">Failed to load profile.</div>
    </div>
  );

  const { college, user } = data;

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-3xl">
      <h1 className="text-2xl font-extrabold text-gray-900">College Profile</h1>

      {/* College header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          {college.logoUrl ? (
            <img src={college.logoUrl} alt="" className="w-16 h-16 rounded-xl object-cover border" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl">🏫</div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">{college.name}</h2>
            <p className="text-sm text-gray-500">{college.city}, {college.state}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${TIER_COLORS[college.partnershipTier] || ''}`}>
                {college.partnershipTier} Partner
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${VERIFY_COLORS[college.verificationLevel] || ''}`}>
                {college.verificationLevel}
              </span>
              {college.isActive ? (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Active</span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">Inactive</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* College details */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <h3 className="font-bold text-gray-900 mb-4">College Details</h3>
        <InfoRow label="Type" value={college.type} />
        <InfoRow label="Address" value={college.address} />
        <InfoRow label="Phone" value={college.phone} />
        <InfoRow label="Email" value={college.email} />
        <InfoRow label="Website" value={college.website} />
        <InfoRow label="Approved By" value={college.approvedBy} />
        <InfoRow label="Accreditation" value={college.accreditation} />
        <InfoRow label="Courses Listed" value={college._count?.courses} />
        <InfoRow label="Total Enquiries" value={college._count?.enquiries} />
      </div>

      {/* Partnership details */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <h3 className="font-bold text-gray-900 mb-4">Partnership Details</h3>
        <InfoRow label="Partnership Tier" value={college.partnershipTier} />
        <InfoRow label="Monthly Lead Cap" value={college.monthlyLeadCap ? `${college.monthlyLeadCap} leads/month` : 'Unlimited'} />
        <InfoRow label="Price Per Lead" value={college.pricePerLead ? `₹${college.pricePerLead}` : 'Default tier rate'} />
        <InfoRow label="Partner Since" value={college.partnershipSince ? new Date(college.partnershipSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
      </div>

      {/* Account info */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <h3 className="font-bold text-gray-900 mb-4">Your Account</h3>
        <InfoRow label="Name" value={user.name} />
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="Phone" value={user.phone} />
        <InfoRow label="Account Created" value={new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
        Need to update your college details? Contact Campus Search at <a href="mailto:md@adsomia.com" className="text-emerald-600 underline">md@adsomia.com</a> or call <a href="tel:+917407556677" className="text-emerald-600 underline">+91 74075 56677</a>.
      </div>
    </div>
  );
}
