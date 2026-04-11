import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './context/auth';

// Public pages — lazy loaded
const Home          = lazy(() => import('./pages/Home'));
const Search        = lazy(() => import('./pages/Search'));
const CollegeDetail = lazy(() => import('./pages/CollegeDetail'));
const CityColleges  = lazy(() => import('./pages/CityColleges'));
const Compare       = lazy(() => import('./pages/Compare'));
const Enquiry       = lazy(() => import('./pages/Enquiry'));
const Thanks        = lazy(() => import('./pages/Thanks'));

// Admin pages — lazy loaded (only downloaded when admin navigates)
const Login         = lazy(() => import('./pages/admin/Login'));
const Dashboard     = lazy(() => import('./pages/admin/Dashboard'));
const Students      = lazy(() => import('./pages/admin/Students'));
const Enquiries     = lazy(() => import('./pages/admin/Enquiries'));
const Colleges      = lazy(() => import('./pages/admin/Colleges'));
const Commissions   = lazy(() => import('./pages/admin/Commissions'));
const Reports       = lazy(() => import('./pages/admin/Reports'));
const Team          = lazy(() => import('./pages/admin/Team'));
const AdminLayout   = lazy(() => import('./components/AdminLayout'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );
}

function PrivateRoute({ children, roles }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/admin/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
    <Routes>
      {/* Public */}
      <Route path="/"             element={<Home />} />
      <Route path="/search"       element={<Search />} />
      <Route path="/college/:id"  element={<CollegeDetail />} />
      <Route path="/colleges/:citySlug/:slug" element={<CollegeDetail />} />
      <Route path="/colleges/:citySlug" element={<CityColleges />} />
      <Route path="/compare"      element={<Compare />} />
      <Route path="/enquire"      element={<Enquiry />} />
      <Route path="/thanks"       element={<Thanks />} />

      {/* Admin */}
      <Route path="/admin/login"  element={<Login />} />
      <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
        <Route index              element={<Dashboard />} />
        <Route path="enquiries"   element={<Enquiries />} />
        <Route path="students"    element={<PrivateRoute roles={['admin','staff']}><Students /></PrivateRoute>} />
        <Route path="colleges"    element={<PrivateRoute roles={['admin','staff']}><Colleges /></PrivateRoute>} />
        <Route path="commissions" element={<PrivateRoute roles={['admin','staff']}><Commissions /></PrivateRoute>} />
        <Route path="reports"     element={<PrivateRoute roles={['admin','staff']}><Reports /></PrivateRoute>} />
        <Route path="team"        element={<PrivateRoute roles={['admin']}><Team /></PrivateRoute>} />
      </Route>
    </Routes>
    </Suspense>
  );
}
