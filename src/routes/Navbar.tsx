import { Car, User } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <Car className="h-8 w-8 text-primary" />
              <span className="font-bold text-xl text-gray-900">Hizli</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/publish" className="text-gray-600 hover:text-primary font-medium">
              Publish a ride
            </Link>
            <Link to="/search" className="text-gray-600 hover:text-primary font-medium">
              Find a ride
            </Link>
            <Link to="/profile" className="p-2 rounded-full hover:bg-gray-100">
              <User className="h-6 w-6 text-gray-600" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}