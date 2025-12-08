import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const Register: React.FC = () => {
    const { register } = useUser();

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-8 text-center">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Join the Kitchen</h1>
                    <p className="text-gray-600">Start your culinary journey today.</p>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={() => register()}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-user-plus"></i> Create Account
                    </button>

                    <p className="text-sm text-gray-500 mt-4">
                        You will be redirected to our secure signup page.
                        <br />
                        <Link to="/login" className="text-green-600 hover:underline">Already have a station?</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
