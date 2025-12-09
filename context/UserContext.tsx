import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { UserProfile, UserPreferences } from '../types';
import { MOCK_PROFILE } from '../mockData';
import { authFetch } from '../utils/api';

interface UserContextType {
    userProfile: UserProfile;
    updateProfile: (updates: Partial<UserProfile>) => void;
    updatePreferences: (updates: Partial<UserPreferences>) => void;
    consumeCredits: (cost: number) => boolean;
    setRetroMode: React.Dispatch<React.SetStateAction<boolean>>;
    retroMode: boolean;
    login: () => Promise<void>;
    register: () => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    getAccessToken: () => Promise<string>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        loginWithRedirect,
        logout: auth0Logout,
        user,
        isAuthenticated,
        isLoading: auth0Loading,
        getAccessTokenSilently,
        error
    } = useAuth0();

    useEffect(() => {
        if (error) {
            console.error("Auth0 Error:", error);
        }
    }, [error]);

    const [userProfile, setUserProfile] = useState<UserProfile>(MOCK_PROFILE);
    const [retroMode, setRetroMode] = useState(false);
    const [loading, setLoading] = useState(true);

    // Fetch backend profile (credits, tier)
    const refreshProfile = async () => {
        if (!isAuthenticated || !user) return;

        try {
            const token = await getAccessTokenSilently();
            // Pass token explicitly to authFetch
            const res = await authFetch('/api/auth/me', { token });

            if (res.ok) {
                const data = await res.json();

                // Merge Auth0 user data with Backend data
                const profile: UserProfile = {
                    name: user.name || user.nickname || 'Chef',
                    email: user.email || '',
                    avatar: user.picture || '👨‍🍳',
                    kitchenName: data.user.kitchenName,
                    dailyCalorieGoal: data.user.dailyCalorieGoal || 2000,
                    householdMembers: data.user.householdMembers || [],
                    groceryStores: data.user.groceryStores || [],
                    preferences: data.user.preferences || {},
                    subscriptionTier: data.user.subscription_tier || data.user.subscriptionTier || 'free',
                    credits: data.user.credits || 0,
                    hasUsedFreeImageGeneration: data.user.hasUsedFreeImageGeneration
                };
                setUserProfile(profile);
            }
        } catch (e) {
            console.error("Profile fetch failed", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!auth0Loading) {
            if (isAuthenticated) {
                refreshProfile();
            } else {
                setLoading(false);
            }
        }
    }, [isAuthenticated, auth0Loading]);

    const login = async () => {
        await loginWithRedirect();
    };

    const register = async () => {
        await loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } });
    };

    const logout = () => {
        auth0Logout({ logoutParams: { returnTo: window.location.origin } });
        setUserProfile(MOCK_PROFILE);
    };

    const updateProfile = (updates: Partial<UserProfile>) => {
        setUserProfile(prev => ({ ...prev, ...updates }));
    };

    const updatePreferences = (updates: Partial<UserPreferences>) => {
        setUserProfile(prev => ({
            ...prev,
            preferences: { ...prev.preferences!, ...updates }
        }));
    };

    const consumeCredits = (cost: number): boolean => {
        if (retroMode) return true;
        if (userProfile.subscriptionTier === 'pro') return true;

        if (userProfile.credits >= cost) {
            // Optimistic update
            setUserProfile(prev => ({ ...prev, credits: prev.credits - cost }));

            // Sync with backend
            getAccessTokenSilently().then(token => {
                authFetch('/api/credits/consume', {
                    method: 'POST',
                    body: JSON.stringify({ amount: cost }),
                    token
                }).catch(e => {
                    console.error("Credit sync failed", e);
                });
            });
            return true;
        }
        return false;
    };

    const getAccessToken = async () => {
        return await getAccessTokenSilently();
    };

    return (
        <UserContext.Provider value={{
            userProfile,
            updateProfile,
            updatePreferences,
            consumeCredits,
            retroMode,
            setRetroMode,
            login: login as any,
            register: register as any,
            logout,
            isAuthenticated,
            isLoading: loading || auth0Loading,
            getAccessToken
        }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within a UserProvider');
    return context;
};
