import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAgentCommissions, getAgentPayouts } from '../../api';
import usePageTitle from '../../hooks/usePageTitle';

function fmtMoney(val) {
  if (!val) return '₹0';
  return `₹${val.toLocaleString('en-IN')}`;
}

const STATUS_COLORS = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Invoiced: 'bg-blue-100 text-blue-700',
  Received: 'bg-green-100 text-green-700',
  'Written Off': 'bg-red-100 text-red-700',
  Paid: 'bg-green-100 text-green-700',
  Processing: 'bg-blue-100 text-blue-700',
  Failed: 'bg-red-100 text-red-700',
};

export default function AgentCommissions() {
  usePageTitle('Commissions — Agent Portal');
  const [activeTab, setActiveTab] = useState('commissions');

  const { data: commData, isLoading: commLoading } = useQuery({
    queryKey: ['agent-commissions'],
    queryFn: () => getAgentCommissions(),
  });

  const { data: payoutData, isLoading: payoutLoading } = useQuery({
    queryKey: ['agent-payouts'],
    queryFn: () => getAgentPayouts(),
  });

  const commissions = commData?.commissions || [];
  const commTotals = commData?.totals || {};
  const payouts = payoutData?.payouts || [];
  const payoutTotals = payoutData?.totals || {};

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-extrabold text-gray-900">Commissions & Payouts</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium">Total Earned</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{fmtMoney(commTotals.totalEarned)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium">Pending</p>
          <p className="text-xl font-extrabold text-yellow-600 mt-1">{fmtMoney(commTotals.pending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium">Received</p>
          <p className="text-xl font-extrabold text-green-600 mt-1">{fmtMoney(commTotals.received)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-medium">Total Paid Out</p>
          <p className="text-xl font-extrabold text-green-700 mt-1">{fmtMoney(payoutTotals.totalPaid)}</p>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('commissions')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'commissions' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          Commissions ({commissions.length})
        </button>
        <button onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'payouts' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          Payouts ({payouts.length})
        </button>
      </div>

      {/* Commissions Table */}
      {activeTab === 'commissions' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">College</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Your Share</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {commLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    <td colSpan={5} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-3/4" /></td>
                  </tr>
                ))
              ) : commissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">💰</p>
                    <p className="font-medium">No commissions yet</p>
                    <p className="text-xs mt-1">Commissions are generated when your referred students enrol</p>
                  </td>
                </tr>
              ) : commissions.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.enquiry?.student?.name || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{c.college?.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(c.agentAmount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                    {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payouts Table */}
      {activeTab === 'payouts' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Payout ID</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Method</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Paid Date</th>
              </tr>
            </thead>
            <tbody>
              {payoutLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    <td colSpan={5} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-3/4" /></td>
                  </tr>
                ))
              ) : payouts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">🏦</p>
                    <p className="font-medium">No payouts yet</p>
                    <p className="text-xs mt-1">Payouts are processed when commissions are received</p>
                  </td>
                </tr>
              ) : payouts.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">#{p.id}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{p.paymentMethod || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                    {p.paidDate ? new Date(p.paidDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
