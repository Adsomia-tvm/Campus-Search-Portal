import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import usePageTitle from '../hooks/usePageTitle';
import { getRecommendOptions, getRecommendations } from '../api';

// ── Step config ────────────────────────────────────────────────────────────
const STEPS = ['course', 'city', 'budget', 'details'];
const STEP_TITLES = {
  course:  'What do you want to study?',
  city:    'Where do you want to study?',
  budget:  'What is your budget?',
  details: 'A few more details (optional)',
};

const BUDGET_OPTIONS = [
  { label: 'Under ₹1 Lakh', value: '1L' },
  { label: '₹1 - 3 Lakhs', value: '3L' },
  { label: '₹3 - 5 Lakhs', value: '5L' },
  { label: '₹5 - 8 Lakhs', value: '8L' },
  { label: '₹8 - 12 Lakhs', value: '12L' },
  { label: '₹12 Lakhs+', value: '15L' },
  { label: 'No budget limit', value: '' },
];

const STREAM_OPTIONS = ['Science (PCM)', 'Science (PCB)', 'Commerce', 'Arts / Humanities'];
const DEGREE_OPTIONS = ['UG (Bachelor\'s)', 'PG (Master\'s)', 'Diploma'];

// ── Match score colors ────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 60) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-gray-500 bg-gray-50 border-gray-200';
}

function scoreLabel(score) {
  if (score >= 80) return 'Excellent Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Fair Match';
  return 'Partial Match';
}

// ── Main component ────────────────────────────────────────────────────────
export default function Recommend() {
  usePageTitle('Find Your Perfect College — AI Recommender | Campus Search');

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    course: '', city: '', budget: '', degreeLevel: '',
    percentage: '', stream: '', name: '', phone: '', email: '',
  });
  const [showResults, setShowResults] = useState(false);
  const [showContact, setShowContact] = useState(false);

  // Fetch options
  const { data: options } = useQuery({
    queryKey: ['recommend-options'],
    queryFn: getRecommendOptions,
    staleTime: 5 * 60 * 1000,
  });

  // Recommendation mutation
  const recommend = useMutation({
    mutationFn: getRecommendations,
    onSuccess: () => setShowResults(true),
  });

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  function nextStep() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Submit
      recommend.mutate(form);
    }
  }

  function prevStep() {
    if (showResults) {
      setShowResults(false);
      return;
    }
    if (step > 0) setStep(step - 1);
  }

  function restart() {
    setForm({ course: '', city: '', budget: '', degreeLevel: '', percentage: '', stream: '', name: '', phone: '', email: '' });
    setStep(0);
    setShowResults(false);
    setShowContact(false);
    recommend.reset();
  }

  // Save contact info (calls API again with contact details for lead capture)
  function saveContact() {
    if (form.phone && form.phone.replace(/\D/g, '').length >= 10) {
      recommend.mutate(form);
      setShowContact(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Find Your Perfect College
          </h1>
          <p className="text-gray-500 text-sm md:text-base">
            Answer a few questions and we'll recommend the best colleges for you from 247+ institutions
          </p>
        </div>

        {showResults && recommend.data ? (
          <ResultsView
            data={recommend.data}
            form={form}
            showContact={showContact}
            setShowContact={setShowContact}
            update={update}
            saveContact={saveContact}
            onRestart={restart}
            onBack={prevStep}
          />
        ) : (
          <QuizView
            step={step}
            form={form}
            update={update}
            options={options}
            onNext={nextStep}
            onPrev={prevStep}
            loading={recommend.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// QUIZ VIEW — step-by-step form
// ══════════════════════════════════════════════════════════════════════════════
function QuizView({ step, form, update, options, onNext, onPrev, loading }) {
  const currentStep = STEPS[step];
  const canNext = currentStep === 'details' || form[currentStep]; // details step is optional

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full bg-brand transition-all duration-500 rounded-r"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="p-6 md:p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-brand text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Question */}
        <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-6">
          {STEP_TITLES[currentStep]}
        </h2>

        {/* Step content */}
        {currentStep === 'course' && (
          <CourseStep value={form.course} onChange={v => update('course', v)} categories={options?.categories || []} />
        )}
        {currentStep === 'city' && (
          <CityStep value={form.city} onChange={v => update('city', v)} cities={options?.cities || []} />
        )}
        {currentStep === 'budget' && (
          <BudgetStep value={form.budget} onChange={v => update('budget', v)} />
        )}
        {currentStep === 'details' && (
          <DetailsStep form={form} update={update} degreeLevels={options?.degreeLevels || []} />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={onPrev}
            disabled={step === 0}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              step === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Back
          </button>
          <button
            onClick={onNext}
            disabled={!canNext || loading}
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              canNext && !loading
                ? 'bg-brand text-white hover:bg-brand-light shadow-md hover:shadow-lg'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Finding colleges...
              </span>
            ) : step === STEPS.length - 1 ? (
              'Get Recommendations'
            ) : (
              'Next'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Course selection step ──────────────────────────────────────────────────
function CourseStep({ value, onChange, categories }) {
  const popular = ['Nursing', 'Engineering', 'Management', 'Allied Health', 'Medical', 'Pharmacy', 'CS & IT', 'Law', 'Commerce'];
  const allCats = [...new Set([...popular, ...categories])];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {allCats.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`p-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
            value === cat
              ? 'border-brand bg-indigo-50 text-brand'
              : 'border-gray-100 hover:border-gray-300 text-gray-700'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

// ── City selection step ────────────────────────────────────────────────────
function CityStep({ value, onChange, cities }) {
  const [search, setSearch] = useState('');
  const popular = ['Bengaluru', 'Chennai', 'Kochi', 'Mangaluru', 'Coimbatore', 'Mysuru', 'Thiruvananthapuram', 'Kozhikode'];
  const filtered = search
    ? cities.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : popular;

  return (
    <div>
      <input
        type="text"
        placeholder="Search city..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl mb-4 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.slice(0, 12).map(city => (
          <button
            key={city}
            onClick={() => { onChange(city); setSearch(''); }}
            className={`p-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
              value === city
                ? 'border-brand bg-indigo-50 text-brand'
                : 'border-gray-100 hover:border-gray-300 text-gray-700'
            }`}
          >
            {city}
          </button>
        ))}
      </div>
      {value && !filtered.includes(value) && (
        <p className="mt-3 text-sm text-brand font-medium">Selected: {value}</p>
      )}
    </div>
  );
}

// ── Budget selection step ──────────────────────────────────────────────────
function BudgetStep({ value, onChange }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">Total course fee (all years combined)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BUDGET_OPTIONS.map(opt => (
          <button
            key={opt.label}
            onClick={() => onChange(opt.value)}
            className={`p-4 rounded-xl border-2 text-sm font-medium transition-all text-left ${
              value === opt.value
                ? 'border-brand bg-indigo-50 text-brand'
                : 'border-gray-100 hover:border-gray-300 text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Details step (optional) ────────────────────────────────────────────────
function DetailsStep({ form, update, degreeLevels }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">These help us rank colleges better for you. All fields are optional.</p>

      {/* Degree level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Degree level</label>
        <div className="flex flex-wrap gap-2">
          {DEGREE_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => update('degreeLevel', d.includes('UG') ? 'UG' : d.includes('PG') ? 'PG' : 'Diploma')}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                (d.includes('UG') && form.degreeLevel === 'UG') ||
                (d.includes('PG') && form.degreeLevel === 'PG') ||
                (d.includes('Diploma') && form.degreeLevel === 'Diploma')
                  ? 'border-brand bg-indigo-50 text-brand font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* 12th percentage */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">12th / last exam percentage</label>
        <input
          type="number"
          placeholder="e.g., 75"
          value={form.percentage}
          onChange={e => update('percentage', e.target.value)}
          className="w-full sm:w-48 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
          min="0" max="100"
        />
      </div>

      {/* Stream */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Stream / subject group</label>
        <div className="flex flex-wrap gap-2">
          {STREAM_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => update('stream', s.split(' ')[0])}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                form.stream && s.startsWith(form.stream)
                  ? 'border-brand bg-indigo-50 text-brand font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS VIEW — ranked college recommendations
// ══════════════════════════════════════════════════════════════════════════════
function ResultsView({ data, form, showContact, setShowContact, update, saveContact, onRestart, onBack }) {
  const { recommendations, total } = data;

  return (
    <div>
      {/* Summary bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">
              {total} College{total !== 1 ? 's' : ''} Recommended
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {[form.course, form.city, form.budget && `Budget: ${form.budget}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onRestart}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
            {!showContact && (
              <button
                onClick={() => setShowContact(true)}
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-light transition-colors"
              >
                Get Free Counselling
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contact capture (shows after clicking "Get Free Counselling") */}
      {showContact && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 mb-6 text-white">
          <h3 className="font-bold text-lg mb-2">Get personalized guidance from our counselors</h3>
          <p className="text-indigo-100 text-sm mb-4">Share your details and we'll call you with expert advice on these colleges.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-white outline-none"
            />
            <input
              type="tel"
              placeholder="Phone (10 digits)"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-white outline-none"
            />
            <button
              onClick={saveContact}
              disabled={!form.phone || form.phone.replace(/\D/g, '').length < 10}
              className="px-5 py-2.5 bg-white text-brand rounded-xl font-semibold text-sm hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              Call Me Back
            </button>
          </div>
        </div>
      )}

      {/* Results list */}
      {recommendations.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-500 mb-4">No colleges match your exact criteria. Try adjusting your preferences.</p>
          <button onClick={onRestart} className="btn-primary px-6 py-2.5">Try Again</button>
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((college, i) => (
            <RecommendCard key={college.id} college={college} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single recommendation card ─────────────────────────────────────────────
function RecommendCard({ college, rank }) {
  const detailUrl = college.url || `/college/${college.id}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left: college info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-400">#{rank}</span>
              <Link to={detailUrl} className="font-bold text-brand hover:text-brand-light text-base md:text-lg truncate">
                {college.name}
              </Link>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {[college.city, college.type, college.accreditation].filter(Boolean).join(' · ')}
            </p>

            {/* Reasons */}
            {college.reasons?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {college.reasons.map((r, i) => (
                  <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                    {r}
                  </span>
                ))}
              </div>
            )}

            {/* Courses */}
            {college.courses?.length > 0 && (
              <div className="space-y-1">
                {college.courses.slice(0, 3).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-gray-600 truncate">{c.name}</span>
                    <span className="font-semibold text-gray-800 flex-shrink-0">{c.feeFormatted}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: match score */}
          <div className={`flex-shrink-0 w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center ${scoreColor(college.matchScore)}`}>
            <span className="text-2xl font-bold">{college.matchScore}</span>
            <span className="text-[10px] font-medium leading-tight text-center">{scoreLabel(college.matchScore)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50">
          <Link
            to={detailUrl}
            className="btn-primary text-sm flex-1 text-center py-2.5"
          >
            View Details
          </Link>
          <Link
            to={`/enquire?college=${college.id}`}
            className="btn-outline text-sm flex-1 text-center py-2.5"
          >
            Enquire Now
          </Link>
        </div>
      </div>
    </div>
  );
}
