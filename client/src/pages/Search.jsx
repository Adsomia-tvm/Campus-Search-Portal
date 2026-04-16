import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import useJsonLd from '../hooks/useJsonLd';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import CollegeCard from '../components/CollegeCard';
import SearchBox from '../components/SearchBox';
import { useCompareStore } from '../context/compare';
import { getColleges, getCities, getCategories } from '../api';

const SORT_OPTIONS = [
  { value: 'name',     label: 'Name A–Z' },
  { value: 'fee_asc',  label: 'Fee: Low to High' },
  { value: 'fee_desc', label: 'Fee: High to Low' },
];

const DEGREE_LEVELS = ['UG', 'PG', 'Diploma', 'Lateral'];

function FilterPanel({ filters, setFilters, cities, categories, onClose }) {
  function set(key, val) {
    setFilters(f => ({ ...f, [key]: val, page: 1 }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Search</label>
        <SearchBox
          placeholder="College or course name…"
          initialValue={filters.search}
          onSearch={(q) => set('search', q)}
          className="w-full"
        />
      </div>
      <div>
        <label className="label">City</label>
        <select className="input" value={filters.city} onChange={e => set('city', e.target.value)}>
          <option value="">All Cities</option>
          {cities?.map(c => <option key={c.city} value={c.city}>{c.city}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Stream</label>
        <select className="input" value={filters.category} onChange={e => set('category', e.target.value)}>
          <option value="">All Streams</option>
          {categories?.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Degree Level</label>
        <select className="input" value={filters.degreeLevel} onChange={e => set('degreeLevel', e.target.value)}>
          <option value="">All</option>
          {DEGREE_LEVELS.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Max Total Fee (₹)</label>
        <input className="input" type="number" placeholder="e.g. 500000" value={filters.maxFee}
          onChange={e => set('maxFee', e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => setFilters({ search: '', city: '', category: '', degreeLevel: '', minFee: '', maxFee: '', sortBy: 'name', page: 1 })}
          className="flex-1 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:border-brand">
          Clear
        </button>
        {onClose && (
          <button onClick={onClose} className="flex-1 btn-primary text-sm py-2">
            Show Results
          </button>
        )}
      </div>
    </div>
  );
}

export default function Search() {
  usePageTitle('Search Colleges');
  const [sp, setSp] = useSearchParams();

  // Build dynamic page title from active filters
  // (handled below after filters state is defined)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filters, setFilters] = useState({
    search:      sp.get('search')      || '',
    city:        sp.get('city')        || '',
    category:    sp.get('category')    || '',
    degreeLevel: sp.get('degreeLevel') || '',
    minFee:      sp.get('minFee')      || '',
    maxFee:      sp.get('maxFee')      || '',
    sortBy:      'name',
    page: 1,
  });

  // Noindex for filtered/paginated pages (not needed by search engines)
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"][data-dynamic]');
    const hasFilter = !!(filters.city || filters.category || filters.degreeLevel || filters.maxFee || filters.search || filters.page > 1);
    if (hasFilter) {
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'robots');
        meta.setAttribute('data-dynamic', '1');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'noindex, follow');
    } else {
      if (meta) meta.remove();
    }
    return () => { const el = document.querySelector('meta[name="robots"][data-dynamic]'); if (el) el.remove(); };
  }, [filters.city, filters.category, filters.degreeLevel, filters.maxFee, filters.search, filters.page]);

  const { data, isLoading } = useQuery({
    queryKey: ['colleges', filters],
    queryFn: () => getColleges(filters),
    keepPreviousData: true,
  });

  const { data: cities }     = useQuery({ queryKey: ['cities'],     queryFn: getCities });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { colleges: compared } = useCompareStore();

  // JSON-LD: ItemList of current results for AI/Google crawlers
  const searchSchema = useMemo(() => {
    if (!data?.colleges?.length) return null;
    const label = [filters.category, filters.city].filter(Boolean).join(' colleges in ') || 'Colleges';
    return {
      '@type': 'ItemList',
      name: `${label} — Campus Search`,
      numberOfItems: data.total,
      itemListElement: data.colleges.slice(0, 10).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: c.slug && c.citySlug ? `${window.location.origin}/colleges/${c.citySlug}/${c.slug}` : `${window.location.origin}/college/${c.id}`,
        name: c.name,
      })),
    };
  }, [data?.colleges, filters.category, filters.city, data?.total]);

  useJsonLd(searchSchema);

  // Count active filters for badge
  const activeCount = [filters.city, filters.category, filters.degreeLevel, filters.maxFee]
    .filter(Boolean).length;

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Mobile Filter Drawer Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-brand">Filters</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 text-2xl leading-none">✕</button>
            </div>
            <FilterPanel
              filters={filters}
              setFilters={setFilters}
              cities={cities}
              categories={categories}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Compare bar */}
      {compared.length > 0 && (
        <div className="bg-brand-pale border-b border-brand/20 py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-brand">Compare:</span>
            {compared.map(c => (
              <span key={c.id} className="badge bg-brand text-white">{c.name.split('(')[0].trim()}</span>
            ))}
            <Link to="/compare" className="ml-auto btn-primary text-sm py-1.5 px-4">Compare Now →</Link>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-5 flex gap-6">
        {/* Filters sidebar — desktop only */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <div className="sticky top-20 space-y-5">
            <FilterPanel
              filters={filters}
              setFilters={setFilters}
              cities={cities}
              categories={categories}
            />
          </div>
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {/* Mobile top bar: search box with suggestions + filter button */}
          <div className="flex items-center gap-2 mb-4 md:hidden">
            <div className="flex-1 min-w-0">
              <SearchBox
                placeholder="Search college or course…"
                initialValue={filters.search}
                onSearch={(q) => setFilters(f => ({ ...f, search: q, page: 1 }))}
              />
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="relative flex-shrink-0 flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 bg-white active:bg-gray-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6M12 16h0" />
              </svg>
              Filters
              {activeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-brand text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* Active filter chips (mobile) */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-3 md:hidden">
              {filters.city && (
                <span className="badge bg-brand-pale text-brand border border-brand/20">
                  📍 {filters.city}
                  <button className="ml-1 font-bold" onClick={() => setFilters(f => ({ ...f, city: '', page: 1 }))}>✕</button>
                </span>
              )}
              {filters.category && (
                <span className="badge bg-brand-pale text-brand border border-brand/20">
                  {filters.category}
                  <button className="ml-1 font-bold" onClick={() => setFilters(f => ({ ...f, category: '', page: 1 }))}>✕</button>
                </span>
              )}
              {filters.degreeLevel && (
                <span className="badge bg-brand-pale text-brand border border-brand/20">
                  {filters.degreeLevel}
                  <button className="ml-1 font-bold" onClick={() => setFilters(f => ({ ...f, degreeLevel: '', page: 1 }))}>✕</button>
                </span>
              )}
              {filters.maxFee && (
                <span className="badge bg-brand-pale text-brand border border-brand/20">
                  Max ₹{Number(filters.maxFee).toLocaleString('en-IN')}
                  <button className="ml-1 font-bold" onClick={() => setFilters(f => ({ ...f, maxFee: '', page: 1 }))}>✕</button>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <p className="text-sm text-gray-500">
              {isLoading ? 'Searching…' : `${data?.total || 0} colleges found`}
            </p>
            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-brand"
              value={filters.sortBy}
              onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value, page: 1 }))}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {isLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="card p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-6" />
                  <div className="h-8 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : data?.colleges?.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg font-medium">No colleges found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {data?.colleges?.map(c => <CollegeCard key={c.id} college={c} />)}
              </div>

              {/* Pagination */}
              {data?.pages > 1 && (
                <div className="flex justify-center flex-wrap gap-2 mt-8">
                  {Array.from({ length: data.pages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setFilters(f => ({ ...f, page: p }))}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors
                        ${filters.page === p ? 'bg-brand text-white' : 'bg-white border text-gray-600 hover:border-brand'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
