import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './Navbar';
import Home from './Home';

// Placeholders pour les autres pages (on les créera plus tard)
const SearchResults = () => <div className="p-8">Search Results Page</div>;
const PublishRide = () => <div className="p-8">Publish Ride Page (Vehicle Check)</div>;
const Profile = () => <div className="p-8">User Profile (Progressive Onboarding)</div>;
const Login = () => <div className="p-8">Login / Sign up</div>;

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/publish" element={<PublishRide />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;