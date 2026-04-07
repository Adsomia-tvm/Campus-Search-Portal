import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useStudentStore } from '../context/studentAuth';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const student = useStudentStore(s => s.student);
  const logout  = useStudentStore(s => s.logout);

  return (
    <nav className="bg-brand text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center">
          <img
            src="/logo.png"
            alt="Campus Search — India's Best College Search Portal"
            className="h-12 w-auto object-contain bg-white rounded-lg px-2 py-1"
          />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link to="/search"  className="hover:text-blue-200 transition-colors">Find Colleges</Link>
          <Link to="/compare" className="hover:text-blue-200 transition-colors">Compare</Link>
          {student ? (
            <div className="flex items-center gap-3">
              <span className="text-blue-200 text-sm">👋 {student.name.split(' ')[0]}</span>
              <button onClick={logout} className="text-xs text-blue-300 hover:text-white underline">Logout</button>
            </div>
          ) : (
            <Link to="/enquire" className="bg-white text-brand px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-semibold">
              Free Counselling
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          <div className="space-y-1.5">
            <span className="block w-6 h-0.5 bg-white" />
            <span className="block w-6 h-0.5 bg-white" />
            <span className="block w-6 h-0.5 bg-white" />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-brand-light px-4 py-3 space-y-2 text-sm font-medium">
          <Link to="/search"  className="block py-2" onClick={() => setOpen(false)}>Find Colleges</Link>
          <Link to="/compare" className="block py-2" onClick={() => setOpen(false)}>Compare</Link>
          {student ? (
            <>
              <span className="block py-2 text-blue-200">👋 {student.name}</span>
              <button onClick={() => { logout(); setOpen(false); }} className="block py-2 text-blue-300 underline text-left w-full">Logout</button>
            </>
          ) : (
            <Link to="/enquire" className="block py-2" onClick={() => setOpen(false)}>Free Counselling</Link>
          )}
        </div>
      )}
    </nav>
  );
}
