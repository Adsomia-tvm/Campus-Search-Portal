import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import { getCollege, submitEnquiry } from '../api';

const CATEGORIES = ['Nursing','Engineering','Allied Health','Medical','Management','CS & IT','Pharmacy','Law','Other'];
const STREAMS    = ['Science (PCB)','Science (PCM)','Commerce','Arts','Biology','Other'];

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2].map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
            ${step >= n ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'}`}>
            {step > n ? '✓' : n}
          </div>
          {n < 2 && (
            <div className={`h-0.5 w-12 transition-colors ${step > 1 ? 'bg-brand' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <p className="ml-2 text-xs text-gray-500">
        {step === 1 ? 'Your details' : 'More info (optional)'}
      </p>
    </div>
  );
}

export default function Enquiry() {
  usePageTitle('Apply Now');
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const collegeId = sp.get('college');
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState(null);

  const { data: college } = useQuery({
    queryKey: ['college', collegeId],
    queryFn: () => getCollege(collegeId),
    enabled: !!collegeId,
  });

  // Step 1 form
  const {
    register: reg1,
    handleSubmit: submit1,
    formState: { errors: err1 },
  } = useForm({ defaultValues: { collegeId: collegeId || '' } });

  // Step 2 form
  const {
    register: reg2,
    handleSubmit: submit2,
  } = useForm();

  const mutation = useMutation({
    mutationFn: submitEnquiry,
    onSuccess: () => navigate('/thanks'),
  });

  function onStep1(data) {
    setStep1Data(data);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onStep2(data) {
    mutation.mutate({ ...step1Data, ...data });
  }

  function skipToSubmit() {
    mutation.mutate(step1Data);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl md:text-3xl font-extrabold text-brand mb-1">Free Counselling</h1>
        <p className="text-gray-500 mb-6 text-sm md:text-base">Our team will call you within 24 hours — no charge, ever.</p>

        {college && (
          <div className="bg-brand-pale border border-brand/20 rounded-xl px-5 py-4 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Enquiring for</p>
            <p className="font-bold text-brand">{college.name}</p>
            {college.city && <p className="text-sm text-gray-500 mt-0.5">📍 {college.city}</p>}
          </div>
        )}

        <StepIndicator step={step} />

        {/* ── Step 1 ── */}
        {step === 1 && (
          <form onSubmit={submit1(onStep1)}
            className="space-y-5 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <input type="hidden" {...reg1('collegeId')} value={collegeId || ''} />

            <div>
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Your name"
                {...reg1('name', { required: 'Name is required' })} />
              {err1.name && <p className="text-red-500 text-xs mt-1">{err1.name.message}</p>}
            </div>

            <div>
              <label className="label">Mobile Number *</label>
              <input className="input" type="tel" placeholder="10-digit mobile"
                {...reg1('phone', {
                  required: 'Mobile number is required',
                  pattern: { value: /^[6-9][0-9]{9}$/, message: 'Enter a valid 10-digit Indian mobile number' },
                })} />
              {err1.phone && <p className="text-red-500 text-xs mt-1">{err1.phone.message}</p>}
            </div>

            <div>
              <label className="label">Interested Course / Stream *</label>
              <select className="input" {...reg1('preferredCat', { required: 'Please select a stream' })}>
                <option value="">Select stream…</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              {err1.preferredCat && <p className="text-red-500 text-xs mt-1">{err1.preferredCat.message}</p>}
            </div>

            <button type="submit" className="btn-primary w-full py-3 text-base">
              Next — Add More Details →
            </button>

            <p className="text-xs text-gray-400 text-center">
              Takes less than 30 seconds. Your data is never sold.
            </p>
          </form>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <form onSubmit={submit2(onStep2)}
            className="space-y-5 bg-white rounded-xl p-6 shadow-sm border border-gray-100">

            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              <span className="font-medium text-gray-700">✅ {step1Data?.name}</span> — these extra details help us find the best match for you. All fields are optional.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Email Address</label>
                <input className="input" type="email" placeholder="your@email.com" {...reg2('email')} />
              </div>
              <div>
                <label className="label">Your City</label>
                <input className="input" placeholder="Where are you from?" {...reg2('city')} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Preferred College City</label>
                <input className="input" placeholder="Bangalore / Kochi…" {...reg2('preferredCity')} />
              </div>
              <div>
                <label className="label">Your 12th Stream</label>
                <select className="input" {...reg2('stream')}>
                  <option value="">Select…</option>
                  {STREAMS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">12th Percentage</label>
                <input className="input" type="number" min="0" max="100" step="0.1"
                  placeholder="e.g. 72.5" {...reg2('percentage')} />
              </div>
              <div>
                <label className="label">Max Budget (Total Fee ₹)</label>
                <input className="input" type="number" placeholder="e.g. 500000" {...reg2('budgetMax')} />
              </div>
            </div>

            {mutation.isError && (
              <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">
                {mutation.error?.response?.data?.error || 'Something went wrong. Please try again.'}
              </p>
            )}

            <button type="submit" disabled={mutation.isPending} className="btn-primary w-full py-3 text-base">
              {mutation.isPending ? 'Submitting…' : 'Submit — Get Free Counselling →'}
            </button>

            <button type="button" onClick={skipToSubmit} disabled={mutation.isPending}
              className="w-full text-center text-sm text-gray-400 hover:text-brand transition-colors py-1">
              Skip this step and submit now
            </button>

            <button type="button" onClick={() => setStep(1)}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1">
              ← Back
            </button>

            <p className="text-xs text-gray-400 text-center">
              By submitting, you agree to be contacted by our counselling team.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
