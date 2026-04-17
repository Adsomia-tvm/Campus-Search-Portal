import axios from 'axios';
import { useAuthStore } from '../context/auth';

const api = axios.create({ baseURL: '/api' });

// Attach JWT to every admin request
api.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(err);
  }
);

export default api;

// ── Public helpers ──────────────────────────────────────────────────────────
export const getColleges       = (params) => api.get('/colleges', { params }).then(r => r.data);
export const getRelatedColleges = (id)    => api.get(`/colleges/${id}/related`).then(r => r.data);
export const getCollegeStats    = (id)    => api.get(`/colleges/${id}/stats`).then(r => r.data);
export const getSuggestions = (q)    => api.get('/colleges/suggest', { params: { q } }).then(r => r.data);
export const getCollege    = (id)     => api.get(`/colleges/${id}`).then(r => r.data);
export const getCollegeBySlug = (citySlug, slug) => api.get(`/colleges/by-slug/${citySlug}/${slug}`).then(r => r.data);
export const getCityColleges  = (citySlug, params) => api.get(`/colleges/city/${citySlug}`, { params }).then(r => r.data);
export const getAllSlugs      = () => api.get('/colleges/seo/all-slugs').then(r => r.data);
export const getCompare    = (ids)    => api.get('/colleges/compare', { params: { ids } }).then(r => r.data);
export const getTop10      = (params) => api.get('/colleges/top10', { params }).then(r => r.data);
export const getCities     = ()       => api.get('/colleges/cities').then(r => r.data);
export const getCategories = ()       => api.get('/categories').then(r => r.data);
export const submitEnquiry    = (data) => api.post('/enquiries', data).then(r => r.data);
export const studentAuth      = (data) => api.post('/student/auth', data).then(r => r.data);
export const getStudentMe     = (tok)  => api.get('/student/me', { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.data);

// ── Admin helpers ───────────────────────────────────────────────────────────
export const login           = (d)  => api.post('/auth/login', d).then(r => r.data);
export const getDashboard    = ()   => api.get('/admin/dashboard').then(r => r.data);
export const getStudents     = (p)  => api.get('/admin/students', { params: p }).then(r => r.data);
export const createStudent   = (d)  => api.post('/admin/students', d).then(r => r.data);
export const updateStudent   = (id,d)=> api.put(`/admin/students/${id}`, d).then(r => r.data);
export const getEnquiries    = (p)  => api.get('/admin/enquiries', { params: p }).then(r => r.data);
export const updateEnquiry   = (id,d)=> api.put(`/admin/enquiries/${id}`, d).then(r => r.data);
export const getAdminColleges= (p)  => api.get('/admin/colleges', { params: p }).then(r => r.data);
export const getCommissions  = (p)  => api.get('/admin/commissions', { params: p }).then(r => r.data);
export const createCommission= (d)  => api.post('/admin/commissions', d).then(r => r.data);
export const updateCommission= (id,d)=> api.put(`/admin/commissions/${id}`, d).then(r => r.data);
export const getReports      = (t)  => api.get('/admin/reports', { params: { type: t } }).then(r => r.data);
export const importFees      = (f)  => { const fd = new FormData(); fd.append('file', f); return api.post('/admin/import/fees', fd).then(r => r.data); };
export const getTeam             = ()       => api.get('/admin/users').then(r => r.data);
export const createTeamMember    = (d)      => api.post('/admin/users', d).then(r => r.data);
export const updateTeamMember    = (id, d)  => api.put(`/admin/users/${id}`, d).then(r => r.data);
export const setConsultantColleges = (id, collegeIds) => api.put(`/admin/users/${id}/colleges`, { collegeIds }).then(r => r.data);
