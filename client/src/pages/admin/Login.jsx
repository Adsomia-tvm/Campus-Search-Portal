import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { login } from '../../api';
import { useAuthStore } from '../../context/auth';
import usePageTitle from '../../hooks/usePageTitle';

export default function Login() {
  usePageTitle('Admin Login');
  const navigate = useNavigate();
  const { login: setAuth } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm();

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      // Redirect college users to their portal, everyone else to admin
      navigate(data.user?.role === 'college' ? '/college-portal' : '/admin');
    },
  });

  return (
    <div className="min-h-screen bg-brand flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎓</div>
          <h1 className="text-2xl font-extrabold text-brand">Campus Search</h1>
          <p className="text-gray-400 text-sm mt-1">Login to your account</p>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4" autoComplete="off">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" autoComplete="off"
              {...register('email', { required: 'Email is required' })} />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" autoComplete="new-password"
              {...register('password', { required: 'Password is required' })} />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          {mutation.isError && (
            <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">
              {mutation.error?.response?.data?.error || 'Login failed'}
            </p>
          )}

          <button type="submit" disabled={mutation.isPending} className="btn-primary w-full py-3 text-base mt-2">
            {mutation.isPending ? 'Logging in…' : 'Login →'}
          </button>
        </form>

      </div>
    </div>
  );
}
