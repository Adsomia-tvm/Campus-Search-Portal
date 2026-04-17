import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAgentProfile, updateAgentProfile } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

export default function AgentProfile() {
  usePageTitle('Profile — Agent Portal');
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  const { data: profile, isLoading } = useQuery({
    queryKey: ['agent-profile'],
    queryFn: getAgentProfile,
  });

  const mutation = useMutation({
    mutationFn: updateAgentProfile,
    onSuccess: () => {
      qc.invalidateQueries(['agent-profile']);
      setEditing(false);
    },
  });

  function startEdit() {
    setForm({
      name: profile?.user?.name || '',
      phone: profile?.user?.phone || '',
      bankName: profile?.bankName || '',
      bankAccount: '',
      ifsc: profile?.ifsc || '',
      panNumber: '',
    });
    setEditing(true);
  }

  function handleSave() {
    const data = {};
    if (form.name.trim()) data.name = form.name.trim();
    if (form.phone.trim()) data.phone = form.phone.trim();
    if (form.bankName.trim()) data.bankName = form.bankName.trim();
    if (form.bankAccount.trim()) data.bankAccount = form.bankAccount.trim();
    if (form.ifsc.trim()) data.ifsc = form.ifsc.trim();
    if (form.panNumber.trim()) data.panNumber = form.panNumber.trim();
    mutation.mutate(data);
  }

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-gray-900">My Profile</h1>
        {!editing && (
          <button onClick={startEdit}
            className="text-sm text-orange-600 hover:underline font-medium">Edit Profile</button>
        )}
      </div>

      {/* Agent Info */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Agent Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Referral Code</p>
            <p className="font-semibold text-orange-600 text-lg">{profile?.referralCode}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Commission Rate</p>
            <p className="font-semibold text-gray-900">{profile?.commissionRate}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              profile?.isVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {profile?.isVerified ? 'Verified' : 'Pending Verification'}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Member Since</p>
            <p className="font-medium text-gray-700">
              {profile?.createdAt && new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Personal Information</h3>
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
              <input type="tel" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Name</p>
              <p className="font-medium text-gray-900">{profile?.user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="font-medium text-gray-900">{profile?.user?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="font-medium text-gray-900">{profile?.user?.phone || '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bank Details */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Bank Details</h3>
        <p className="text-xs text-gray-500">Required for commission payouts</p>
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Bank Name</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. State Bank of India"
                value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Account Number</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                placeholder="Enter full account number"
                value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} />
              {profile?.bankAccount && <p className="text-xs text-gray-400 mt-1">Current: {profile.bankAccount}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">IFSC Code</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. SBIN0001234"
                value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">PAN Number</label>
              <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                placeholder="Enter PAN"
                value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value.toUpperCase() }))} />
              {profile?.panNumber && <p className="text-xs text-gray-400 mt-1">Current: {profile.panNumber}</p>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Bank</p>
              <p className="font-medium text-gray-900">{profile?.bankName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Account</p>
              <p className="font-medium text-gray-900">{profile?.bankAccount || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">IFSC</p>
              <p className="font-medium text-gray-900">{profile?.ifsc || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">PAN</p>
              <p className="font-medium text-gray-900">{profile?.panNumber || 'Not set'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Edit buttons */}
      {editing && (
        <div className="flex gap-3">
          <button onClick={() => setEditing(false)}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {mutation.error && (
        <p className="text-red-500 text-sm">{mutation.error?.response?.data?.error || 'Failed to update profile'}</p>
      )}
    </div>
  );
}
