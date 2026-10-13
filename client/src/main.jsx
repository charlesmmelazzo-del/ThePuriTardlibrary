import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useLocation,
} from 'react-router-dom';
import { AppProvider, useApp } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import Library from './pages/Library.jsx';
import BookPage from './pages/Book.jsx';
import Reader from './pages/Reader.jsx';
import Notes from './pages/Notes.jsx';
import Goals from './pages/Goals.jsx';
import Search from './pages/Search.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/admin/Admin.jsx';
import BookEditor from './pages/admin/BookEditor.jsx';
import Groups from './pages/Groups.jsx';
import GroupPage from './pages/Group.jsx';
import Invite from './pages/Invite.jsx';
import './styles.css';

function RequireUser({ children, admin = false }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (admin && !user.is_admin) return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (user) {
    const invite = new URLSearchParams(location.search).get('invite');
    return <Navigate to={invite ? `/invite/${invite}` : '/'} replace />;
  }
  return children;
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route element={<RequireUser><Layout /></RequireUser>}>
        <Route index element={<Library />} />
        <Route path="books/:bookId" element={<BookPage />} />
        <Route path="read/:bookId/:sectionId" element={<Reader />} />
        <Route path="notes" element={<Notes />} />
        <Route path="goals" element={<Goals />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:groupId" element={<GroupPage />} />
        <Route path="search" element={<Search />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route element={<RequireUser admin><Layout /></RequireUser>}>
        <Route path="admin" element={<Admin />} />
        <Route path="admin/books/:bookId" element={<BookEditor />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);
