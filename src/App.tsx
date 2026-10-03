import { Routes, Route } from 'react-router';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Notifications from '@/pages/Notifications';
import Chats from '@/pages/Chats';
import Journal from '@/pages/Journal';
import MoodTracker from '@/pages/Mood';
import Blogs from '@/pages/Blogs';
import BlogPost from '@/pages/BlogArticle';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="chats" element={<Chats />} />
        <Route path="journal" element={<Journal />} />
        <Route path="mood" element={<MoodTracker />} />
        <Route path="blogs" element={<Blogs />} />
        <Route path="blogs/:id" element={<BlogPost />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
