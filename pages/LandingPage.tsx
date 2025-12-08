import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden">
            {/* Navbar */}
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
                <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-green-400">
                    <i className="fas fa-utensils mr-2 text-white"></i> KitchenSync
                </div>
                <div className="space-x-6">
                    <Link to="/login" className="text-gray-300 hover:text-white font-medium transition-colors">Log In</Link>
                    <Link to="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-bold transition-all transform hover:scale-105 shadow-lg">
                        Get Started
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative pt-20 pb-32 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] -z-10"></div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-8 tracking-tight">
                        Your Personal <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-green-400 to-teal-400 animate-gradient-x">
                            AI Sous Chef
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto">
                        Stop wondering "What's for dinner?". Organize your pantry, generate recipes instantly, and master your meal planning with the power of AI.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link to="/register" className="px-8 py-4 bg-white text-gray-900 rounded-full font-bold text-lg hover:bg-gray-100 transition-all transform hover:scale-105 shadow-xl flex items-center justify-center">
                            Start Cooking for Free <i className="fas fa-arrow-right ml-2"></i>
                        </Link>
                        <Link to="/login" className="px-8 py-4 bg-gray-800 text-white border border-gray-700 rounded-full font-bold text-lg hover:bg-gray-700 transition-all flex items-center justify-center">
                            View Demo
                        </Link>
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <div className="py-24 bg-gray-800/50 backdrop-blur-sm border-t border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        {/* Feature 1 */}
                        <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 hover:border-blue-500/50 transition-all hover:shadow-blue-500/10 hover:shadow-2xl group">
                            <div className="w-14 h-14 bg-blue-900/50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                                <i className="fas fa-magic text-2xl text-blue-400 group-hover:text-white"></i>
                            </div>
                            <h3 className="text-2xl font-bold mb-4">AI Recipe Generation</h3>
                            <p className="text-gray-400">Turn random ingredients into 5-star meals. Just take a photo or list what you have, and our AI does the rest.</p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 hover:border-green-500/50 transition-all hover:shadow-green-500/10 hover:shadow-2xl group">
                            <div className="w-14 h-14 bg-green-900/50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-green-600 transition-colors">
                                <i className="fas fa-box-open text-2xl text-green-400 group-hover:text-white"></i>
                            </div>
                            <h3 className="text-2xl font-bold mb-4">Smart Pantry</h3>
                            <p className="text-gray-400">Keep track of what you have. Get alerts before food expires and auto-generate shopping lists.</p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 hover:border-purple-500/50 transition-all hover:shadow-purple-500/10 hover:shadow-2xl group">
                            <div className="w-14 h-14 bg-purple-900/50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-purple-600 transition-colors">
                                <i className="fas fa-calendar-alt text-2xl text-purple-400 group-hover:text-white"></i>
                            </div>
                            <h3 className="text-2xl font-bold mb-4">Automated Planning</h3>
                            <p className="text-gray-400">Plan your entire week in seconds. Balance nutrition, variety, and your specific dietary goals automatically.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="py-12 border-t border-white/10 text-center text-gray-500">
                <p>&copy; 2024 KitchenSync AI. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default LandingPage;
