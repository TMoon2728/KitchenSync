import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const Login: React.FC = () => {
    const { login } = useUser();

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-8 text-center">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">KitchenSync</h1>
                    <p className="text-gray-600">Welcome back, Chef!</p>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <button
                            onClick={() => login('admin')}
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-xl font-bold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md group text-left"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="block text-lg">Admin Access</span>
                                    <span className="text-purple-200 text-xs font-normal">Unlimited Credits & Pro Features</span>
                                </div>
                                <i className="fas fa-user-shield text-2xl opacity-50 group-hover:opacity-100 transition-opacity"></i>
                            </div>
                        </button>

                        <button
                            onClick={() => login('chef_demo')}
                            className="bg-white border-2 border-gray-100 text-gray-700 p-4 rounded-xl font-bold hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm group text-left"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="block text-lg">Demo Customer</span>
                                    <span className="text-gray-400 text-xs font-normal">Standard Free Tier Experience</span>
                                </div>
                                <i className="fas fa-user text-2xl opacity-20 group-hover:opacity-100 transition-opacity"></i>
                            </div>
                        </button>
                    </div>

                    <p className="text-sm text-gray-500 mt-4">
                        You will be redirected to our secure login page.
                        <br />
                        <Link to="/register" className="text-blue-600 hover:underline">Need an account?</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
