
import React from 'react';
import { Link } from 'react-router-dom';
import { useUI } from '../context/UIContext';

const UpgradeModal: React.FC = () => {
    const { showUpgradeModal, setShowUpgradeModal } = useUI();

    if (!showUpgradeModal) return null;

    const onClose = () => setShowUpgradeModal(false);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-scale-in text-center border-4 border-yellow-400">
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 w-24 h-24 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-full flex items-center justify-center shadow-lg border-4 border-white">
                    <i className="fas fa-bolt text-4xl text-white animate-pulse"></i>
                </div>

                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                    <i className="fas fa-times text-xl"></i>
                </button>

                <h2 className="text-3xl font-black text-gray-800 mt-10 mb-2">Out of Energy!</h2>
                <p className="text-gray-600 mb-8 text-lg leading-relaxed">
                    You've used all your AI credits for this period. Refuel your kitchen to keep cooking with AI power.
                </p>

                <div className="bg-gray-50 rounded-xl p-4 mb-8 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-gray-700">Starter Plan</span>
                        <span className="font-bold text-green-600">$5/mo</span>
                    </div>
                    <p className="text-sm text-gray-500 text-left">Get 50 credits to generate recipes, plans, and more.</p>
                </div>

                <Link
                    to="/subscription"
                    onClick={onClose}
                    className="block w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-orange-500/30 hover:scale-[1.02] transition-all text-lg"
                >
                    Get More Credits
                </Link>

                <button onClick={onClose} className="mt-4 text-gray-400 hover:text-gray-600 text-sm font-semibold">
                    Maybe later
                </button>
            </div>
        </div>
    );
};

export default UpgradeModal;
