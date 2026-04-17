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

// College portal pages — lazy loaded
const CollegeLayout     = lazy(() => import('./components/CollegeLayout'));
const CollegeDashboard  = lazy(() => import('./pages/college/Dashboard'));
const CollegeEnquiries  = lazy(() => import('./pages/college/Enquiries'));
const CollegeCourses    = lazy(() => import('./pages/college/Courses'));
const CollegeProfile    = lazy(() => import('./pages/college/Profile'));

// Agent portal pages — lazy loaded
const AgentLayout       = lazy(() => import('./components/AgentLayout'));
const AgentDashboard    = lazy(() => import('./pages/agent/Dashboard'));
const AgentLeads        = lazy(() => import('./pages/agent/Leads'));
const AgentRefer        = lazy(() => import('./pages/agent/Refer'));
const AgentCommissions  = lazy(() => import('./pages/agent/Commissions'));
const AgentProfile      = lazy(() => import('./pages/agent/Profile'));

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

function CollegeRoute({ children }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/admin/login" replace />;
  if (user?.role !== 'college') return <Navigate to="/admin" replace />;
  return children;
}

function AgentRoute({ children }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/admin/login" replace />;
  if (user?.role !== 'agent') return <Navigate to="/admin" replace />;
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

      {/* College Portal */}
      <Route path="/college-portal" element={<CollegeRoute><CollegeLayout /></CollegeRoute>}>
        <Route index              element={<CollegeDashboard />} />
        <Route path="enquiries"   element={<CollegeEnquiries />} />
        <Route path="courses"     element={<CollegeCourses />} />
        <Route path="profile"     element={<CollegeProfile />} />
      </Route>

      {/* Agent Portal */}
      <Route path="/agent-portal" element={<AgentRoute><AgentLayout /></AgentRoute>}>
        <Route index              element={<AgentDashboard />} />
        <Route path="leads"       element={<AgentLeads />} />
        <Route path="refer"       element={<AgentRefer />} />
        <Route path="commissions" element={<AgentCommissions />} />
        <Route path="profile"     element={<AgentProfile />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
