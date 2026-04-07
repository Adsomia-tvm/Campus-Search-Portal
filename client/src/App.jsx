import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './context/auth';

// Public pages
import Home          from './pages/Home';
import Search        from './pages/Search';
import CollegeDetail from './pages/CollegeDetail';
import Compare       from './pages/Compare';
import Enquiry       from './pages/Enquiry';
import Thanks        from './pages/Thanks';

// Admin pages
import Login         from './pages/admin/Login';
import Dashboard     from './pages/admin/Dashboard';
import Students      from './pages/admin/Students';
import Enquiries     from './pages/admin/Enquiries';
import Colleges      from './pages/admin/Colleges';
import Commissions   from './pages/admin/Commissions';
import Reports       from './pages/admin/Reports';
import Team          from './pages/admin/Team';
import AdminLayout   from './components/AdminLayout';

function PrivateRoute({ children, roles }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/admin/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"             element={<Home />} />
      <Route path="/search"       element={<Search />} />
      <Route path="/college/:id"  element={<CollegeDetail />} />
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
  );
}
