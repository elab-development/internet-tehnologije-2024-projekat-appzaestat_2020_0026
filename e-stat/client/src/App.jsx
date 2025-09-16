import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import { useAuthController } from './hooks/useAuth';
import './index.css';

export default function App() {
  const auth = useAuthController();
  return (
    <div className='min-h-screen flex flex-col bg-white text-slate-800'>
      <Header auth={auth} />
      <main className='w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1'>
        <Outlet context={auth} />
      </main>
      <Footer />
    </div>
  );
}
