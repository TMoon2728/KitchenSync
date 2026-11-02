import React, { useState, useEffect, useMemo } from 'react';
import { formatShoppingItemLine } from '../utils/ingredientNormalizer';
import { buildStoreSearchUrl } from '../utils/calendarExport';

interface GroceryExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    shoppingList: { name: string; quantity: number; unit: string; category?: string }[];
    favoriteStoreUrl?: string;
    favoriteStoreName?: string;
}

const GroceryExportModal: React.FC<GroceryExportModalProps> = ({
    isOpen,
    onClose,
    shoppingList,
    favoriteStoreUrl = "https://instacart.com",
    favoriteStoreName = "Instacart"
}) => {
    const [step, setStep] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isCopied, setIsCopied] = useState(false);
    const [exportFormat, setExportFormat] = useState<'flat' | 'aisle' | 'links'>('flat');
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    const handleNativeShare = async () => {
        if (!canNativeShare || !formattedText) return;
        try {
            await navigator.share({
                title: `KitchenSync Shopping List (${shoppingList.length} items)`,
                text: formattedText
            });
        } catch {
            // User cancelled share sheet
        }
    };

    const formattedText = useMemo(() => {
        if (!shoppingList || shoppingList.length === 0) return '';

        if (exportFormat === 'flat') {
            return shoppingList
                .map(item => formatShoppingItemLine(item))
                .join('\n');
        }

        // Grouped by Grocery Aisle
        const grouped: Record<string, string[]> = {};
        for (const item of shoppingList) {
            const cat = item.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(`- [ ] ${formatShoppingItemLine(item)}`);
        }

        return Object.entries(grouped)
            .map(([cat, lines]) => `${cat.toUpperCase()}\n${lines.join('\n')}`)
            .join('\n\n');
    }, [shoppingList, exportFormat]);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setIsCopied(true);
        } catch (err) {
            console.error("Failed to copy list: ", err);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            setStep(0);
            setProgress(0);
            setIsCopied(false);
            return;
        }

        let cancelled = false;
        const sequence = async () => {
            setStep(1);
            setProgress(45);
            await new Promise(r => setTimeout(r, 180));
            if (cancelled) return;

            setStep(2);
            setProgress(90);
            await new Promise(r => setTimeout(r, 180));
            if (cancelled) return;

            setProgress(100);
            setStep(3);
            await copyToClipboard(formattedText);
        };

        sequence();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    // Re-copy automatically when user switches between Flat and Aisle format
    useEffect(() => {
        if (isOpen && step === 3 && formattedText) {
            copyToClipboard(formattedText);
        }
    }, [exportFormat, formattedText, isOpen, step]);

    if (!isOpen) return null;

    const itemsCount = shoppingList.length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={step === 3 ? onClose : undefined} />

            <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10 text-center space-y-5">
                    <div className="flex justify-center">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                            step === 3
                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 rotate-0'
                                : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse'
                        }`}>
                            {step === 3 ? (
                                <i className="fas fa-check-circle text-3xl" />
                            ) : step === 2 ? (
                                <i className="fas fa-list-ol text-3xl" />
                            ) : (
                                <i className="fas fa-sync fa-spin text-3xl" />
                            )}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                            {step === 1 && "Connecting..."}
                            {step === 2 && "Standardizing Measurements..."}
                            {step === 3 && "List Copied & Ready!"}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {step === 1 && `Preparing export for ${favoriteStoreName}`}
                            {step === 2 && `Consolidating ${itemsCount} items into clean grocery amounts`}
                            {step === 3 && `${itemsCount} consolidated items copied to your clipboard!`}
                        </p>
                    </div>

                    {step < 3 && (
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-200 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4 animate-fade-in text-left">
                            {/* Format Switcher + Copy Again Button */}
                            <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-100 dark:bg-gray-700/60 p-1.5 rounded-xl">
                                <div className="flex flex-wrap items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setExportFormat('flat')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                            exportFormat === 'flat'
                                                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                        }`}
                                    >
                                        Store Paste
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExportFormat('aisle')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                            exportFormat === 'aisle'
                                                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                        }`}
                                    >
                                        By Aisle
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExportFormat('links')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                            exportFormat === 'links'
                                                ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                                        }`}
                                    >
                                        <i className="fas fa-search-plus mr-1" />Store Links
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {canNativeShare && (
                                        <button
                                            type="button"
                                            onClick={handleNativeShare}
                                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition"
                                            title="Share via mobile share sheet"
                                        >
                                            <i className="fas fa-share-nodes" />
                                            <span>Share</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(formattedText)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition"
                                    >
                                        <i className={`fas ${isCopied ? 'fa-check' : 'fa-copy'}`} />
                                        <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Live Clipboard Preview OR Direct Store Search Deep-Links */}
                            {exportFormat === 'links' ? (
                                <div className="bg-gray-50 dark:bg-gray-900/70 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 max-h-52 overflow-y-auto space-y-1.5">
                                    <p className="text-[11px] font-bold text-gray-400 uppercase px-1 mb-1">
                                        Tap any item to search directly on {favoriteStoreName}:
                                    </p>
                                    {shoppingList.map((item, idx) => (
                                        <a
                                            key={idx}
                                            href={buildStoreSearchUrl(favoriteStoreName, favoriteStoreUrl, item.name)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-green-400 text-xs font-semibold text-gray-800 dark:text-gray-100 transition-colors group"
                                        >
                                            <span>{formatShoppingItemLine(item)}</span>
                                            <span className="text-green-600 dark:text-green-400 font-bold text-[11px] flex items-center gap-1">
                                                Find <i className="fas fa-external-link-alt text-[10px] group-hover:translate-x-0.5 transition-transform" />
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-gray-50 dark:bg-gray-900/70 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 max-h-52 overflow-y-auto font-mono text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed select-all">
                                    {formattedText}
                                </div>
                            )}

                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Done
                                </button>
                                <a
                                    href={favoriteStoreUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={onClose}
                                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold bg-green-600 text-white hover:bg-green-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                                >
                                    Open {favoriteStoreName} <i className="fas fa-external-link-alt text-sm" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroceryExportModal;
