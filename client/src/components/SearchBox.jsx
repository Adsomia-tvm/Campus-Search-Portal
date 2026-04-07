import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuggestions } from '../api';

// Debounce helper
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchBox({ placeholder = 'Search college or course…', initialValue = '', onSearch, className = '' }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const boxRef = useRef(null);
  const debouncedQuery = useDebounce(query, 220);

  // Fetch suggestions
  useEffect(() => {
    if (debouncedQuery.length < 2) { setSuggestions([]); setOpen(false); return; }
    getSuggestions(debouncedQuery)
      .then(data => { setSuggestions(data || []); setOpen(data?.length > 0); setHighlighted(-1); })
      .catch(() => {});
  }, [debouncedQuery]);

  // Click outside → close
  useEffect(() => {
    function handler(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(s) {
    setOpen(false);
    if (s.type === 'college') {
      navigate(`/college/${s.id}`);
    } else {
      // course suggestion → search by course name
      setQuery(s.label);
      if (onSearch) onSearch(s.label);
      else navigate(`/search?search=${encodeURIComponent(s.label)}`);
    }
  }

  function handleSubmit(e) {
    e?.preventDefault();
    setOpen(false);
    if (highlighted >= 0 && suggestions[highlighted]) {
      handleSelect(suggestions[highlighted]);
      return;
    }
    if (onSearch) onSearch(query);
    else navigate(`/search?search=${encodeURIComponent(query)}`);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, -1)); }
    if (e.key === 'Escape')    { setOpen(false); setHighlighted(-1); }
    if (e.key === 'Enter')     { handleSubmit(); }
  }

  const colleges = suggestions.filter(s => s.type === 'college');
  const courses  = suggestions.filter(s => s.type === 'course');

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="flex">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            className="w-full pl-9 pr-3 py-2.5 text-sm text-gray-800 border border-gray-300 rounded-l-xl focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            placeholder={placeholder}
            value={query}
            onChange={e => { setQuery(e.target.value); }}
            onKeyDown={handleKey}
            onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); if (onSearch) onSearch(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
              ×
            </button>
          )}
        </div>
        <button type="submit"
          className="bg-brand hover:bg-brand-light text-white px-5 py-2.5 rounded-r-xl text-sm font-semibold transition-colors">
          Search
        </button>
      </form>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
          {colleges.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Colleges</div>
              {colleges.map((s, i) => (
                <button key={i} type="button"
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-brand-pale transition-colors ${highlighted === i ? 'bg-brand-pale' : ''}`}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={() => handleSelect(s)}>
                  <span className="text-brand text-sm">🏛️</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{s.label}</div>
                    {s.sub && <div className="text-xs text-gray-400 truncate">{s.sub}</div>}
                  </div>
                </button>
              ))}
            </>
          )}
          {courses.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-50">Courses</div>
              {courses.map((s, i) => {
                const idx = colleges.length + i;
                return (
                  <button key={i} type="button"
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-brand-pale transition-colors ${highlighted === idx ? 'bg-brand-pale' : ''}`}
                    onMouseEnter={() => setHighlighted(idx)}
                    onMouseDown={() => handleSelect(s)}>
                    <span className="text-brand text-sm">📚</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{s.label}</div>
                      {s.sub && <div className="text-xs text-gray-400 truncate">{s.sub}</div>}
                    </div>
                  </button>
                );
              })}
            </>
          )}
          {/* View all results */}
          <div className="border-t border-gray-100">
            <button type="button" onMouseDown={handleSubmit}
              className="w-full text-left px-4 py-2.5 text-sm text-brand font-medium hover:bg-brand-pale flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              Search all results for "<span className="font-semibold">{query}</span>"
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
