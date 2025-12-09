
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { Recipe, PantryItem } from '../types';
import { useKitchen } from '../context/KitchenContext';
import { useUser } from '../context/UserContext';
import { chatWithSousChef, ChatMessage } from '../services/geminiService';
import Spinner from './Spinner';

interface SousChefProps {
    onDisable: () => void;
}

const SousChef: React.FC<SousChefProps> = ({ onDisable }) => {
    const { recipes, pantry } = useKitchen();
    const { consumeCredits, getAccessToken } = useUser();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const location = useLocation();

    // Determine Context
    const getContext = () => {
        const path = location.pathname;

        if (path.includes('/recipes/')) {
            const id = path.split('/recipes/')[1];
            if (id && !id.includes('new')) {
                const recipe = recipes.find(r => r.id === Number(id));
                if (recipe) {
                    return `User is viewing recipe: ${recipe.name}. Ingredients: ${recipe.ingredients.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ')}. Instructions: ${recipe.instructions}. Pantry contains: ${pantry.map(p => p.name).join(', ')}.`;
                }
            }
        }

        if (path.includes('/pantry')) {
            return `User is viewing their pantry. Items available: ${pantry.map(p => `${p.quantity} ${p.unit} ${p.name}`).join(', ')}.`;
        }

        if (path.includes('/planner')) {
            return `User is meal planning. Recipes available to choose from: ${recipes.map(r => r.name).join(', ')}.`;
        }

        return `User is on the main dashboard. Pantry summary: ${pantry.length} items. Total recipes: ${recipes.length}.`;
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    useEffect(() => {
        if (messages.length === 0 && isOpen) {
            setMessages([{ role: 'model', text: "Bonjour! I'm your AI Sous Chef. How can I help you in the kitchen today?" }]);
        }
    }, [isOpen]);

    // Handle One-time Tooltip
    useEffect(() => {
        const hasSeen = localStorage.getItem('ks_sous_chef_seen');
        if (!hasSeen) {
            setShowTooltip(true);
            const timer = setTimeout(() => {
                setShowTooltip(false);
                localStorage.setItem('ks_sous_chef_seen', 'true');
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, []);

    const dismissTooltip = () => {
        setShowTooltip(false);
        localStorage.setItem('ks_sous_chef_seen', 'true');
    };

    const handleSend = async (textOverride?: string) => {
        const text = textOverride || input;
        if (!text.trim()) return;

        // Check credits (1 credit per message)
        if (!consumeCredits(1, true)) return;

        const newMessages: ChatMessage[] = [...messages, { role: 'user', text }];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        const context = getContext();
        const token = await getAccessToken();
        const response = await chatWithSousChef(newMessages, context, token);

        if (response) {
            setMessages(prev => [...prev, { role: 'model', text: response }]);
        }
        setIsLoading(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Quick prompts based on context
    const getSuggestions = () => {
        const path = location.pathname;
        if (path.includes('/recipes/')) return ["Wine pairing?", "Make it vegan?", "Halve this recipe", "Cooking tips"];
        if (path.includes('/pantry')) return ["What can I cook?", "Storage tips", "What am I missing?"];
        return ["Quick dinner idea", "Healthy snack", "Baking substitute"];
    };

    return (
        <>
            {/* Toggle Button */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
                {showTooltip && !isOpen && (
                    <div className="mb-3 mr-1 w-40 bg-white p-3 rounded-xl shadow-lg border border-gray-100 animate-slide-up text-center relative after:content-[''] after:absolute after:top-full after:right-4 after:border-8 after:border-transparent after:border-t-white">
                        <p className="text-xs text-gray-600 font-medium">I'm here if you need me!</p>
                        <button onClick={dismissTooltip} className="absolute -top-2 -right-2 bg-gray-200 rounded-full w-5 h-5 text-[10px] hover:bg-gray-300 text-gray-600">&times;</button>
                    </div>
                )}

                <button
                    onClick={() => { setIsOpen(!isOpen); dismissTooltip(); }}
                    className={`w-11 h-11 rounded-full shadow-md flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-white/80 ${isOpen ? 'bg-gray-700 rotate-90' : 'bg-blue-600 hover:bg-blue-700'}`}
                    title={isOpen ? "Close Assistant" : "Open Sous Chef"}
                >
                    {isOpen ? <i className="fas fa-times text-white text-sm"></i> : <i className="fas fa-robot text-white text-lg"></i>}
                </button>
            </div>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-20 right-4 md:right-8 w-[calc(100vw-32px)] md:w-96 h-[500px] max-h-[70vh] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden border border-gray-100 animate-slide-up">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 flex justify-between items-center text-white shadow-md">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                <i className="fas fa-hat-wizard text-sm"></i>
                            </div>
                            <div>
                                <h3 className="font-bold text-sm leading-tight">Sous Chef</h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                                    <span className="text-[10px] text-blue-100 font-medium opacity-90">Online • 1 Credit/Msg</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => { setIsOpen(false); onDisable(); }}
                            className="text-xs bg-black/20 hover:bg-black/30 px-3 py-1.5 rounded-full transition-colors text-white flex items-center gap-1 border border-white/10"
                            title="Hide Sous Chef permanently (can re-enable in Profile)"
                        >
                            <i className="fas fa-eye-slash"></i> Hide
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                                    }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Suggestions */}
                    {messages.length < 4 && (
                        <div className="px-4 py-2 bg-gray-50 flex gap-2 overflow-x-auto no-scrollbar border-t border-gray-100">
                            {getSuggestions().map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleSend(s)}
                                    className="whitespace-nowrap px-3 py-1 bg-white border border-blue-100 text-blue-600 text-[10px] font-bold rounded-full hover:bg-blue-50 transition-colors shadow-sm"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="p-3 bg-white border-t border-gray-100">
                        <div className="relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about this page..."
                                className="w-full pr-10 pl-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-gray-400"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                            >
                                <i className="fas fa-paper-plane text-[10px]"></i>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SousChef;
