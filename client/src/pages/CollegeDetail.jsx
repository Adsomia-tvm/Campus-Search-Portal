import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import FeeTable from '../components/FeeTable';
import { getCollege, getRelatedColleges, getCollegeStats } from '../api';
import usePageTitle from '../hooks/usePageTitle';
import useJsonLd from '../hooks/useJsonLd';

const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : null;

/** Build CollegeOrUniversity + BreadcrumbList + FAQPage JSON-LD */
function buildSchema(college, faqItems) {
  const schemas = [];

  // CollegeOrUniversity
  const courseList = (college.courses || []).map(c => ({
    '@type': 'Course',
    name: c.name,
    description: c.category ? `${c.category} — ${c.degreeLevel || 'UG'}` : c.name,
    ...(c.totalFee ? { offers: { '@type': 'Offer', price: c.totalFee, priceCurrency: 'INR' } } : {}),
  }));

  schemas.push({
    '@type': 'CollegeOrUniversity',
    name: college.name,
    url: window.location.href,
    ...(college.phone    ? { telephone: college.phone }   : {}),
    ...(college.email    ? { email: college.email }       : {}),
    ...(college.website  ? { sameAs: college.website }    : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: college.city    || '',
      addressRegion:   college.state   || '',
      addressCountry:  'IN',
      streetAddress:   college.address || '',
    },
    ...(college.accreditation ? { accreditedBy: { '@type': 'Organization', name: college.accreditation } } : {}),
    ...(courseList.length ? { hasOfferCatalog: { '@type': 'OfferCatalog', itemListElement: courseList } } : {}),
  });

  // BreadcrumbList
  schemas.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',    item: window.location.origin },
      { '@type': 'ListItem', position: 2, name: 'Search',  item: `${window.location.origin}/search` },
      { '@type': 'ListItem', position: 3, name: college.name, item: window.location.href },
    ],
  });

  // FAQPage
  if (faqItems.length) {
    schemas.push({
      '@type': 'FAQPage',
      mainEntity: faqItems.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return { '@graph': schemas };
}

/** Build FAQ items from live college data */
function buildFaq(college) {
  const faqs = [];
  const minFee = (college.courses || []).reduce((m, c) => c.totalFee && c.totalFee < m ? c.totalFee : m, Infinity);
  const maxFee = (college.courses || []).reduce((m, c) => c.totalFee && c.totalFee > m ? c.totalFee : m, 0);
  const courseNames = [...new Set((college.courses || []).map(c => c.name))].slice(0, 5).join(', ');

  if (college.city)
    faqs.push({ q: `Where is ${college.name} located?`, a: `${college.name} is located in ${college.city}${college.state ? `, ${college.state}` : ''}, India.` });

  if (minFee < Infinity)
    faqs.push({ q: `What is the fee for ${college.name}?`, a: `The course fees at ${college.name} range from ${fmt(minFee)}${maxFee > minFee ? ` to ${fmt(maxFee)}` : ''} total. Fees vary by course. Contact the college or our counsellors for the latest fee structure.` });

  if (courseNames)
    faqs.push({ q: `What courses are offered at ${college.name}?`, a: `${college.name} offers courses including ${courseNames}. Visit our fee table above for the full list with fees.` });

  if (college.approvedBy)
    faqs.push({ q: `Is ${college.name} approved?`, a: `Yes, ${college.name} is approved by ${college.approvedBy}.` });

  if (college.accreditation)
    faqs.push({ q: `What is the accreditation of ${college.name}?`, a: `${college.name} holds ${college.accreditation} accreditation.` });

  faqs.push({ q: `How can I apply to ${college.name}?`, a: `You can apply to ${college.name} through Campus Search. Click "Enquire — Free" on this page and our counsellors will guide you through the admission process at no cost.` });

  return faqs;
}

function FaqAccordion({ faqs }) {
  const [open, setOpen] = useState(null);
  return (
    <section>
      <h2 className="text-lg md:text-xl font-bold text-brand mb-4">Frequently Asked Questions</h2>
      <div className="space-y-2">
        {faqs.map((f, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button
              className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="font-medium text-gray-800 text-sm pr-2">{f.q}</span>
              <span className={`text-brand text-lg flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-45' : ''}`}>+</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4 text-gray-600 text-sm leading-relaxed border-t border-gray-50">
                {f.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CollegeDetail() {
  const { id } = useParams();
  const { data: college, isLoading, isError } = useQuery({
    queryKey: ['college', id],
    queryFn: () => getCollege(id),
  });

  usePageTitle(college?.name || 'College Details');

  const { data: related } = useQuery({
    queryKey: ['related', id],
    queryFn: () => getRelatedColleges(id),
    enabled: !!college,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats', id],
    queryFn: () => getCollegeStats(id),
    enabled: !!college,
  });

  const faqItems = college ? buildFaq(college) : [];
  useJsonLd(college ? buildSchema(college, faqItems) : null);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center text-brand">
      <div className="animate-spin text-4xl">🎓</div>
    </div>
  );
  if (isError || !college) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      College not found.
    </div>
  );

  const minFee = college.courses?.reduce((min, c) => c.totalFee && c.totalFee < min ? c.totalFee : min, Infinity);
  const maxFee = college.courses?.reduce((max, c) => c.totalFee && c.totalFee > max ? c.totalFee : max, 0);
  const categories = [...new Set((college.courses || []).map(c => c.category).filter(Boolean))];
  const lastUpdated = college.updatedAt ? new Date(college.updatedAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Header */}
      <div className="bg-brand text-white py-8 md:py-10 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <p className="text-blue-200 text-sm mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <span className="mx-2">›</span>
            <Link to="/search" className="hover:underline">Search</Link>
            <span className="mx-2">›</span>
            <span>{college.name}</span>
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-3 leading-snug">{college.name}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-blue-200">
            {college.city    && <span>📍 {college.city}{college.state ? `, ${college.state}` : ''}</span>}
            {college.type    && <span>🏛️ {college.type}</span>}
            {college.approvedBy && <span>✅ {college.approvedBy}</span>}
            {minFee < Infinity && <span className="text-yellow-300 font-bold">Fees from ₹{minFee.toLocaleString('en-IN')}</span>}
          </div>
          {stats?.enquiriesThisWeek > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs text-blue-100">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              {stats.enquiriesThisWeek} students enquired this week
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-7">
        {/* Quick actions */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:flex-wrap md:overflow-visible">
          <Link to={`/enquire?college=${college.id}`}
            className="btn-primary whitespace-nowrap flex-shrink-0">
            📞 Enquire — Free
          </Link>
          <Link to={`/compare?add=${college.id}`}
            className="btn-outline whitespace-nowrap flex-shrink-0">
            ↔ Compare
          </Link>
          {college.phone && (
            <a href={`tel:${college.phone}`} className="btn-outline whitespace-nowrap flex-shrink-0">
              📱 Call
            </a>
          )}
          {college.website && (
            <a href={college.website} target="_blank" rel="noreferrer"
              className="btn-outline whitespace-nowrap flex-shrink-0">
              🌐 Website
            </a>
          )}
        </div>

        {/* About */}
        {college.description && (
          <section>
            <h2 className="text-lg md:text-xl font-bold text-brand mb-3">About {college.name}</h2>
            <p className="text-gray-600 leading-relaxed text-sm md:text-base">{college.description}</p>
          </section>
        )}

        {/* Info grid */}
        {[['Address', college.address],['Phone', college.phone],['Email', college.email],
          ['Approved by', college.approvedBy],['Accreditation', college.accreditation],['Type', college.type]]
          .filter(([,v]) => v).length > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['Address', college.address],['Phone', college.phone],['Email', college.email],
              ['Approved by', college.approvedBy],['Accreditation', college.accreditation],['Type', college.type]]
              .filter(([,v]) => v).map(([label, val]) => (
              <div key={label} className="bg-white rounded-lg p-4 border border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-gray-800 font-medium text-sm">{val}</p>
              </div>
            ))}
          </section>
        )}

        {/* Fee table */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h2 className="text-lg md:text-xl font-bold text-brand">Fee Structure 2026-27</h2>
            {lastUpdated && (
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                🕒 Updated {lastUpdated}
              </span>
            )}
          </div>
          {/* AI-extractable fee summary sentence */}
          {minFee < Infinity && (
            <p className="text-sm text-gray-600 mb-4 bg-blue-50 rounded-lg px-4 py-3 border border-blue-100">
              <strong>Fee summary:</strong> Course fees at {college.name} range from{' '}
              <strong>₹{minFee.toLocaleString('en-IN')}</strong>
              {maxFee > minFee ? ` to ₹${maxFee.toLocaleString('en-IN')}` : ''} total
              {categories.length > 0 ? `, covering ${categories.slice(0,3).join(', ')} courses` : ''}.
              {college.city ? ` Located in ${college.city}.` : ''}
            </p>
          )}
          <FeeTable courses={college.courses} collegeId={college.id} collegeName={college.name} />
          <p className="text-xs text-gray-400 mt-2">
            * Fees shown are as per brochure. Confirm with college before admission.
          </p>
        </section>

        {/* Contacts */}
        {college.contacts?.length > 0 && (
          <section>
            <h2 className="text-lg md:text-xl font-bold text-brand mb-4">Contact Persons</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {college.contacts.map(c => (
                <div key={c.id} className="bg-white rounded-lg p-4 border border-gray-100">
                  <p className="font-semibold text-brand">{c.name}</p>
                  {c.designation && <p className="text-sm text-gray-500">{c.designation}</p>}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="text-sm mt-2 flex items-center gap-1 text-brand hover:underline">
                      📱 {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-sm flex items-center gap-1 text-brand hover:underline">
                      ✉️ {c.email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FAQ accordion */}
        {faqItems.length > 0 && <FaqAccordion faqs={faqItems} />}

        {/* Related Colleges */}
        {related?.length > 0 && (
          <section>
            <h2 className="text-lg md:text-xl font-bold text-brand mb-4">
              Similar Colleges in {college.city || 'This Area'}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {related.map(r => {
                const rMin = r.courses?.reduce((m, c) => c.totalFee && c.totalFee < m ? c.totalFee : m, Infinity);
                return (
                  <Link key={r.id} to={`/college/${r.id}`}
                    className="bg-white rounded-xl p-4 border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all block">
                    <p className="font-semibold text-brand text-sm leading-snug mb-1">{r.name}</p>
                    <p className="text-xs text-gray-500 mb-2">📍 {r.city || 'South India'}</p>
                    {r.courses?.slice(0,2).map(c => (
                      <span key={c.name} className="inline-block text-xs bg-blue-50 text-brand rounded-full px-2 py-0.5 mr-1 mb-1">{c.category || c.name}</span>
                    ))}
                    {rMin < Infinity && (
                      <p className="text-xs font-bold text-green-700 mt-1">From ₹{rMin.toLocaleString('en-IN')}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="bg-brand-pale rounded-xl p-5 md:p-6 text-center">
          <h3 className="text-base md:text-lg font-bold text-brand mb-2">Interested in {college.name}?</h3>
          <p className="text-gray-600 text-sm mb-4">Our counsellors will guide you through admission — completely free.</p>
          <Link to={`/enquire?college=${college.id}`}
            className="btn-primary inline-block px-8 py-3">
            Get Free Counselling →
          </Link>
        </section>
      </div>
    </div>
  );
}
