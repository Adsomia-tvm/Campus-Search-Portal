import { useState } from 'react';
import { studentAuth } from '../api';
import { useStudentStore } from '../context/studentAuth';

export default function StudentAuthModal({ onClose, collegeId, courseId, collegeName, preferredCat }) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const login = useStudentStore(s => s.login);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim())  return setError('Please enter your name');
    if (!phone.trim()) return setError('Please enter your phone number');

    setLoading(true);
    try {
      const { token, student } = await studentAuth({
        name, phone, email, collegeId, courseId, preferredCat,
      });
      login(token, student);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in">
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔓</div>
          <h2 className="text-xl font-bold text-brand">Unlock Fee Details</h2>
          <p className="text-sm text-gray-500 mt-1">
            {collegeName
              ? <>See full fees for <span className="font-medium text-gray-700">{collegeName.split('(')[0].trim()}</span></>
              : 'Free signup — see all fee details instantly'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Your Name *</label>
            <input
              className="input"
              placeholder="e.g. Rahul Kumar"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Mobile Number *</label>
            <input
              className="input"
              placeholder="e.g. 9876543210"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Email <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              className="input"
              placeholder="your@email.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 text-base font-semibold mt-2 disabled:opacity-60">
            {loading ? 'Please wait…' : 'See Full Fee Details →'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          🔒 Your details are safe. No spam, ever.
        </p>
      </div>
    </div>
  );
}
