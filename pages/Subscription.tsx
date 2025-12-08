
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '../types';
import { useUser } from '../context/UserContext';
import { authFetch } from '../utils/api';
import { redirectToCheckout } from '../services/stripeService';
import Spinner from '../components/Spinner';
import confetti from 'canvas-confetti';

const Subscription: React.FC = () => {
    const { userProfile, updateProfile } = useUser();

    // Adapter
    const setUserProfile = (action: React.SetStateAction<UserProfile>) => {
        if (typeof action === 'function') {
            updateProfile(action(userProfile));
        } else {
            updateProfile(action);
        }
    };

    const [isLoading, setIsLoading] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleUpgrade = async (tier: 'starter' | 'pro') => {
        setIsLoading(tier);
        // Simulate Stripe Checkout Delay
        await redirectToCheckout(tier);



        // ... 

        // API Call
        try {
            const res = await authFetch('/api/subscription/upgrade', {
                method: 'POST',
                body: JSON.stringify({ tier })
            });

            if (res.ok) {
                const data = await res.json();
                setUserProfile(prev => ({
                    ...prev,
                    subscriptionTier: data.tier,
                    credits: data.credits
                }));
            }
        } catch (e) {
            console.error("Upgrade error", e);
        }

        setIsLoading(null);

        confetti({
            particleCount: 200,
            spread: 100,
            origin: { y: 0.6 },
            colors: ['#FFD700', '#FFA500', '#FFFFFF']
        });

        setTimeout(() => navigate('/'), 1500);
    };

    const PlanCard: React.FC<{
        tier: string;
        price: string;
        credits: string;
        features: string[];
        color: string;
        buttonText: string;
        isCurrent: boolean;
        onSelect?: () => void;
        popular?: boolean;
    }> = ({ tier, price, credits, features, color, buttonText, isCurrent, onSelect, popular }) => (
        <div className={`relative flex flex-col p-6 rounded-3xl border-2 transition-all duration-300 ${isCurrent ? 'border-green-500 bg-white shadow-xl scale-105 z-10' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-lg'}`}>
            {popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-md uppercase tracking-wider">
                    Most Popular
                </div>
            )}
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-white text-xl shadow-md ${color}`}>
                <i className={`fas ${tier === 'Pro' ? 'fa-crown' : tier === 'Starter' ? 'fa-bolt' : 'fa-seedling'}`}></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800">{tier}</h3>
            <div className="mt-2 mb-1">
                <span className="text-3xl font-extrabold text-gray-900">{price}</span>
                {price !== 'Free' && <span className="text-gray-500 font-medium">/mo</span>}
            </div>
            <div className="text-sm font-bold text-blue-600 bg-blue-50 w-fit px-3 py-1 rounded-full mb-6">
                {credits} Credits
            </div>

            <ul className="space-y-3 mb-8 flex-grow">
                {features.map((feat, i) => (
                    <li key={i} className="flex items-start text-sm text-gray-600">
                        <i className="fas fa-check text-green-500 mt-1 mr-2"></i>
                        {feat}
                    </li>
                ))}
            </ul>

            <button
                onClick={onSelect}
                disabled={isCurrent || isLoading !== null}
                className={`w-full py-3 rounded-xl font-bold transition-all ${isCurrent
                    ? 'bg-green-100 text-green-700 cursor-default'
                    : isLoading === tier.toLowerCase()
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg active:scale-95'
                    }`}
            >
                {isLoading === tier.toLowerCase() ? <Spinner size="sm" /> : isCurrent ? 'Current Plan' : buttonText}
            </button>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto py-12 px-4 animate-fade-in">
            <div className="text-center mb-16">
                <h1 className="text-4xl font-extrabold text-gray-900 mb-4">
                    Choose Your Kitchen Level
                </h1>
                <p className="text-gray-500 max-w-xl mx-auto">
                    Simple, flexible pricing. Pay for the AI power you need.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto items-start">
                <PlanCard
                    tier="Free"
                    price="Free"
                    credits="5"
                    color="bg-gray-400"
                    features={["5 AI Credits (One time)", "Access to basic recipes", "Manual Meal Planner", "Shopping List"]}
                    buttonText="Active"
                    isCurrent={userProfile.subscriptionTier === 'free'}
                />

                <PlanCard
                    tier="Starter"
                    price="$5"
                    credits="50"
                    color="bg-blue-500"
                    features={["50 Credits / month", "Sous Chef Chat", "AI Recipe Generation", "Pantry Suggestions"]}
                    buttonText="Upgrade to Starter"
                    isCurrent={userProfile.subscriptionTier === 'starter'}
                    onSelect={() => handleUpgrade('starter')}
                    popular
                />

                <PlanCard
                    tier="Pro"
                    price="$10"
                    credits="Unlimited"
                    color="bg-gradient-to-br from-yellow-400 to-orange-500"
                    features={["Unlimited Credits", "Priority AI Processing", "Advanced Meal Architect", "All Future AI Features"]}
                    buttonText="Go Unlimited"
                    isCurrent={userProfile.subscriptionTier === 'pro'}
                    onSelect={() => handleUpgrade('pro')}
                />
            </div>

            <div className="mt-12 text-center bg-blue-50 p-6 rounded-2xl max-w-2xl mx-auto">
                <h4 className="font-bold text-gray-800 mb-2">How do credits work?</h4>
                <div className="flex justify-center gap-8 text-sm text-gray-600">
                    <div className="flex flex-col items-center">
                        <i className="fas fa-scroll text-blue-400 mb-1"></i>
                        <span>Recipe Gen: 1 Credit</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <i className="fas fa-calendar-alt text-blue-400 mb-1"></i>
                        <span>Meal Plan: 3 Credits</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <i className="fas fa-comment text-blue-400 mb-1"></i>
                        <span>Chat: 1 Credit</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Subscription;
