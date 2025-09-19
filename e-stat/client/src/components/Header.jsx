import { Link, NavLink, useNavigate } from 'react-router-dom';

export default function Header({ auth }) {
  const nav = useNavigate();
  const onLogout = () => {
    auth.logout();
    nav('/login');
  };

  const linkClass = ({ isActive }) =>
    [
      'px-3 py-2 rounded-md text-sm font-medium transition',
      'text-slate-600 hover:text-blue-700 hover:bg-blue-50',
      isActive ? 'text-blue-700 bg-blue-50' : '',
    ].join(' ');

  return (
    <header className='sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200'>
      <div className='w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between'>
        <Link to='/' className='flex items-center gap-2'>
          <div className='h-9 w-9 grid place-items-center rounded-lg bg-blue-600 text-white font-bold'>
            e
          </div>
          <span className='text-lg font-semibold text-slate-900'>e-Stat</span>
        </Link>

        <nav className='flex items-center gap-1'>
          <NavLink to='/dashboard' className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to='/analytics' className={linkClass}>
            Analytics
          </NavLink>
          {!auth.isAuthed ? (
            <>
              <NavLink to='/login' className={linkClass}>
                Login
              </NavLink>
              <NavLink to='/register' className={linkClass}>
                Register
              </NavLink>
            </>
          ) : (
            <>
              <span className='hidden sm:inline text-sm text-slate-600 mx-2'>
                👤 {auth.user?.name}
              </span>
              <button
                onClick={onLogout}
                className='px-3 py-2 rounded-md text-sm font-medium text-blue-700 hover:bg-blue-50 transition'
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
