import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const Login: React.FC = () => {
    const { login, devLogin } = useUser();
    const [showDevTools, setShowDevTools] = useState(false);

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-8 text-center">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">KitchenSync</h1>
                    <p className="text-gray-600">Welcome back, Chef!</p>
                </div>

                <div className="space-y-4">
                    {/* Primary Production Login */}
                    <button
                        onClick={() => login()}
                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg mb-6"
                    >
                        <i className="fas fa-sign-in-alt text-xl"></i>
                        <span className="text-lg">Sign In / Register</span>
                    </button>

                    <div className="border-t border-gray-100 pt-4">
                        <button
                            onClick={() => setShowDevTools(!showDevTools)}
                            className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
                        >
                            {showDevTools ? 'Hide Developer Options' : 'Show Developer Options'}
                        </button>
                    </div>

                    {/* Dev Tools Section */}
                    {showDevTools && (
                        <div className="grid grid-cols-1 gap-4 animate-fade-in mt-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                Local Development
                            </div>
                            <button
                                onClick={() => devLogin('admin')}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 rounded-lg font-bold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md group text-left"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="block text-sm">Admin Access</span>
                                        <span className="text-purple-200 text-[10px] font-normal">Unlimited Credits</span>
                                    </div>
                                    <i className="fas fa-user-shield text-xl opacity-50 group-hover:opacity-100 transition-opacity"></i>
                                </div>
                            </button>

                            <button
                                onClick={() => devLogin('chef_demo')}
                                className="bg-white border text-gray-700 p-3 rounded-lg font-bold hover:bg-gray-50 transition-all shadow-sm group text-left"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="block text-sm">Demo Customer</span>
                                        <span className="text-gray-400 text-[10px] font-normal">Free Tier</span>
                                    </div>
                                    <i className="fas fa-user text-xl opacity-20 group-hover:opacity-100 transition-opacity"></i>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
