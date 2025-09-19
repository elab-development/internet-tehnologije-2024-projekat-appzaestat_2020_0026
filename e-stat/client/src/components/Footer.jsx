export default function Footer() {
  return (
    <footer className='border-t border-slate-200 bg-white'>
      <div className='w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between text-sm'>
        <span className='text-slate-600'>
          © {new Date().getFullYear()} e-Stat
        </span>
        <span className='text-slate-500'>
          Data source:{' '}
          <a
            href='https://opendata.stat.gov.rs/odata'
            target='_blank'
            rel='noopener noreferrer'
          >
            <span className='text-blue-700 font-medium'>SORS Open Data</span>
          </a>
        </span>
      </div>
    </footer>
  );
}
