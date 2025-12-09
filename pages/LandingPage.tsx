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
            <div className="relative pt-20 pb-20 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] -z-10"></div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <div className="inline-block px-4 py-1.5 mb-6 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm font-semibold tracking-wide uppercase animate-fade-in-up">
                        <i className="fas fa-sparkles mr-2"></i> Now with AI Receipt Scanning
                    </div>
                    <h1 className="text-5xl md:text-7xl font-extrabold mb-8 tracking-tight leading-tight">
                        Your Personal <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-green-400 to-teal-400 animate-gradient-x">
                            AI Sous Chef
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-400 mb-10 max-w-3xl mx-auto leading-relaxed">
                        Stop wondering "What's for dinner?". Organize your pantry, scan old receipts, and generate meal plans instantly.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link to="/register" className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.5)] flex items-center justify-center">
                            Start Cooking for Free <i className="fas fa-arrow-right ml-2 opacity-80"></i>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Demo / Product Showcase Section */}
            <div className="py-16 relative">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-gray-900/50 backdrop-blur">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10"></div>

                        {/* Video Placeholder */}
                        <div className="aspect-video w-full flex items-center justify-center relative group cursor-pointer hover:bg-black/20 transition-colors">
                            {/* Decorative UI Mockup Elements */}
                            <div className="absolute top-4 left-4 right-4 h-6 flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                            </div>

                            <div className="text-center transform transition-transform group-hover:scale-110">
                                <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-full flex items-center justify-center mb-4 mx-auto border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                    <i className="fas fa-play text-3xl text-white ml-1"></i>
                                </div>
                                <p className="text-gray-400 font-medium tracking-wide uppercse text-sm">Watch the Demo</p>
                                <p className="text-gray-600 text-xs mt-2">(Coming Soon)</p>
                            </div>
                        </div>
                    </div>

                    {/* Social Proof / Trust Strip */}
                    <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        {/* Mock Logos */}
                        <div className="text-center font-bold text-xl flex items-center justify-center gap-2"><i className="fas fa-carrot"></i> FreshFinds</div>
                        <div className="text-center font-bold text-xl flex items-center justify-center gap-2"><i className="fas fa-utensil-spoon"></i> ChefDaily</div>
                        <div className="text-center font-bold text-xl flex items-center justify-center gap-2"><i className="fas fa-leaf"></i> OrganicLife</div>
                        <div className="text-center font-bold text-xl flex items-center justify-center gap-2"><i className="fas fa-fire"></i> HotPlate</div>
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
