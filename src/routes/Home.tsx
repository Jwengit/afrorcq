import { Search, Shield, Zap, DollarSign, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-primary text-white py-20 px-4 md:px-8 flex flex-col items-center justify-center text-center">
        <div className="max-w-5xl mx-auto z-10">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            Safety. Simplicity. Saving.
          </h1>
          <p className="text-xl md:text-2xl mb-10 text-blue-100 max-w-2xl mx-auto">
            The long-distance carpooling platform designed for trust. Connect directly, travel safely across the US.
          </p>
          
          {/* Search Box */}
          <div className="bg-white p-4 rounded-2xl shadow-xl w-full flex flex-col md:flex-row gap-4 text-gray-900 mx-auto">
            <div className="flex-1 flex flex-col items-start">
              <label className="text-xs font-semibold text-gray-500 ml-1 mb-1">Leaving from</label>
              <input type="text" placeholder="City, State" className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex-1 flex flex-col items-start">
              <label className="text-xs font-semibold text-gray-500 ml-1 mb-1">Going to</label>
              <input type="text" placeholder="City, State" className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="w-full md:w-48 flex flex-col items-start">
              <label className="text-xs font-semibold text-gray-500 ml-1 mb-1">Date</label>
              <input type="date" className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="w-full md:w-32 flex flex-col items-start">
               <label className="text-xs font-semibold text-gray-500 ml-1 mb-1">Passengers</label>
               <input type="number" min="1" defaultValue="1" className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-end">
                <button className="w-full md:w-auto bg-secondary hover:bg-pink-600 text-white px-8 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2 h-[50px]">
                    <Search className="h-5 w-5" /> Search
                </button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why choose Hizli?</h2>
            <p className="text-xl text-gray-600">We prioritize your safety and convenience above all else.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center p-6 rounded-xl hover:bg-gray-50 transition">
              <div className="bg-blue-100 p-4 rounded-full mb-6">
                <Shield className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Safety First</h3>
              <p className="text-gray-600">
                Verified profiles and manual validation for drivers. We focus on creating a secure community for everyone.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-xl hover:bg-gray-50 transition">
              <div className="bg-pink-100 p-4 rounded-full mb-6">
                <Heart className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Girls Only Option</h3>
              <p className="text-gray-600">
                A unique feature allowing female drivers to offer rides exclusively to female passengers for added peace of mind.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-xl hover:bg-gray-50 transition">
              <div className="bg-green-100 p-4 rounded-full mb-6">
                <DollarSign className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">Save Money</h3>
              <p className="text-gray-600">
                Cut travel costs by sharing the ride. Transparent pricing with no hidden fees for a simple, saving-focused experience.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works / CTA */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Simple, Fluid, Reliable.
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Whether you're driving or riding, Hizli makes long-distance travel easy. 
              No complex logic, just direct connections.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/publish" className="bg-primary text-white px-8 py-4 rounded-lg font-bold text-center hover:bg-blue-600 transition">
                Publish a Ride
              </Link>
              <Link to="/search" className="bg-white text-gray-900 border border-gray-300 px-8 py-4 rounded-lg font-bold text-center hover:bg-gray-100 transition">
                Find a Ride
              </Link>
            </div>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-lg">
             <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                    <Zap className="text-gray-500" />
                </div>
                <div>
                    <h4 className="font-bold text-lg">Instant Booking</h4>
                    <p className="text-sm text-gray-500">Book your seat in seconds</p>
                </div>
             </div>
             <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                    <Shield className="text-gray-500" />
                </div>
                <div>
                    <h4 className="font-bold text-lg">Verified Drivers</h4>
                    <p className="text-sm text-gray-500">Manual validation for peace of mind</p>
                </div>
             </div>
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                    <Heart className="text-secondary" />
                </div>
                <div>
                    <h4 className="font-bold text-lg">Community Trust</h4>
                    <p className="text-sm text-gray-500">Reviews and ratings you can rely on</p>
                </div>
             </div>
          </div>
        </div>
      </section>
    </div>
  );
}