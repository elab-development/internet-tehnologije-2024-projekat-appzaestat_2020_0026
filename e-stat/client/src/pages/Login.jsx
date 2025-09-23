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
