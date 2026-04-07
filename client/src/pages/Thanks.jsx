import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import usePageTitle from '../hooks/usePageTitle';

export default function Thanks() {
  usePageTitle('Application Submitted');
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="text-7xl mb-6">✅</div>
        <h1 className="text-3xl font-extrabold text-brand mb-4">Enquiry Submitted!</h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          Thank you! Our counselling team will call you within 24 hours to help you choose the right college.
        </p>
        <a
          href="https://wa.me/91XXXXXXXXXX?text=Hi, I just submitted an enquiry on Campus Search. Can you guide me?"
          target="_blank" rel="noreferrer"
          className="btn-primary inline-block mb-4 bg-green-600 hover:bg-green-700 text-base px-8 py-3"
        >
          📱 Chat on WhatsApp Now
        </a>
        <br />
        <Link to="/search" className="text-brand hover:underline text-sm">← Continue browsing colleges</Link>
      </div>
    </div>
  );
}
