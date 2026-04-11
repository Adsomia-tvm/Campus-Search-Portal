/**
 * CSV export hook for admin tables.
 *
 * Usage:
 *   const { exportCSV, exporting } = useExportCSV();
 *   <button onClick={() => exportCSV(data, columns, 'enquiries')} disabled={exporting}>
 *     Export CSV
 *   </button>
 *
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{ key: string, label: string, format?: (val, row) => string }>} columns
 * @param {string} filename - File name without extension
 */

import { useState, useCallback } from 'react';

function escapeCSV(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function useExportCSV() {
  const [exporting, setExporting] = useState(false);

  const exportCSV = useCallback((data, columns, filename = 'export') => {
    if (!data?.length) return;
    setExporting(true);

    try {
      // Header row
      const header = columns.map(c => escapeCSV(c.label)).join(',');

      // Data rows
      const rows = data.map(row =>
        columns.map(col => {
          const val = col.format ? col.format(row[col.key], row) : row[col.key];
          return escapeCSV(val);
        }).join(',')
      );

      const csvContent = [header, ...rows].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, []);

  return { exportCSV, exporting };
}

/**
 * Pre-built column definitions for common exports.
 */
export const ENQUIRY_COLUMNS = [
  { key: 'student', label: 'Student Name', format: (_, row) => row.student?.name || '' },
  { key: 'phone', label: 'Phone', format: (_, row) => row.student?.phone || '' },
  { key: 'college', label: 'College', format: (_, row) => row.college?.name || '' },
  { key: 'city', label: 'City', format: (_, row) => row.college?.city || '' },
  { key: 'course', label: 'Course', format: (_, row) => row.course?.name || '' },
  { key: 'status', label: 'Status' },
  { key: 'counselor', label: 'Counselor', format: (_, row) => row.counselor?.name || '' },
  { key: 'createdAt', label: 'Date', format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
];

export const STUDENT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'preferredCat', label: 'Preferred Category' },
  { key: 'stream', label: 'Stream' },
  { key: 'percentage', label: '12th %' },
  { key: 'source', label: 'Source' },
  { key: 'createdAt', label: 'Registered', format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
];

export const COMMISSION_COLUMNS = [
  { key: 'student', label: 'Student', format: (_, row) => row.enquiry?.student?.name || '' },
  { key: 'phone', label: 'Phone', format: (_, row) => row.enquiry?.student?.phone || '' },
  { key: 'college', label: 'College', format: (_, row) => row.college?.name || '' },
  { key: 'amount', label: 'Amount', format: (val) => val != null ? val.toLocaleString('en-IN') : '' },
  { key: 'status', label: 'Status' },
  { key: 'paymentDate', label: 'Payment Date', format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
];
