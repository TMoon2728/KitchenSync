import React, { useState, useEffect } from 'react';

interface GroceryExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    shoppingList: { name: string; quantity: number; unit: string; category?: string; }[];
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

    useEffect(() => {
        if (!isOpen) {
            setStep(0);
            setProgress(0);
            setIsCopied(false);
            return;
        }

        // Fake loading sequence
        const sequence = async () => {
            // Step 1: Connecting
            setStep(1);
            for (let i = 0; i <= 100; i += 5) {
                setProgress(i);
                await new Promise(r => setTimeout(r, 40));
            }

            // Step 2: Formatting List
            setStep(2);
            setProgress(0);
            for (let i = 0; i <= 100; i += 2) {
                setProgress(i);
                await new Promise(r => setTimeout(r, 30));
            }

            // Step 3: Success
            setStep(3);
            
            // Format List and Copy
            const formattedList = shoppingList.map(item => 
                `${item.quantity} ${item.unit} ${item.name}`
            ).join('\n');
            
            try {
                await navigator.clipboard.writeText(formattedList);
                setIsCopied(true);
            } catch (err) {
                console.error("Failed to copy list: ", err);
            }
        };

        sequence();
    }, [isOpen, shoppingList]);

    if (!isOpen) return null;

    const itemsCount = shoppingList.length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={step === 3 ? onClose : undefined} />
            
            <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md p-8 overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10 text-center space-y-6">
                    {/* Icon Header */}
                    <div className="flex justify-center">
                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                            step === 3 
                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 rotate-0' 
                                : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse'
                        }`}>
                            {step === 3 ? (
                                <i className="fas fa-check-circle text-4xl" />
                            ) : step === 2 ? (
                                <i className="fas fa-list-ol text-4xl" />
                            ) : (
                                <i className="fas fa-sync fa-spin text-4xl" />
                            )}
                        </div>
                    </div>

                    {/* Title & Subtitle */}
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            {step === 1 && "Connecting..."}
                            {step === 2 && "Preparing List..."}
                            {step === 3 && "List Ready!"}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            {step === 1 && `Preparing export for ${favoriteStoreName}`}
                            {step === 2 && `Formatting ${itemsCount} items for easy paste`}
                            {step === 3 && "Perfectly formatted and copied to your clipboard!"}
                        </p>
                    </div>

                    {/* Progress Bar (Only show during steps 1 and 2) */}
                    {step < 3 && (
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div 
                                className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}

                    {/* Action Step */}
                    {step === 3 && (
                        <div className="space-y-4 animate-fade-in pt-4">
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                                <p className="mb-2"><i className="fas fa-info-circle text-blue-500 mr-2"></i> How to use this:</p>
                                <ol className="list-decimal list-inside text-left space-y-1">
                                    <li>Click the button below to open <b>{favoriteStoreName}</b></li>
                                    <li>Your entire list is now on your clipboard!</li>
                                    <li>Paste it into a note-taking app, or use your phone's clipboard history so you don't have to switch apps while searching!</li>
                                </ol>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Cancel
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
