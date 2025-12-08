
import React from 'react';
import { Link } from 'react-router-dom';
import type { UserProfile } from '../types';

interface PremiumGateProps {
    userProfile: UserProfile;
    children: React.ReactNode;
    featureName?: string;
    showPreview?: boolean;
}

const PremiumGate: React.FC<PremiumGateProps> = ({ userProfile, children, featureName = "Premium Feature", showPreview = true }) => {
    if (userProfile.subscriptionTier === 'pro') {
        return <>{children}</>;
    }

    return (
        <div className="relative w-full h-full">
            {/* The Content (Blurred) */}
            <div className={`transition-all duration-500 ${showPreview ? 'blur-sm opacity-50 pointer-events-none select-none' : 'hidden'}`}>
                {children}
            </div>

            {/* The Gate Overlay */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                <div className="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-md border border-white/50 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500"></div>
                    
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner group-hover:scale-110 transition-transform duration-300">
                        <i className="fas fa-crown text-3xl text-yellow-600"></i>
                    </div>

                    <h3 className="text-2xl font-extrabold text-gray-800 mb-2">
                        Unlock {featureName}
                    </h3>
                    
                    <p className="text-gray-600 mb-6 leading-relaxed">
                        Upgrade to the <span className="font-bold text-gray-800">Executive Chef</span> tier to access unlimited AI Architect plans, the Sous Chef assistant, and advanced recipe generation.
                    </p>

                    <Link 
                        to="/subscription" 
                        className="block w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white py-4 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] transition-all relative overflow-hidden"
                    >
                        <span className="relative z-10 flex items-center justify-center">
                            Upgrade Now <i className="fas fa-arrow-right ml-2"></i>
                        </span>
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                    </Link>
                    
                    <p className="text-xs text-gray-400 mt-4">
                        Starting at just $9.99/mo
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PremiumGate;
