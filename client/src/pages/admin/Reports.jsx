import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import usePageTitle from '../../hooks/usePageTitle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { getReports } from '../../api';

const COLORS = ['#1A3C6E','#2563EB','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899'];
const fmt = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function SectionTitle({ children }) {
  return <h2 className="font-bold text-brand text-base mt-6 mb-3">{children}</h2>;
}

export default function Reports() {
  usePageTitle('Reports');
  const [type, setType] = useState('monthly');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', type],
    queryFn: () => getReports(type),
  });

  const TAB_LABELS = { monthly: '📅 Monthly', category: '📚 By Category', city: '🏙️ By City' };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-extrabold text-brand">Reports & Analytics</h1>

      {/* Tab switcher */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(TAB_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setType(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${type === key ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-brand/40'}`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="card p-6 h-72 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {/* ───── MONTHLY ───── */}
          {type === 'monthly' && data && (
            <>
              <SectionTitle>Enquiries & Enrolments per Month</SectionTitle>
              <div className="card p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FF" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="enquiries" name="Enquiries" fill="#2563EB" radius={[4,4,0,0]} />
                    <Bar dataKey="enrolled" name="Enrolled" fill="#10B981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <SectionTitle>Commission Trend (₹)</SectionTitle>
              <div className="card p-4">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.monthly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FF" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={v => fmt(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="commissionExpected" name="Expected" stroke="#1A3C6E" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="commissionReceived" name="Received" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly summary table */}
              <SectionTitle>Monthly Summary Table</SectionTitle>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand text-white">
                    <tr>
                      {['Month','Enquiries','Enrolled','Conv. %','Commission Expected','Commission Received'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly?.map((row, i) => (
                      <tr key={row.month} className={`border-b ${i % 2 ? 'bg-gray-50' : ''}`}>
                        <td className="px-4 py-3 font-medium">{row.month}</td>
                        <td className="px-4 py-3">{row.enquiries}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{row.enrolled}</td>
                        <td className="px-4 py-3 text-brand">{row.enquiries ? `${((row.enrolled/row.enquiries)*100).toFixed(1)}%` : '—'}</td>
                        <td className="px-4 py-3">{fmt(row.commissionExpected)}</td>
                        <td className="px-4 py-3 text-green-700">{fmt(row.commissionReceived)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ───── BY CATEGORY ───── */}
          {type === 'category' && data && (
            <>
              <div className="grid lg:grid-cols-2 gap-6 mt-2">
                <div>
                  <SectionTitle>Enquiries by Stream</SectionTitle>
                  <div className="card p-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={data.category} layout="vertical" margin={{ top: 0, right: 20, left: 90, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FF" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={85} />
                        <Tooltip />
                        <Bar dataKey="enquiries" name="Enquiries" fill="#2563EB" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <SectionTitle>Enrolment Share by Stream</SectionTitle>
                  <div className="card p-4 flex justify-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={data.category} dataKey="enrolled" nameKey="category" cx="50%" cy="50%"
                          outerRadius={110} label={({ category, percent }) => percent > 0.03 ? `${category} ${(percent*100).toFixed(0)}%` : ''} labelLine={false}>
                          {data.category?.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <SectionTitle>Category Breakdown Table</SectionTitle>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand text-white">
                    <tr>
                      {['Stream','Enquiries','Enrolled','Conversion','Avg Commission'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.category?.map((row, i) => (
                      <tr key={row.category} className={`border-b ${i % 2 ? 'bg-gray-50' : ''}`}>
                        <td className="px-4 py-3 font-medium">{row.category || '—'}</td>
                        <td className="px-4 py-3">{row.enquiries}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{row.enrolled}</td>
                        <td className="px-4 py-3">{row.enquiries ? `${((row.enrolled/row.enquiries)*100).toFixed(1)}%` : '—'}</td>
                        <td className="px-4 py-3">{fmt(row.avgCommission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ───── BY CITY ───── */}
          {type === 'city' && data && (
            <>
              <SectionTitle>Enquiries by City</SectionTitle>
              <div className="card p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.city?.slice(0, 12)} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FF" />
                    <XAxis dataKey="city" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="enquiries" name="Enquiries" fill="#2563EB" radius={[4,4,0,0]} />
                    <Bar dataKey="enrolled" name="Enrolled" fill="#10B981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <SectionTitle>City-wise Summary</SectionTitle>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand text-white">
                    <tr>
                      {['City','Enquiries','Enrolled','Conversion','Commission Received'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.city?.map((row, i) => (
                      <tr key={row.city} className={`border-b ${i % 2 ? 'bg-gray-50' : ''}`}>
                        <td className="px-4 py-3 font-medium">{row.city || 'Unknown'}</td>
                        <td className="px-4 py-3">{row.enquiries}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{row.enrolled}</td>
                        <td className="px-4 py-3">{row.enquiries ? `${((row.enrolled/row.enquiries)*100).toFixed(1)}%` : '—'}</td>
                        <td className="px-4 py-3">{fmt(row.commissionReceived)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
