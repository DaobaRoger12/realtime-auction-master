import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { Login } from './pages/Login';
import { AuctionList } from './pages/AuctionList';
import { LiveRoom } from './pages/LiveRoom';
import { Orders } from './pages/Orders';

export function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const token = useAuth((s) => s.token);
  const location = useLocation();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <div className="phone no-scrollbar">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={token ? <AuctionList /> : <Navigate to="/login" state={{ from: location }} />}
        />
        <Route
          path="/room/:id"
          element={token ? <LiveRoom /> : <Navigate to="/login" />}
        />
        <Route path="/orders" element={token ? <Orders /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
