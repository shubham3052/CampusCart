import React from 'react';
import { Spinner } from './Loader';
import EmptyState from './EmptyState';

const DataTable = ({
  columns = [],
  data = [],
  keyField = 'id',
  isLoading = false,
  emptyMessage = 'No records found',
  className = '',
}) => {
  if (isLoading) {
    return (
      <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState description={emptyMessage} />;
  }

  return (
    <div
      className={className}
      style={{
        width: '100%',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-light)',
        backgroundColor: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
            {columns.map((col, idx) => (
              <th
                key={col.header || idx}
                style={{
                  padding: '0.85rem 1rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  ...col.headerStyle,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={row[keyField] || rowIdx}
              style={{
                borderBottom: rowIdx === data.length - 1 ? 'none' : '1px solid var(--border-light)',
                transition: 'background-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {columns.map((col, colIdx) => (
                <td
                  key={colIdx}
                  style={{
                    padding: '0.9rem 1rem',
                    color: 'var(--text-secondary)',
                    verticalAlign: 'middle',
                    ...col.cellStyle,
                  }}
                >
                  {col.render
                    ? col.render(row[col.accessor], row, rowIdx)
                    : row[col.accessor] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
