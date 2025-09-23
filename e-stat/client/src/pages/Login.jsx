import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

export default function Login() {
  const { login, isAuthed } = useOutletContext();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    try {
      await login(email, password);
      nav('/dashboard');
    } catch (e) {
      setErr(e.message);
    }
  }

  if (isAuthed) {
    return (
      <div className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
        <p className='text-slate-700'>You are already logged in.</p>
      </div>
    );
  }

  return (
    <div className='max-w-md mx-auto'>
      <div className='text-center mb-8'>
        <h1 className='text-2xl font-semibold text-slate-900'>Welcome back</h1>
        <p className='text-slate-600'>
          Sign in to <span className='text-blue-700 font-medium'>e-Stat</span>.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4'
      >
        <div>
          <label className='block text-sm font-medium text-slate-700'>
            Email
          </label>
          <input
            className='mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            placeholder='you@mail.com'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className='block text-sm font-medium text-slate-700'>
            Password
          </label>
          <input
            type='password'
            className='mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            placeholder='••••••••'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <div className='text-sm text-red-600'>{err}</div>}

        <button
          type='submit'
          className='w-full inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 transition'
        >
          Sign in
        </button>
      </form>

      <p className='mt-4 text-center text-sm text-slate-600'>
        Don’t have an account?{' '}
        <a
          href='/register'
          className='text-blue-700 font-medium hover:underline'
        >
          Create one
        </a>
      </p>
    </div>
  );
}
