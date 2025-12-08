
import React, { useState } from 'react';
import type { HouseholdMember, GroceryStore } from '../types';
import { useUser } from '../context/UserContext';
import { manageSubscription } from '../services/stripeService';
import { Link } from 'react-router-dom';

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
    const { userProfile, updateProfile } = useUser();

    // Helper adapter for setUserProfile to match old signature if needed
    // But we will refactor to use updateProfile directly where possible
    const setUserProfile = (action: React.SetStateAction<typeof userProfile>) => {
        if (typeof action === 'function') {
            updateProfile(action(userProfile));
        } else {
            updateProfile(action);
        }
    };

    // Household State
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberDiet, setNewMemberDiet] = useState('');

    // Grocery Store State
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreUrl, setNewStoreUrl] = useState('');

    // Personal Details & Goals & Prefs State
    const [name, setName] = useState(userProfile.name);
    const [avatar, setAvatar] = useState(userProfile.avatar || '👨‍🍳');
    const [calorieGoal, setCalorieGoal] = useState(userProfile.dailyCalorieGoal);
    const [kitchenName, setKitchenName] = useState(userProfile.kitchenName || '');
    const [enableConfetti, setEnableConfetti] = useState(userProfile.preferences?.enableConfetti ?? true);
    const [confettiIntensity, setConfettiIntensity] = useState<'low' | 'medium' | 'high'>(userProfile.preferences?.confettiIntensity || 'medium');
    const [themeColor, setThemeColor] = useState(userProfile.preferences?.themeColor || 'blue');
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

        setUserProfile(prev => ({
            ...prev,
            householdMembers: [...prev.householdMembers, newMember]
        }));
        setNewMemberName('');
        setNewMemberDiet('');
    };

    const handleRemoveMember = (id: number) => {
        setUserProfile(prev => ({
            ...prev,
            householdMembers: prev.householdMembers.filter(m => m.id !== id)
        }));
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

        setUserProfile(prev => ({
            ...prev,
            groceryStores: [...prev.groceryStores, newStore]
        }));
        setNewStoreName('');
        setNewStoreUrl('');
    };

    const handleRemoveStore = (id: number) => {
        setUserProfile(prev => ({
            ...prev,
            groceryStores: prev.groceryStores.filter(s => s.id !== id)
        }));
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
        setUserProfile(prev => ({
            ...prev,
            name: name,
            avatar: avatar,
            dailyCalorieGoal: calorieGoal,
            kitchenName: kitchenName,
            preferences: {
                enableConfetti,
                confettiIntensity,
                themeColor,
                showSousChef,
                hiddenNavItems,
                stripeConfig: prev.preferences?.stripeConfig // Preserve existing config if any, but don't modify from UI
            }
        }));
        setTimeout(() => setIsSavingGoals(false), 1000);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-800">
                    Profile & Settings
                </h1>
            </div>

            {/* Subscription Section */}
            <div className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${userProfile.subscriptionTier === 'pro' ? 'border-yellow-400' : 'border-gray-300'}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold mb-1 flex items-center">
                            <i className="fas fa-crown text-yellow-500 mr-2"></i> Subscription Status
                        </h2>
                        <div className="flex items-center mt-2">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider ${userProfile.subscriptionTier === 'pro' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                                {userProfile.subscriptionTier === 'pro' ? 'Executive Chef (Pro)' : 'Line Cook (Free)'}
                            </span>
                        </div>
                    </div>
                    <div>
                        {userProfile.subscriptionTier === 'pro' ? (
                            <button
                                onClick={manageSubscription}
                                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
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
            <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-id-card text-blue-500 mr-2"></i> Who are you?
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Avatar</label>
                        <div className="flex gap-2 flex-wrap">
                            {AVATARS.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => setAvatar(emoji)}
                                    className={`text-2xl w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${avatar === emoji ? 'bg-blue-100 ring-2 ring-blue-500 shadow-md' : 'bg-gray-100'}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Customization Section */}
            <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-purple-500">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-paint-brush text-purple-500 mr-2"></i> App Personalization
                </h2>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Kitchen Name</label>
                        <p className="text-xs text-gray-500 mb-2">Customize the greeting on your Dashboard.</p>
                        <input
                            type="text"
                            value={kitchenName}
                            onChange={(e) => setKitchenName(e.target.value)}
                            placeholder={`${userProfile.name}'s Kitchen`}
                            className="w-full form-input p-2 border border-gray-300 rounded-md bg-white text-gray-900"
                        />
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-3">App Theme Color</label>
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
                        <label className="block text-sm font-medium text-gray-700 mb-3">Experience Settings</label>
                        <div className="space-y-4">
                            {/* Confetti Toggle */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center">
                                        <button
                                            onClick={() => setEnableConfetti(!enableConfetti)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableConfetti ? 'bg-purple-600' : 'bg-gray-200'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableConfetti ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="ml-3 text-sm text-gray-700">Enable Celebration Confetti</span>
                                    </div>

                                    {enableConfetti && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Intensity:</span>
                                            <div className="flex bg-gray-100 rounded-lg p-1">
                                                {(['low', 'medium', 'high'] as const).map((level) => (
                                                    <button
                                                        key={level}
                                                        onClick={() => setConfettiIntensity(level)}
                                                        className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${confettiIntensity === level ? 'bg-white shadow-sm text-purple-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
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
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showSousChef ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="ml-3 text-sm text-gray-700">Show Sous Chef AI</span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-3">Sidebar Visibility</label>
                        <p className="text-xs text-gray-500 mb-4">Hide features you don't use (like Meal Prep or AI Architect) to declutter your workspace.</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {TOGGLEABLE_NAV_ITEMS.map((item) => {
                                const isVisible = !hiddenNavItems.includes(item.path);
                                return (
                                    <div
                                        key={item.path}
                                        onClick={() => toggleNavItem(item.path)}
                                        className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${isVisible ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white opacity-60 grayscale'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 transition-colors ${isVisible ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                            <i className={`fas ${item.icon}`}></i>
                                        </div>
                                        <span className={`font-medium text-sm ${isVisible ? 'text-gray-800' : 'text-gray-500'}`}>{item.name}</span>
                                        <div className="ml-auto">
                                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isVisible ? 'bg-blue-500' : 'bg-gray-300'}`}>
                                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isVisible ? 'translate-x-4' : 'translate-x-0'}`}></div>
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
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-users text-blue-500 mr-2"></i> Household Management
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-3">
                        {userProfile.householdMembers.length > 0 ? (
                            userProfile.householdMembers.map(member => (
                                <div key={member.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md border border-gray-200">
                                    <div>
                                        <p className="font-semibold text-gray-800">{member.name}</p>
                                        {member.dietaryRestrictions && (
                                            <p className="text-xs text-gray-500">{member.dietaryRestrictions}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleRemoveMember(member.id)}
                                        className="text-red-500 hover:text-red-700"
                                        title="Remove Member"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-500 italic">No household members added yet.</p>
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
                                    className="w-full text-sm form-input p-2 border border-blue-200 rounded bg-white text-gray-900"
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
                                    className="w-full text-sm form-input p-2 border border-blue-200 rounded bg-white text-gray-900"
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
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-shopping-cart text-green-500 mr-2"></i> Grocery Stores
                </h2>
                <p className="text-sm text-gray-600 mb-4">Add links to your favorite online grocery stores. These will appear on your Shopping List page.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-3">
                        {userProfile.groceryStores.length > 0 ? (
                            userProfile.groceryStores.map(store => (
                                <div key={store.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md border border-gray-200">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 mr-3">
                                            <i className="fas fa-store"></i>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800">{store.name}</p>
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
                            <p className="text-gray-500 italic">No grocery stores added yet.</p>
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
                                    className="w-full text-sm form-input p-2 border border-green-200 rounded bg-white text-gray-900"
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
                                    className="w-full text-sm form-input p-2 border border-green-200 rounded bg-white text-gray-900"
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

            {/* Goals & Calorie Settings */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 flex items-center">
                    <i className="fas fa-bullseye text-red-500 mr-2"></i> Goals & Settings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Daily Calorie Goal</label>
                        <p className="text-xs text-gray-500 mb-2">This target helps the AI Architect build balanced meal plans.</p>
                        <div className="flex items-center">
                            <input
                                type="number"
                                value={calorieGoal}
                                onChange={e => setCalorieGoal(parseInt(e.target.value) || 0)}
                                className="w-32 form-input p-2 border border-gray-300 rounded-l-md bg-white text-gray-900"
                                step="50"
                            />
                            <span className="bg-gray-100 border border-l-0 border-gray-300 text-gray-600 px-3 py-2 rounded-r-md text-sm">kcal / day</span>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={handleSaveSettings}
                            className={`px-6 py-2 rounded-md font-semibold text-white transition-all shadow-md active:scale-95 ${isSavingGoals ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {isSavingGoals ? <><i className="fas fa-check mr-2"></i>Saved</> : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
