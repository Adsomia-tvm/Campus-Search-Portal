import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import useJsonLd from '../hooks/useJsonLd';
import { useQuery } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import CollegeCard from '../components/CollegeCard';
import SearchBox from '../components/SearchBox';
import { getCategories, getCities, getColleges, getTop10 } from '../api';

const ICONS = {
  Nursing:'🏥', Engineering:'⚙️', 'Allied Health':'🔬', Medical:'🏛️',
  Management:'💼', 'CS & IT':'💻', Pharmacy:'💊', Law:'⚖️',
  Private:'🎓', Paramedical:'🩺', Commerce:'💼', Other:'📚',
};

const HOME_FAQS = [
  { q: 'How does Campus Search work?', a: 'Campus Search lets you browse and compare 500+ colleges across South India. Filter by city, course, fee range, and degree level. Once you find a college you like, submit a free enquiry and our counsellors will contact you to guide you through the admission process.' },
  { q: 'Is the counselling service free?', a: 'Yes, completely free. Campus Search\'s counselling service costs nothing to students. We earn through commissions from colleges after successful admissions.' },
  { q: 'Which states and cities are covered?', a: 'We cover colleges across Tamil Nadu (Chennai, Coimbatore, Salem, Nagercoil, Thenkasi, Marthandam), Kerala (Kochi, Thiruvananthapuram), and Karnataka (Bangalore, Mangalore).' },
  { q: 'What courses can I search for?', a: 'You can search for Nursing (BSc, GNM, MSc), Engineering (BTech, MTech), Allied Health Sciences, Medical, Management (BBA, MBA), CS & IT, Pharmacy, Law, and more.' },
  { q: 'What is the fee range for nursing colleges in South India?', a: 'BSc Nursing fees in South India typically range from ₹60,000 to ₹2,50,000 per year. Government colleges are significantly cheaper. Use our search to filter by your budget.' },
  { q: 'Can I compare colleges side by side?', a: 'Yes. Add up to 3 colleges to the compare list and see their fees, courses, accreditation, and hostel charges side by side.' },
  { q: 'Do I need NEET to apply for nursing?', a: 'For BSc Nursing at private colleges, many institutions in Tamil Nadu and Kerala require a valid NEET score. Some state-specific quotas may have different rules. Our counsellors can advise based on your score and state.' },
];

const HOME_SCHEMA = {
  '@type': 'FAQPage',
  mainEntity: HOME_FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

function FaqAccordion({ faqs }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="space-y-2">
      {faqs.map((f, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <button
            className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="font-medium text-gray-800 text-sm md:text-base pr-2">{f.q}</span>
            <span className={`text-brand text-xl flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-45' : ''}`}>+</span>
          </button>
          {open === i && (
            <div className="px-5 pb-4 text-gray-600 text-sm leading-relaxed border-t border-gray-50">
              {f.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  usePageTitle();
  useJsonLd(HOME_SCHEMA);

  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [city, setCity]   = useState('');

  const { data: catData }      = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { data: citiesData }   = useQuery({ queryKey: ['cities'],     queryFn: getCities });
  const { data: nursingTop10 } = useQuery({ queryKey: ['top10','Nursing','Bangalore'], queryFn: () => getTop10({ category: 'Nursing', city: 'Bangalore' }) });
  const { data: featured }     = useQuery({ queryKey: ['featured'],   queryFn: () => getColleges({ limit: 6 }) });

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand to-brand-light text-white py-14 md:py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold mb-3 leading-tight">
            Find Your Perfect College<br />
            <span className="text-blue-200">Across South India</span>
          </h1>
          <p className="text-blue-100 text-base md:text-lg mb-8 max-w-xl mx-auto">
            Compare fees, courses, and hostel charges — free counselling included.
          </p>
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl p-2">
            <SearchBox placeholder="Search college name or course…" className="w-full" />
          </div>

          {/* Most Searched quick links */}
          <div className="mt-4">
            <p className="text-blue-200 text-xs mb-2 uppercase tracking-wider">Most Searched</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { label: 'BSc Nursing Bangalore', search: 'BSc Nursing', city: 'Bangalore' },
                { label: 'BSc Nursing Kochi',     search: 'BSc Nursing', city: 'Kochi'     },
                { label: 'Engineering Chennai',   search: 'Engineering', city: 'Chennai'   },
                { label: 'Nursing Coimbatore',    search: 'Nursing',     city: 'Coimbatore'},
                { label: 'Allied Health Mangalore',search: 'Allied Health',city:'Mangalore'},
                { label: 'Pharmacy Nagercoil',    search: 'Pharmacy',    city: 'Nagercoil' },
              ].map(({ label, search, city }) => (
                <button key={label}
                  onClick={() => navigate(`/search?search=${encodeURIComponent(search)}&city=${encodeURIComponent(city)}`)}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-full border border-white/20 transition-colors">
                  🔍 {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {['Nursing','Engineering','Allied Health','Pharmacy','Management'].map(s => (
              <button key={s}
                onClick={() => navigate(`/search?category=${encodeURIComponent(s)}`)}
                className="bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-full border border-white/30 transition-colors">
                {ICONS[s]} {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-brand-pale border-y border-blue-100 py-5 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 text-center">
          {[['500+', 'Colleges Listed'], ['20+', 'Cities Covered'], ['Free', 'Counselling']].map(([val, label]) => (
            <div key={label}>
              <p className="text-2xl font-extrabold text-brand">{val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Category cards */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-xl md:text-2xl font-bold text-brand mb-5">Browse by Stream</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {catData?.slice(0, 8).map(c => (
            <button key={c.category}
              onClick={() => navigate(`/search?category=${encodeURIComponent(c.category)}`)}
              className="card p-4 text-left hover:border-brand-light border-2 border-transparent transition-all active:scale-95">
              <div className="text-2xl md:text-3xl mb-2">{ICONS[c.category] || '🎓'}</div>
              <div className="font-bold text-brand text-xs md:text-sm">{c.category}</div>
              <div className="text-gray-400 text-xs mt-0.5">{c.count} courses</div>
            </button>
          ))}
        </div>
      </section>

      {/* Top 10 Nursing Bangalore */}
      {nursingTop10?.length > 0 && (
        <section className="bg-red-50 py-10 px-4">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-brand mb-1">🏥 Top Nursing Colleges — Bangalore</h2>
            <p className="text-gray-500 text-sm mb-5">Sorted by lowest total fee</p>
            <div className="grid md:grid-cols-2 gap-3">
              {nursingTop10.slice(0, 10).map((c, i) => (
                <div key={c.id} className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-sm border border-red-100 active:scale-[0.99] transition-transform">
                  <span className={`text-xl font-extrabold w-7 text-center flex-shrink-0 ${i < 3 ? 'text-yellow-500' : 'text-gray-300'}`}>
                    #{i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand text-sm leading-snug line-clamp-2">{c.college?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-brand text-sm">₹{(c.totalFee / 100000).toFixed(1)}L</p>
                    <p className="text-xs text-gray-400">total</p>
                  </div>
                  <a href={c.college?.slug && c.college?.citySlug ? `/colleges/${c.college.citySlug}/${c.college.slug}` : `/college/${c.college?.id}`}
                    className="btn-primary text-xs px-3 py-2 flex-shrink-0">
                    View
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured colleges */}
      {featured?.colleges?.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <h2 className="text-xl md:text-2xl font-bold text-brand mb-5">Featured Colleges</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.colleges.map(c => <CollegeCard key={c.id} college={c} />)}
          </div>
          <div className="text-center mt-7">
            <button onClick={() => navigate('/search')} className="btn-outline px-8 py-3">
              View All Colleges →
            </button>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-bold text-brand mb-8">How Campus Search Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: '1', icon: '🔍', title: 'Search', desc: 'Filter 500+ colleges by city, course, fee range, and degree level.' },
              { step: '2', icon: '↔️', title: 'Compare', desc: 'Add colleges to the compare list and view fees side by side.' },
              { step: '3', icon: '📞', title: 'Apply Free', desc: 'Submit an enquiry and our counsellors guide you through admission at no cost.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="text-3xl mb-3">{icon}</div>
                <div className="text-xs text-brand font-bold uppercase tracking-wider mb-1">Step {step}</div>
                <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-xl md:text-2xl font-bold text-brand mb-6 text-center">Frequently Asked Questions</h2>
        <FaqAccordion faqs={HOME_FAQS} />
      </section>

      {/* CTA */}
      <section className="bg-brand text-white py-12 px-4 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Not sure which college to pick?</h2>
        <p className="text-blue-200 mb-7 max-w-md mx-auto text-sm md:text-base">Our counsellors help you choose the right college for your budget and score — for free.</p>
        <a href="/enquire" className="bg-white text-brand font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition-colors inline-block text-sm md:text-base">
          Get Free Counselling →
        </a>
      </section>

      {/* Browse by City — SEO internal links */}
      <section className="bg-gray-50 border-t border-gray-100 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-lg font-bold text-brand mb-4">Browse Colleges by City</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { name: 'Bengaluru', slug: 'bengaluru' },
              { name: 'Chennai', slug: 'chennai' },
              { name: 'Salem', slug: 'salem' },
              { name: 'Mangaluru', slug: 'mangaluru' },
              { name: 'Coimbatore', slug: 'coimbatore' },
              { name: 'Erode', slug: 'erode' },
              { name: 'Mysuru', slug: 'mysuru' },
              { name: 'Tumakuru', slug: 'tumakuru' },
            ].map(c => (
              <a key={c.slug} href={`/colleges/${c.slug}`}
                className="bg-white text-gray-700 text-xs px-3 py-2 rounded-lg border border-gray-200 hover:border-brand/30 hover:text-brand transition-colors">
                Colleges in {c.name}
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-8 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <p className="font-bold text-white mb-2">Campus Search</p>
            <p className="text-xs text-gray-500">South India's college search portal — Nursing, Engineering, Allied Health & more.</p>
          </div>
          <div>
            <p className="font-bold text-gray-300 mb-2">Popular Cities</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {['bengaluru','chennai','salem','mangaluru','coimbatore','erode','mysuru'].map(s => (
                <a key={s} href={`/colleges/${s}`} className="hover:text-white transition-colors capitalize">{s}</a>
              ))}
            </div>
          </div>
          <div>
            <p className="font-bold text-gray-300 mb-2">Links</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a href="/search" className="hover:text-white transition-colors">Search Colleges</a>
              <a href="/compare" className="hover:text-white transition-colors">Compare</a>
              <a href="/enquire" className="hover:text-white transition-colors">Free Counselling</a>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-gray-600 mt-6">© 2026 Campus Search. All rights reserved.</p>
      </footer>
    </div>
  );
}
