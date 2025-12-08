import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const Login: React.FC = () => {
    const { login } = useUser();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await login(email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="bg-blue-600 p-8 text-center">
                    <h1 className="text-3xl font-bold text-white mb-2">KitchenSync</h1>
                    <p className="text-blue-100">Welcome back, Chef!</p>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm flex items-center">
                            <i className="fas fa-exclamation-circle mr-2"></i> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full form-input p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="chef@kitchensync.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full form-input p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                        >
                            {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Log In'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-600">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-blue-600 font-bold hover:underline">
                            Sign Up
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
