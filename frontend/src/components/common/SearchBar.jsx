import React from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = ({
  value = '',
  onChange,
  onSearch,
  placeholder = 'Search stationery, books, xerox services...',
  className = '',
  maxWidth = '100%',
}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch(value);
    }
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        maxWidth,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: '0.85rem',
          color: 'var(--text-muted)',
          display: 'flex',
          pointerEvents: 'none',
        }}
      >
        <Search size={18} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '0.65rem 2.25rem 0.65rem 2.5rem',
          fontSize: '0.9rem',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-surface)',
          boxShadow: 'var(--shadow-xs)',
          outline: 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--primary-500)';
          e.target.style.boxShadow = '0 0 0 3px var(--primary-100)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border-light)';
          e.target.style.boxShadow = 'var(--shadow-xs)';
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: '0.85rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            padding: '2px',
          }}
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
