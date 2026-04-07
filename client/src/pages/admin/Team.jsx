import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTeam, createTeamMember, updateTeamMember, setConsultantColleges, getAdminColleges } from '../../api/index';
import usePageTitle from '../../hooks/usePageTitle';

const ROLE_COLORS = {
  admin:      'bg-red-100 text-red-700 border-red-200',
  staff:      'bg-blue-100 text-blue-700 border-blue-200',
  consultant: 'bg-purple-100 text-purple-700 border-purple-200',
};
const ROLE_LABELS = { admin: '🔑 Admin', staff: '🧑‍💼 Staff', consultant: '🎓 Consultant' };

const EMPTY_FORM = { name: '', email: '', password: '', role: 'staff', phone: '', collegeIds: [] };

export default function Team() {
  usePageTitle('Team Management');
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [editingId, setEditingId]     = useState(null);
  const [assigningUser, setAssigning] = useState(null); // for college assignment modal
  const [collegeSearch, setCollegeSearch] = useState('');
  const [selectedColleges, setSelectedColleges] = useState([]);
  const qc = useQueryClient();

  const { data: team = [], isLoading } = useQuery({ queryKey: ['team'], queryFn: getTeam });
  const { data: collegesData } = useQuery({
    queryKey: ['all-colleges-team'],
    queryFn: () => getAdminColleges({ limit: 300 }),
    enabled: !!assigningUser,
  });

  const createMutation = useMutation({
    mutationFn: createTeamMember,
    onSuccess: () => { qc.invalidateQueries(['team']); setShowForm(false); setForm(EMPTY_FORM); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }) => updateTeamMember(id, d),
    onSuccess: () => { qc.invalidateQueries(['team']); setEditingId(null); },
  });

  const assignMutation = useMutation({
    mutationFn: ({ userId, collegeIds }) => setConsultantColleges(userId, collegeIds),
    onSuccess: () => { qc.invalidateQueries(['team']); setAssigning(null); },
  });

  const allColleges = collegesData?.colleges || [];
  const filteredColleges = allColleges.filter(c =>
    c.name.toLowerCase().includes(collegeSearch.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(collegeSearch.toLowerCase())
  );

  function openAssign(user) {
    setAssigning(user);
    setCollegeSearch('');
    const existing = (user.consultantColleges || []).map(cc => cc.college?.id || cc.collegeId);
    setSelectedColleges(existing);
  }

  function toggleCollege(id) {
    setSelectedColleges(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const adminCount = team.filter(u => u.role === 'admin').length;
  const staffCount = team.filter(u => u.role === 'staff').length;
  const consultantCount = team.filter(u => u.role === 'consultant').length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Team Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {adminCount} admin · {staffCount} staff · {consultantCount} consultants
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="btn-primary">
          + Add Member
        </button>
      </div>

      {/* Role explanation */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { role: 'admin', icon: '🔑', desc: 'Full access — all leads, colleges, settings & team management' },
          { role: 'staff', icon: '🧑‍💼', desc: 'All leads across all colleges — can update status & notes' },
          { role: 'consultant', icon: '🎓', desc: 'Only leads for their assigned colleges — focused view' },
        ].map(r => (
          <div key={r.role} className={`rounded-xl p-4 border ${ROLE_COLORS[r.role]}`}>
            <p className="font-bold text-sm">{r.icon} {r.role.charAt(0).toUpperCase() + r.role.slice(1)}</p>
            <p className="text-xs mt-1 opacity-80">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Team list */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand text-white">
            <tr>
              {['Name', 'Email', 'Phone', 'Role', 'Assigned Colleges', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td colSpan={7} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded" /></td>
                </tr>
              ))
            ) : team.map((member, i) => (
              <tr key={member.id} className={`border-b ${i % 2 === 0 ? '' : 'bg-gray-50'} hover:bg-brand-pale/30`}>
                <td className="px-4 py-3 font-medium">{member.name}</td>
                <td className="px-4 py-3 text-gray-600">{member.email}</td>
                <td className="px-4 py-3 text-gray-600">{member.phone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${ROLE_COLORS[member.role] || 'bg-gray-100'}`}>
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {member.role === 'consultant' ? (
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(member.consultantColleges || []).slice(0, 3).map(cc => (
                        <span key={cc.college?.id} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                          {cc.college?.name?.split(' ').slice(0, 3).join(' ')}
                        </span>
                      ))}
                      {(member.consultantColleges || []).length > 3 && (
                        <span className="text-xs text-gray-400">+{member.consultantColleges.length - 3} more</span>
                      )}
                      {!(member.consultantColleges || []).length && (
                        <span className="text-xs text-orange-500">No colleges assigned</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">All colleges</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${member.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(member.id); setForm({ name: member.name, email: member.email, role: member.role, phone: member.phone || '', password: '', collegeIds: [] }); setShowForm(true); }}
                      className="text-xs text-brand hover:underline">Edit</button>
                    {member.role === 'consultant' && (
                      <button onClick={() => openAssign(member)}
                        className="text-xs text-purple-600 hover:underline">Assign Colleges</button>
                    )}
                    <button onClick={() => updateMutation.mutate({ id: member.id, isActive: !member.isActive })}
                      className={`text-xs hover:underline ${member.isActive ? 'text-red-500' : 'text-green-600'}`}>
                      {member.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-brand mb-4">
              {editingId ? 'Edit Team Member' : 'Add Team Member'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="label">Full Name *</label>
                <input className="input" placeholder="e.g. Priya Sharma" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" placeholder="priya@adsomia.com" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">{editingId ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input className="input" type="password" placeholder="••••••••" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="+91 98765 43210" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="staff">🧑‍💼 Staff — sees all leads</option>
                  <option value="consultant">🎓 Consultant — assigned colleges only</option>
                  <option value="admin">🔑 Admin — full access</option>
                </select>
              </div>
              {form.role === 'consultant' && !editingId && (
                <p className="text-xs text-purple-600 bg-purple-50 p-2 rounded-lg">
                  💡 After creating, use "Assign Colleges" to set which colleges this consultant manages.
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => {
                  if (editingId) {
                    const d = { name: form.name, email: form.email, role: form.role, phone: form.phone };
                    if (form.password) d.password = form.password;
                    updateMutation.mutate({ id: editingId, ...d });
                  } else {
                    createMutation.mutate(form);
                  }
                }}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="btn-primary flex-1">
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Member')}
              </button>
            </div>
            {(createMutation.error || updateMutation.error) && (
              <p className="text-red-500 text-sm mt-2">
                {createMutation.error?.response?.data?.error || updateMutation.error?.response?.data?.error || 'An error occurred'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Assign colleges modal */}
      {assigningUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl flex flex-col max-h-[80vh]">
            <h2 className="text-lg font-bold text-brand mb-1">
              Assign Colleges to {assigningUser.name}
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              {selectedColleges.length} college{selectedColleges.length !== 1 ? 's' : ''} selected
            </p>
            <input className="input mb-3" placeholder="Search colleges…"
              value={collegeSearch} onChange={e => setCollegeSearch(e.target.value)} />
            <div className="overflow-y-auto flex-1 space-y-1 border rounded-xl p-2">
              {filteredColleges.map(c => (
                <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedColleges.includes(c.id)}
                    onChange={() => toggleCollege(c.id)}
                    className="accent-brand w-4 h-4" />
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.city}, {c.state}</p>
                  </div>
                </label>
              ))}
              {!filteredColleges.length && (
                <p className="text-center text-gray-400 py-4 text-sm">No colleges found</p>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setAssigning(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => assignMutation.mutate({ userId: assigningUser.id, collegeIds: selectedColleges })}
                disabled={assignMutation.isPending}
                className="btn-primary flex-1">
                {assignMutation.isPending ? 'Saving…' : `Save ${selectedColleges.length} Colleges`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
