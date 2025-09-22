import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

export default function ChartCard({ title, type = 'line', data, options }) {
  const Comp = type === 'bar' ? Bar : type === 'pie' ? Pie : Line;
  return (
    <section className='rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
      <h2 className='text-lg font-semibold text-slate-900 mb-4'>{title}</h2>
      <div className='h-80'>
        <Comp
          data={data}
          options={{ responsive: true, maintainAspectRatio: false, ...options }}
        />
      </div>
    </section>
  );
}
