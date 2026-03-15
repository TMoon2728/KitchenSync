
import React, { useState } from 'react';
import type { HouseholdMember, GroceryStore } from '../types';
import { useUser } from '../context/UserContext';
import { manageSubscription } from '../services/stripeService';
import { Link } from 'react-router-dom';
import { authFetch } from '../utils/api';

const AVATARS = [
    '👨‍🍳', '👩‍🍳',
    '👨🏿‍🍳', '👩🏿‍🍳',
    '👨🏾‍🍳', '👩🏾‍🍳',
    '👨🏽‍🍳', '👩🏽‍🍳',
    '👨🏼‍🍳', '👩🏼‍🍳',
    '👨🏻‍🍳', '👩🏻‍🍳',
    '🧙‍♂️', '🦸‍♀️',
    '🥗', '🥘', '🌮', '🧁', '🍕', '🥑'
];

const THEMES = ['blue', 'green', 'purple', 'slate', 'orange', 'rose'] as const;

// Items that can be toggled (excluding Dashboard and Profile which are mandatory)
const TOGGLEABLE_NAV_ITEMS = [
    { path: '/recipes', name: 'Recipes', icon: 'fa-book-open' },
    { path: '/planner', name: 'Planner', icon: 'fa-calendar-alt' },
    { path: '/meal-prep', name: 'Meal Prep', icon: 'fa-layer-group' },
    { path: '/ai-architect', name: 'AI Architect', icon: 'fa-magic' },
    { path: '/pantry', name: 'Pantry', icon: 'fa-box-open' },
    { path: '/shopping-list', name: 'Shopping List', icon: 'fa-cart-shopping' },
];

const Profile: React.FC = () => {
    const { userProfile, updateProfile, getAccessToken } = useUser();

    const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>(userProfile.householdMembers);
    const [groceryStores, setGroceryStores] = useState<GroceryStore[]>(userProfile.groceryStores);

    // Household State
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberDiet, setNewMemberDiet] = useState('');

    // Account Link State
    const [linkEmail, setLinkEmail] = useState('');
    const [isLinking, setIsLinking] = useState(false);
    const [linkMessage, setLinkMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    // Grocery Store State
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreUrl, setNewStoreUrl] = useState('');

    // Personal Details & Goals & Prefs State
    const [name, setName] = useState(userProfile.name);
    const [avatar, setAvatar] = useState(userProfile.avatar || '👨‍🍳');
    const [calorieGoal, setCalorieGoal] = useState(userProfile.dailyCalorieGoal);
    const [proteinGoal, setProteinGoal] = useState<number | ''>(userProfile.proteinGoal || '');
    const [carbGoal, setCarbGoal] = useState<number | ''>(userProfile.carbGoal || '');
    const [fatGoal, setFatGoal] = useState<number | ''>(userProfile.fatGoal || '');
    const [kitchenName, setKitchenName] = useState(userProfile.kitchenName || '');
    const [enableConfetti, setEnableConfetti] = useState(userProfile.preferences?.enableConfetti ?? true);
    const [confettiIntensity, setConfettiIntensity] = useState<'low' | 'medium' | 'high'>(userProfile.preferences?.confettiIntensity || 'medium');
    const [themeColor, setThemeColor] = useState(userProfile.preferences?.themeColor || 'blue');
    const [displayMode, setDisplayMode] = useState<'light' | 'dark' | 'landing'>(userProfile.preferences?.displayMode || 'light');
    const [showSousChef, setShowSousChef] = useState(userProfile.preferences?.showSousChef ?? true);
    const [hiddenNavItems, setHiddenNavItems] = useState<string[]>(userProfile.preferences?.hiddenNavItems || []);

    const [isSavingGoals, setIsSavingGoals] = useState(false);

    // Handlers for Household
    const handleAddMember = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMemberName.trim()) return;

        const newMember: HouseholdMember = {
            id: Date.now(),
            name: newMemberName,
            dietaryRestrictions: newMemberDiet,
        };

        setHouseholdMembers(prev => [...prev, newMember]);
        setNewMemberName('');
        setNewMemberDiet('');
    };

    const handleRemoveMember = (id: number) => {
        setHouseholdMembers(prev => prev.filter(m => m.id !== id));
    };

    const handleLinkAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setLinkMessage(null);
        if (!linkEmail.trim()) return;

        setIsLinking(true);
        try {
            const token = await getAccessToken();
            const res = await authFetch('/api/auth/link', {
                method: 'POST',
                body: JSON.stringify({ targetEmail: linkEmail.trim() }),
                token
            });
            const data = await res.json();
            if (res.ok) {
                setLinkMessage({ type: 'success', text: data.message || "Account linked!" });
                setLinkEmail('');
                // Reload to fetch merged household data
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setLinkMessage({ type: 'error', text: data.error || "Failed to link account" });
            }
        } catch (error) {
            setLinkMessage({ type: 'error', text: "A network error occurred." });
        } finally {
            setIsLinking(false);
        }
    };

    // Handlers for Grocery Stores
    const handleAddStore = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStoreName.trim() || !newStoreUrl.trim()) return;

        // Basic URL validation
        let url = newStoreUrl;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const newStore: GroceryStore = {
            id: Date.now(),
            name: newStoreName,
            url: url
        };

        setGroceryStores(prev => [...prev, newStore]);
        setNewStoreName('');
        setNewStoreUrl('');
    };

    const handleRemoveStore = (id: number) => {
        setGroceryStores(prev => prev.filter(s => s.id !== id));
    };

    // Handler for Nav Toggles
    const toggleNavItem = (path: string) => {
        setHiddenNavItems(prev => {
            if (prev.includes(path)) {
                return prev.filter(p => p !== path); // Unhide (Show)
            } else {
                return [...prev, path]; // Hide
            }
        });
    };

    // Handlers for Goals & Preferences
    const handleSaveSettings = () => {
        setIsSavingGoals(true);
        updateProfile({
            name: name,
            avatar: avatar,
            dailyCalorieGoal: calorieGoal,
            proteinGoal: proteinGoal === '' ? undefined : proteinGoal,
            carbGoal: carbGoal === '' ? undefined : carbGoal,
            fatGoal: fatGoal === '' ? undefined : fatGoal,
            kitchenName,
            preferences: {
                enableConfetti,
                confettiIntensity,
                themeColor,
                displayMode,
                showSousChef,
                hiddenNavItems,
                stripeConfig: userProfile.preferences?.stripeConfig
            },
            householdMembers,
            groceryStores
        });
        setTimeout(() => setIsSavingGoals(false), 1000);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                    Profile & Settings
                </h1>
            </div>

            {/* Subscription Section */}
            <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border-l-4 ${userProfile.subscriptionTier === 'pro' ? 'border-yellow-400' : 'border-gray-300 dark:border-gray-600'}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold mb-1 flex items-center">
                            <i className="fas fa-crown text-yellow-500 mr-2"></i> Subscription Status
                        </h2>
                        <div className="flex items-center mt-2">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider ${userProfile.subscriptionTier === 'pro' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                {userProfile.subscriptionTier === 'pro' ? 'Executive Chef (Pro)' : 'Line Cook (Free)'}
                            </span>
                        </div>
                    </div>
                    <div>
                        {userProfile.subscriptionTier === 'pro' ? (
                            <button
                                onClick={manageSubscription}
                                className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                            >
                                <i className="fas fa-cog mr-2"></i> Manage Billing
                            </button>
                        ) : (
                            <Link
                                to="/subscription"
                                className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:scale-105 transition-transform"
                            >
                                Upgrade Now
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Personal Details */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-id-card text-blue-500 mr-2"></i> Who are you?
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Your Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Avatar</label>
                        <div className="flex gap-2 flex-wrap">
                            {AVATARS.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => setAvatar(emoji)}
                                    className={`text-2xl w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${avatar === emoji ? 'bg-blue-100 ring-2 ring-blue-500 shadow-md' : 'bg-gray-100 dark:bg-gray-700'}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Customization Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border-l-4 border-purple-500">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-paint-brush text-purple-500 mr-2"></i> App Personalization
                </h2>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Kitchen Name</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Customize the greeting on your Dashboard.</p>
                        <input
                            type="text"
                            value={kitchenName}
                            onChange={(e) => setKitchenName(e.target.value)}
                            placeholder={`${userProfile.name}'s Kitchen`}
                            className="w-full form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900"
                        />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">App Theme Color</label>
                        <div className="flex gap-4 flex-wrap">
                            {THEMES.map(color => {
                                const bgClasses = {
                                    blue: 'bg-blue-600',
                                    green: 'bg-green-600',
                                    purple: 'bg-purple-600',
                                    slate: 'bg-slate-600',
                                    orange: 'bg-orange-600',
                                    rose: 'bg-rose-600',
                                };
                                return (
                                    <button
                                        key={color}
                                        onClick={() => setThemeColor(color)}
                                        className={`w-10 h-10 rounded-full ${bgClasses[color]} transition-all shadow-md flex items-center justify-center ${themeColor === color ? 'ring-4 ring-offset-2 ring-gray-300 scale-110' : 'hover:scale-110'}`}
                                        title={color.charAt(0).toUpperCase() + color.slice(1)}
                                    >
                                        {themeColor === color && <i className="fas fa-check text-white text-xs"></i>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Display Mode</label>
                        <div className="flex flex-col sm:flex-row gap-4">
                            {(['light', 'dark', 'landing'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setDisplayMode(mode)}
                                    className={`flex-1 p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${displayMode === mode ? 'border-blue-500 bg-blue-50' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                                >
                                    {mode === 'light' && <i className="fas fa-sun text-yellow-500 text-xl"></i>}
                                    {mode === 'dark' && <i className="fas fa-moon text-indigo-400 text-xl"></i>}
                                    {mode === 'landing' && <i className="fas fa-sparkles text-purple-400 text-xl"></i>}
                                    <span className="font-semibold capitalize text-sm">{mode === 'landing' ? 'Glassmorphism' : mode}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Experience Settings</label>
                        <div className="space-y-4">
                            {/* Confetti Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center">
                                        <button
                                            onClick={() => setEnableConfetti(!enableConfetti)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableConfetti ? 'bg-purple-600' : 'bg-gray-200'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${enableConfetti ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="ml-3 text-sm text-gray-700 dark:text-gray-200">Enable Celebration Confetti</span>
                                    </div>

                                    {enableConfetti && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Intensity:</span>
                                            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                                {(['low', 'medium', 'high'] as const).map((level) => (
                                                    <button
                                                        key={level}
                                                        onClick={() => setConfettiIntensity(level)}
                                                        className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${confettiIntensity === level ? 'bg-white dark:bg-gray-800 shadow-sm text-purple-700 font-semibold' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200'}`}
                                                    >
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Sous Chef Toggle */}
                            <div className="flex items-center">
                                <button
                                    onClick={() => setShowSousChef(!showSousChef)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showSousChef ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${showSousChef ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="ml-3 text-sm text-gray-700 dark:text-gray-200">Show Sous Chef AI</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Sidebar Visibility</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Hide features you don't use (like Meal Prep or AI Architect) to declutter your workspace.</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {TOGGLEABLE_NAV_ITEMS.map((item) => {
                                const isVisible = !hiddenNavItems.includes(item.path);
                                return (
                                    <div
                                        key={item.path}
                                        onClick={() => toggleNavItem(item.path)}
                                        className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${isVisible ? 'border-blue-500 bg-blue-50' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-60 grayscale'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 transition-colors ${isVisible ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                            <i className={`fas ${item.icon}`}></i>
                                        </div>
                                        <span className={`font-medium text-sm ${isVisible ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{item.name}</span>
                                        <div className="ml-auto">
                                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isVisible ? 'bg-blue-500' : 'bg-gray-300'}`}>
                                                <div className={`w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow-sm transition-transform ${isVisible ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Household Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-users text-blue-500 mr-2"></i> Household Management
                </h2>

                {/* Account Linking */}
                <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-purple-800 flex items-center"><i className="fas fa-link mr-2"></i>Link Accounts</h3>
                        <p className="text-sm text-purple-600">Connect with a spouse or roommate to share your Recipes and Pantry automatically.</p>
                    </div>
                    <form onSubmit={handleLinkAccount} className="flex w-full md:w-auto gap-2">
                        <input 
                            type="email" 
                            placeholder="Partner's Email" 
                            className="form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm p-2 border border-purple-200 rounded flex-grow md:w-48 focus:ring-purple-500 bg-white dark:bg-gray-800" 
                            value={linkEmail}
                            onChange={e => setLinkEmail(e.target.value)}
                            required
                        />
                        <button type="submit" disabled={isLinking} className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-bold shadow hover:bg-purple-700 transition disabled:opacity-50 whitespace-nowrap">
                            {isLinking ? <i className="fas fa-spinner fa-spin"></i> : 'Connect'}
                        </button>
                    </form>
                </div>
                {linkMessage && (
                    <div className={`mb-6 p-3 rounded text-sm font-semibold flex items-center ${linkMessage.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                        <i className={`fas ${linkMessage.type === 'success' ? 'fa-check-circle text-green-600' : 'fa-exclamation-circle text-red-600'} mr-2`}></i>
                        {linkMessage.text} {linkMessage.type === 'success' && " Refreshing..."}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-3">
                        {householdMembers.length > 0 ? (
                            householdMembers.map(member => {
                                const isLinked = (typeof member.id === 'string' && member.id.startsWith('linked-')) || !!(member as any)._sourceUserId;
                                return (
                                <div key={member.id} className={`flex justify-between items-center p-3 rounded-md border ${isLinked ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700'}`}>
                                    <div>
                                        <p className={`font-semibold ${isLinked ? 'text-purple-800' : 'text-gray-800 dark:text-gray-100'}`}>
                                            {member.name} 
                                            {isLinked && <span className="ml-2 text-[10px] bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Linked</span>}
                                        </p>
                                        {member.dietaryRestrictions && (
                                            <p className={`text-xs ${isLinked ? 'text-purple-600' : 'text-gray-500 dark:text-gray-400'}`}>{member.dietaryRestrictions}</p>
                                        )}
                                    </div>
                                    {!isLinked && (
                                        <button
                                            onClick={() => handleRemoveMember(member.id as number)}
                                            className="text-red-500 hover:text-red-700"
                                            title="Remove Member"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    )}
                                </div>
                                );
                            })
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400 italic">No household members added yet.</p>
                        )}
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 h-fit">
                        <h3 className="font-semibold mb-2 text-blue-800">Add Member</h3>
                        <form onSubmit={handleAddMember} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-blue-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={newMemberName}
                                    onChange={e => setNewMemberName(e.target.value)}
                                    className="w-full text-sm form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-blue-200 rounded bg-white dark:bg-gray-800 text-gray-900"
                                    placeholder="e.g. John"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-blue-700 mb-1">Dietary Restrictions</label>
                                <input
                                    type="text"
                                    value={newMemberDiet}
                                    onChange={e => setNewMemberDiet(e.target.value)}
                                    className="w-full text-sm form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-blue-200 rounded bg-white dark:bg-gray-800 text-gray-900"
                                    placeholder="e.g. Vegetarian"
                                />
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-semibold text-sm hover:bg-blue-700 transition-colors">
                                Add
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Grocery Links Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-shopping-cart text-green-500 mr-2"></i> Grocery Stores
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Add links to your favorite online grocery stores. These will appear on your Shopping List page.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-3">
                        {groceryStores.length > 0 ? (
                            groceryStores.map(store => (
                                <div key={store.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 mr-3">
                                            <i className="fas fa-store"></i>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 dark:text-gray-100">{store.name}</p>
                                            <a href={store.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate max-w-[200px] block">
                                                {store.url}
                                            </a>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveStore(store.id)}
                                        className="text-red-500 hover:text-red-700"
                                        title="Remove Store"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400 italic">No grocery stores added yet.</p>
                        )}
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg border border-green-100 h-fit">
                        <h3 className="font-semibold mb-2 text-green-800">Add Store Link</h3>
                        <form onSubmit={handleAddStore} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-green-700 mb-1">Store Name</label>
                                <input
                                    type="text"
                                    value={newStoreName}
                                    onChange={e => setNewStoreName(e.target.value)}
                                    className="w-full text-sm form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-green-200 rounded bg-white dark:bg-gray-800 text-gray-900"
                                    placeholder="e.g. Walmart"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-green-700 mb-1">Website URL</label>
                                <input
                                    type="url"
                                    value={newStoreUrl}
                                    onChange={e => setNewStoreUrl(e.target.value)}
                                    className="w-full text-sm form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-green-200 rounded bg-white dark:bg-gray-800 text-gray-900"
                                    placeholder="https://..."
                                    required
                                />
                            </div>
                            <button type="submit" className="w-full bg-green-600 text-white py-2 rounded font-semibold text-sm hover:bg-green-700 transition-colors">
                                Add Link
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Nutritional Goals */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-bullseye text-red-500 mr-2"></i> Nutritional Goals
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Calories</label>
                        <div className="flex items-center">
                            <input
                                type="number"
                                value={calorieGoal}
                                onChange={e => setCalorieGoal(parseInt(e.target.value) || 0)}
                                className="w-24 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-white dark:bg-gray-800 text-gray-900 focus:ring-red-500"
                                step="50"
                            />
                            <span className="bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-r-md text-sm">kcal</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Protein</label>
                        <div className="flex items-center">
                            <input
                                type="number"
                                value={proteinGoal}
                                onChange={e => setProteinGoal(e.target.value ? parseInt(e.target.value) : '')}
                                className="w-20 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-white dark:bg-gray-800 text-gray-900 focus:ring-blue-500"
                                placeholder="Auto"
                            />
                            <span className="bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-r-md text-sm">g</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Carbs</label>
                        <div className="flex items-center">
                            <input
                                type="number"
                                value={carbGoal}
                                onChange={e => setCarbGoal(e.target.value ? parseInt(e.target.value) : '')}
                                className="w-20 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-white dark:bg-gray-800 text-gray-900 focus:ring-green-500"
                                placeholder="Auto"
                            />
                            <span className="bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-r-md text-sm">g</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Fat</label>
                        <div className="flex items-center">
                            <input
                                type="number"
                                value={fatGoal}
                                onChange={e => setFatGoal(e.target.value ? parseInt(e.target.value) : '')}
                                className="w-20 form-input dark:bg-gray-700 dark:text-white dark:border-gray-600 p-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-white dark:bg-gray-800 text-gray-900 focus:ring-yellow-500"
                                placeholder="Auto"
                            />
                            <span className="bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-r-md text-sm">g</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Global Save Button */}
            <div className="sticky bottom-4 z-40 bg-white dark:bg-gray-800/90 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex justify-between items-center transition-all">
                <div className="hidden sm:block">
                    <p className="text-sm text-gray-600 dark:text-gray-300 font-medium"><i className="fas fa-info-circle mr-2 text-blue-500"></i>Save your changes here when you're done editing.</p>
                </div>
                <button
                    onClick={handleSaveSettings}
                    className={`w-full sm:w-auto px-10 py-3 rounded-lg font-bold text-lg text-white transition-all shadow-md active:scale-95 flex items-center justify-center ${isSavingGoals ? 'bg-green-500' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl'}`}
                >
                    {isSavingGoals ? <><i className="fas fa-check mr-2"></i>Profile Saved</> : <><i className="fas fa-save mr-2"></i>Save All Changes</>}
                </button>
            </div>
        </div>
    );
};

export default Profile;
