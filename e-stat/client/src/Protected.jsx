import { Navigate, useOutletContext } from 'react-router-dom';
export default function Protected({ children }) {
  const { isAuthed } = useOutletContext();
  if (!isAuthed) return <Navigate to='/login' replace />;
  return children;
}
