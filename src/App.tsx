import { Routes, Route } from 'react-router';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Notifications from '@/pages/Notifications';
import PostDetail from '@/pages/PostDetail';
import SupportMessages from '@/pages/SupportMessages';
import Mutuals from '@/pages/Mutuals';
import Chats from '@/pages/Chats';
import Journal from '@/pages/Journal';
import MoodTracker from '@/pages/Mood';
import Blogs from '@/pages/Blogs';
import BlogPost from '@/pages/BlogArticle';
import Stories from '@/pages/Stories';
import Profile from '@/pages/Profile';
import PublicProfile from '@/pages/PublicProfile';
import Settings from '@/pages/Settings';
import Moderation from '@/pages/Moderation';
import Auth from '@/pages/Auth';
import ResetPassword from '@/pages/ResetPassword';
import Onboarding from '@/pages/Onboarding';
import { RequireAuth, RequireCompleteProfile } from '@/components/RouteGuard';
import NotFound from "./pages/NotFound"
import AppErrorBoundary from '@/components/AppErrorBoundary';

export default function App() {
  return (
    <AppErrorBoundary>
    <Routes>
      {/* Auth pages (public) */}
      <Route path="/login" element={<Auth />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Onboarding: signed in, but profile not necessarily complete */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />

      {/* Main app: signed in + completed profile */}
      <Route
        element={
          <RequireCompleteProfile>
            <Layout />
          </RequireCompleteProfile>
        }
      >
        <Route index element={<Home />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="post/:id" element={<PostDetail />} />
        <Route path="support-messages" element={<SupportMessages />} />
        <Route path="mutuals" element={<Mutuals />} />
        <Route path="chats" element={<Chats />} />
        <Route path="journal" element={<Journal />} />
        <Route path="mood" element={<MoodTracker />} />
        <Route path="blogs" element={<Blogs />} />
        <Route path="blogs/:id" element={<BlogPost />} />
        <Route path="stories" element={<Stories />} />
        <Route path="profile" element={<Profile />} />
        <Route path="u/id/:id" element={<PublicProfile />} />
        <Route path="u/:username" element={<PublicProfile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="moderation" element={<Moderation />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </AppErrorBoundary>
  );
}
