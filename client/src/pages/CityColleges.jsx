import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { getCityColleges } from '../api';
import usePageTitle from '../hooks/usePageTitle';
import useJsonLd from '../hooks/useJsonLd';

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : null;

function slugToName(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export default function CityColleges() {
  const { citySlug } = useParams();
  const [selectedCat, setSelectedCat] = useState('');
  const cityName = slugToName(citySlug);

  const { data, isLoading } = useQuery({
    queryKey: ['city-colleges', citySlug, selectedCat],
    queryFn: () => getCityColleges(citySlug, selectedCat ? { category: selectedCat } : {}),
  });

  const colleges = data?.colleges || [];
  const categories = data?.categories || [];
  const total = data?.total || 0;

  usePageTitle(`Colleges in ${cityName} — Fees & Courses 2026-27`);

  // Dynamic canonical
  useEffect(() => {
    const link = document.querySelector('link[rel="canonical"]');
    if (link) link.href = `${window.location.origin}/colleges/${citySlug}`;
    return () => { if (link) link.href = window.location.origin + '/'; };
  }, [citySlug]);

  // JSON-LD
  useJsonLd({
    '@type': 'CollectionPage',
    name: `Colleges in ${cityName}`,
    description: `Browse ${total} colleges in ${cityName}. Compare fees, courses, and get free counselling.`,
    url: `${window.location.origin}/colleges/${citySlug}`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin },
        { '@type': 'ListItem', position: 2, name: `Colleges in ${cityName}`, item: `${window.location.origin}/colleges/${citySlug}` },
      ],
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero */}
      <div className="bg-brand text-white py-8 md:py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-200 text-sm mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <span className="mx-2">›</span>
            <span>Colleges in {cityName}</span>
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-2">
            Colleges in {cityName}
          </h1>
          <p className="text-blue-200 text-sm">
            Browse {total} colleges · Compare fees · Get free counselling
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Category filter pills */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4 md:flex-wrap md:overflow-visible">
            <button
              onClick={() => setSelectedCat('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${!selectedCat ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-brand/30'}`}
            >
              All ({total})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat === selectedCat ? '' : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedCat === cat ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-brand/30'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        )}

        {/* College grid */}
        {!isLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {colleges.map(c => {
              const minFee = c.courses?.reduce((m, co) => co.totalFee && co.totalFee < m ? co.totalFee : m, Infinity);
              const cats = [...new Set(c.courses?.map(co => co.category).filter(Boolean))].slice(0, 3);
              const url = c.slug && c.citySlug ? `/colleges/${c.citySlug}/${c.slug}` : `/college/${c.id}`;
              return (
                <Link key={c.id} to={url}
                  className="bg-white rounded-xl p-4 border border-gray-100 hover:border-brand/30 hover:shadow-md transition-all block group">
                  <h2 className="font-semibold text-brand text-sm leading-snug mb-1 group-hover:underline">{c.name}</h2>
                  <p className="text-xs text-gray-500 mb-2">📍 {c.city || cityName}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {cats.map(cat => (
                      <span key={cat} className="inline-block text-xs bg-blue-50 text-brand rounded-full px-2 py-0.5">{cat}</span>
                    ))}
                  </div>
                  {c.courses?.slice(0, 3).map(co => (
                    <div key={co.id} className="flex justify-between text-xs text-gray-600 py-0.5">
                      <span className="truncate mr-2">{co.name}</span>
                      {co.totalFee && <span className="font-medium text-gray-800 whitespace-nowrap">{fmt(co.totalFee)}</span>}
                    </div>
                  ))}
                  {minFee < Infinity && (
                    <p className="text-xs font-bold text-green-700 mt-2">Fees from {fmt(minFee)}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {!isLoading && colleges.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">No colleges found</p>
            <Link to="/search" className="text-brand hover:underline text-sm">Try searching all colleges →</Link>
          </div>
        )}

        {/* SEO content block */}
        <section className="mt-8 bg-white rounded-xl p-5 border border-gray-100">
          <h2 className="text-lg font-bold text-brand mb-3">About Colleges in {cityName}</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-3">
            {cityName} is home to {total} colleges listed on Campus Search, offering courses in{' '}
            {categories.slice(0, 5).join(', ')}{categories.length > 5 ? ' and more' : ''}.
            Whether you're looking for nursing, engineering, medical, or allied health programs,
            our free counselling service helps you compare fees and find the right fit.
          </p>
          <p className="text-gray-600 text-sm leading-relaxed">
            All fee information is updated for the 2026-27 academic year.
            Click on any college above to see detailed fee breakdowns, year-wise fees, and contact information.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-6 bg-brand-pale rounded-xl p-5 md:p-6 text-center">
          <h3 className="text-base md:text-lg font-bold text-brand mb-2">Need help choosing a college in {cityName}?</h3>
          <p className="text-gray-600 text-sm mb-4">Our counsellors will guide you — completely free.</p>
          <Link to="/enquire" className="btn-primary inline-block px-8 py-3">
            Get Free Counselling →
          </Link>
        </section>
      </div>
    </div>
  );
}
