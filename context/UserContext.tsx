import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserPreferences } from '../types';
import { MOCK_PROFILE } from '../mockData';

interface UserContextType {
    userProfile: UserProfile;
    updateProfile: (updates: Partial<UserProfile>) => void;
    updatePreferences: (updates: Partial<UserPreferences>) => void;
    consumeCredits: (cost: number) => boolean;
    setRetroMode: React.Dispatch<React.SetStateAction<boolean>>;
    retroMode: boolean;
    login: (email: string, pass: string) => Promise<void>;
    register: (name: string, email: string, pass: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
}

import { authFetch } from '../utils/api';

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('ks_token'));
    const [userProfile, setUserProfile] = useState<UserProfile>(MOCK_PROFILE); // Fallback to mock for initial render if needed, but should be overwritten
    const [retroMode, setRetroMode] = useState(false);
    const [loading, setLoading] = useState(true);

    const refreshProfile = async () => {
        try {
            const res = await authFetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUserProfile(data.user);
            } else {
                // Token invalid
                logout();
            }
        } catch (e) {
            console.error("Profile fetch failed", e);
        } finally {
            setLoading(false);
        }
    };

    // Initialize
    useEffect(() => {
        if (token) {
            refreshProfile();
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (email: string, pass: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Login failed');
        }

        const data = await res.json();
        localStorage.setItem('ks_token', data.token);
        setToken(data.token);
        setUserProfile(data.user);
    };

    const register = async (name: string, email: string, pass: string) => {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, email, password: pass })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Registration failed');
        }

        const data = await res.json();
        localStorage.setItem('ks_token', data.token);
        setToken(data.token);
        setUserProfile(data.user);
    };

    const logout = () => {
        localStorage.removeItem('ks_token');
        setToken(null);
        setUserProfile(MOCK_PROFILE); // Reset to something safe or empty
        window.location.href = '/login'; // Force redirect
    };

    const updateProfile = (updates: Partial<UserProfile>) => {
        setUserProfile(prev => ({ ...prev, ...updates }));
        // TODO: Sync to backend here using authFetch PUT /api/user/profile
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
            authFetch('/api/credits/consume', {
                method: 'POST',
                body: JSON.stringify({ amount: cost })
            }).catch(e => {
                console.error("Credit sync failed", e);
                // Revert?
            });
            return true;
        }
        return false;
    };

    return (
        <UserContext.Provider value={{
            userProfile,
            updateProfile,
            updatePreferences,
            consumeCredits,
            retroMode,
            setRetroMode,
            login,
            register,
            logout,
            isAuthenticated: !!token
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
