import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

const Register: React.FC = () => {
    const { register } = useUser();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await register(name, email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="bg-green-600 p-8 text-center">
                    <h1 className="text-3xl font-bold text-white mb-2">Join the Kitchen</h1>
                    <p className="text-green-100">Start your culinary journey today.</p>
                </div>

                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm flex items-center">
                            <i className="fas fa-exclamation-circle mr-2"></i> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name / Chef Handle</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full form-input p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                placeholder="Gordon Ramsey"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full form-input p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                                className="w-full form-input p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors disabled:bg-green-300"
                        >
                            {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Sign Up'}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-600">
                        Already have a station?{' '}
                        <Link to="/login" className="text-green-600 font-bold hover:underline">
                            Log In
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
