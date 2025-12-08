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
                    <button
                        onClick={() => login()}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-sign-in-alt"></i> Sign In to Account
                    </button>

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
