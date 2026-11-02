import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Ingredient, PantryItem } from '../types';
import { useKitchen } from '../context/KitchenContext';
import confetti from 'canvas-confetti';
import { formatQuantity } from '../utils/formatters';
import { standardizeMeasurement } from '../utils/ingredientNormalizer';
import { extractStepTimers, type ExtractedStepTimer } from '../utils/stepTimerParser';
import { inferDefaultExpiryDate } from '../utils/pantryMatcher';

interface ActiveTimer {
    id: string;
    label: string;
    stepIndex: number;
    totalSeconds: number;
    remainingSeconds: number;
    isRunning: boolean;
    isFinished: boolean;
}

const playTimerChime = () => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
            gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.14);
            osc.stop(ctx.currentTime + idx * 0.14 + 0.35);
        });
    } catch (_) {
        // Ignore audio context restrictions
    }
};

const formatTimerClock = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const CookingMode: React.FC = () => {
    const { recipes, deductPantryIngredients, batchAddPantryItems } = useKitchen();
    const { id } = useParams();
    const recipe = recipes.find(r => r.id === Number(id));

    const steps = useMemo(() => {
        if (!recipe) return [];
        const rawSteps = recipe.instructions
            .split(/(?:\r\n|\r|\n)|(?=\d+\.\s)/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        return rawSteps;
    }, [recipe]);

    const [currentStep, setCurrentStep] = useState(0);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [missingIngredients, setMissingIngredients] = useState<Ingredient[]>([]);
    const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
    const [desiredServings, setDesiredServings] = useState<number>(recipe?.servings || 4);
    const [showIngredientsDrawer, setShowIngredientsDrawer] = useState(false);

    // Hands-Free Voice Control State (F-04)
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    const speechRecognitionSupported = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    }, []);

    useEffect(() => {
        if (recipe?.servings) setDesiredServings(recipe.servings);
    }, [recipe?.id, recipe?.servings]);

    // Extract durations from the current step text (F-04)
    const currentStepTimers = useMemo<ExtractedStepTimer[]>(() => {
        if (!steps[currentStep]) return [];
        return extractStepTimers(steps[currentStep]);
    }, [steps, currentStep]);

    // Scaled ingredients for drawer (F-02)
    const scaledIngredients = useMemo<Ingredient[]>(() => {
        if (!recipe) return [];
        const ratio = recipe.servings > 0 ? desiredServings / recipe.servings : 1;
        if (Math.abs(ratio - 1) < 0.01) return recipe.ingredients;
        return recipe.ingredients.map(ing => {
            const std = standardizeMeasurement((Number(ing.quantity) || 1) * ratio, ing.unit, ing.name, false);
            return { ...ing, quantity: std.quantity, unit: std.unit };
        });
    }, [recipe, desiredServings]);

    // Tick active countdown timers every second
    useEffect(() => {
        if (!activeTimers.some(t => t.isRunning)) return;
        const interval = setInterval(() => {
            setActiveTimers(prev =>
                prev.map(t => {
                    if (!t.isRunning) return t;
                    if (t.remainingSeconds <= 1) {
                        playTimerChime();
                        return { ...t, remainingSeconds: 0, isRunning: false, isFinished: true };
                    }
                    return { ...t, remainingSeconds: t.remainingSeconds - 1 };
                })
            );
        }, 1000);
        return () => clearInterval(interval);
    }, [activeTimers]);

    const startExtractedTimer = (extracted: ExtractedStepTimer) => {
        setActiveTimers(prev => {
            const existing = prev.find(
                t => t.stepIndex === currentStep && t.totalSeconds === extracted.durationSeconds
            );
            if (existing) {
                return prev.map(t =>
                    t.id === existing.id
                        ? { ...t, remainingSeconds: t.totalSeconds, isRunning: true, isFinished: false }
                        : t
                );
            }
            return [
                ...prev,
                {
                    id: `${extracted.id}-${Date.now()}`,
                    label: `Step ${currentStep + 1} (${extracted.label})`,
                    stepIndex: currentStep,
                    totalSeconds: extracted.durationSeconds,
                    remainingSeconds: extracted.durationSeconds,
                    isRunning: true,
                    isFinished: false
                }
            ];
        });
    };

    const toggleTimerRun = (timerId: string) => {
        setActiveTimers(prev =>
            prev.map(t => (t.id === timerId ? { ...t, isRunning: !t.isRunning, isFinished: false } : t))
        );
    };

    const addOneMinuteToTimer = (timerId: string) => {
        setActiveTimers(prev =>
            prev.map(t =>
                t.id === timerId
                    ? { ...t, remainingSeconds: t.remainingSeconds + 60, totalSeconds: t.totalSeconds + 60, isFinished: false }
                    : t
            )
        );
    };

    const removeTimer = (timerId: string) => {
        setActiveTimers(prev => prev.filter(t => t.id !== timerId));
    };

    const speakText = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = () => setIsSpeaking(false);
            setIsSpeaking(true);
            window.speechSynthesis.speak(utterance);
        }
    };

    const handleNext = () => {
        if (!recipe) return;
        if (currentStep < steps.length - 1) {
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            speakText(steps[nextStep]);
        } else {
            setIsCompleted(true);
            fireConfetti();

            const { missing: missingIngs } = deductPantryIngredients(scaledIngredients, false);
            if (missingIngs.length > 0) {
                setMissingIngredients(missingIngs);
            }
        }
    };

    const handlePrev = () => {
        if (isCompleted) {
            setIsCompleted(false);
            return;
        }
        if (currentStep > 0) {
            const prevStep = currentStep - 1;
            setCurrentStep(prevStep);
            speakText(steps[prevStep]);
        }
    };

    const handleReplay = () => {
        if (steps[currentStep]) {
            speakText(steps[currentStep]);
        }
    };

    // Keep latest handlers in a ref for SpeechRecognition callback
    const commandHandlersRef = useRef({ handleNext, handlePrev, handleReplay, currentStepTimers, startExtractedTimer });
    commandHandlersRef.current = { handleNext, handlePrev, handleReplay, currentStepTimers, startExtractedTimer };

    useEffect(() => {
        if (!voiceEnabled || !speechRecognitionSupported) {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (_) {}
                recognitionRef.current = null;
            }
            return;
        }

        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            const lastResult = event.results[event.results.length - 1];
            const transcript = String(lastResult?.[0]?.transcript || '').toLowerCase().trim();
            if (!transcript) return;

            setLastVoiceCommand(`"${transcript}"`);
            const { handleNext: nextFn, handlePrev: prevFn, handleReplay: replayFn, currentStepTimers: timers, startExtractedTimer: startTimerFn } =
                commandHandlersRef.current;

            if (/\b(?:next|forward|continue|done)\b/.test(transcript)) {
                nextFn();
            } else if (/\b(?:back|previous|prev)\b/.test(transcript)) {
                prevFn();
            } else if (/\b(?:repeat|read|again)\b/.test(transcript)) {
                replayFn();
            } else if (/\b(?:timer|start timer)\b/.test(transcript) && timers.length > 0) {
                startTimerFn(timers[0]);
            }
        };

        recognition.onend = () => {
            if (recognitionRef.current) {
                try {
                    recognition.start();
                } catch (_) {}
            }
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
        } catch (_) {}

        return () => {
            recognitionRef.current = null;
            try {
                recognition.stop();
            } catch (_) {}
        };
    }, [voiceEnabled, speechRecognitionSupported]);

    if (!recipe) return <div className="text-white text-center mt-20">Recipe not found</div>;

    const progress = Math.min(100, ((currentStep + 1) / Math.max(1, steps.length)) * 100);

    const handleAddMissingToPantry = async () => {
        const itemsToAdd: Omit<PantryItem, 'id'>[] = missingIngredients.map((ing) => ({
            name: ing.name,
            quantity: 1,
            unit: ing.unit || 'each',
            category: ing.category || 'Other',
            expiryDate: inferDefaultExpiryDate(ing.category || 'Other', ing.name)
        }));

        await batchAddPantryItems(itemsToAdd);
        setMissingIngredients([]);
        fireConfetti();
    };

    const fireConfetti = () => {
        const duration = 2500;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 40 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 text-white z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-6 bg-gray-800 shadow-lg z-20">
                <Link
                    to={`/recipes/${recipe.id}`}
                    className="text-gray-400 hover:text-white flex items-center transition-colors group"
                >
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-2 group-hover:bg-gray-600">
                        <i className="fas fa-times text-sm"></i>
                    </div>
                    <span className="font-semibold text-sm sm:text-base">Exit Kitchen</span>
                </Link>

                <div className="text-center">
                    <h1 className="text-base sm:text-xl font-bold truncate max-w-xs md:max-w-md text-gray-100">
                        {recipe.name}
                    </h1>
                    {voiceEnabled && (
                        <p className="text-[11px] text-emerald-400 font-semibold animate-pulse">
                            <i className="fas fa-Assistive-listening-systems mr-1"></i>
                            Listening: say "Next", "Back", "Repeat", or "Start Timer"
                            {lastVoiceCommand ? ` • Heard ${lastVoiceCommand}` : ''}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {speechRecognitionSupported && (
                        <button
                            type="button"
                            onClick={() => setVoiceEnabled(prev => !prev)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${
                                voiceEnabled
                                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md animate-pulse'
                                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:text-white'
                            }`}
                            title="Hands-Free Voice Commands ('Next', 'Back', 'Repeat', 'Start Timer')"
                        >
                            <i className="fas fa-microphone-lines"></i>
                            <span className="hidden sm:inline">{voiceEnabled ? 'Hands-Free ON' : 'Voice Control'}</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowIngredientsDrawer(prev => !prev)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-gray-700 border border-gray-600 text-orange-400 hover:bg-gray-600 flex items-center gap-1.5"
                    >
                        <i className="fas fa-carrot"></i>
                        <span className="hidden sm:inline">Ingredients ({desiredServings} serv)</span>
                    </button>

                    <div className="text-gray-400 font-mono text-xs sm:text-sm bg-gray-700 px-3 py-1 rounded-full border border-gray-600">
                        {!isCompleted ? `Step ${currentStep + 1} / ${steps.length}` : 'Complete'}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-800 h-2 relative">
                <div
                    className="bg-gradient-to-r from-green-400 to-blue-500 h-2 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: isCompleted ? '100%' : `${progress}%` }}
                ></div>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow flex flex-col items-center justify-center p-6 md:p-12 text-center relative overflow-y-auto">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse pointer-events-none"></div>

                {!isCompleted ? (
                    <div className="bg-gray-800/80 backdrop-blur-md p-6 sm:p-12 rounded-3xl shadow-2xl max-w-4xl w-full border border-gray-700 transition-all duration-500 transform animate-scale-in space-y-6">
                        <div>
                            <span className="text-5xl md:text-7xl font-bold text-gray-700 select-none opacity-40">
                                {currentStep + 1}
                            </span>
                        </div>
                        <p className="text-xl sm:text-3xl md:text-4xl font-medium leading-relaxed tracking-wide text-gray-100">
                            {steps[currentStep]}
                        </p>

                        {/* Auto-Extracted 1-Tap Step Timer Chips (F-04) */}
                        {currentStepTimers.length > 0 && (
                            <div className="pt-4 border-t border-gray-700/70 flex flex-wrap items-center justify-center gap-3">
                                <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                                    <i className="fas fa-stopwatch"></i> Detected Timers:
                                </span>
                                {currentStepTimers.map(timer => (
                                    <button
                                        key={timer.id}
                                        type="button"
                                        onClick={() => startExtractedTimer(timer)}
                                        className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                    >
                                        <i className="fas fa-play text-xs"></i>
                                        Start {timer.label} Timer
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-gradient-to-br from-green-900 to-gray-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-3xl w-full border border-green-700 animate-scale-in flex flex-col items-center">
                        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg animate-bounce-slow">
                            <i className="fas fa-check text-3xl text-white"></i>
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Dish Completed!</h2>
                        <p className="text-lg text-gray-300 mb-6">
                            Great job, Chef! You've successfully cooked {recipe.name}.
                        </p>

                        {missingIngredients.length > 0 && (
                            <div className="bg-gray-800/80 p-6 rounded-2xl border border-yellow-500/50 mb-8 w-full max-w-lg shadow-inner text-left animate-fade-in">
                                <h3 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
                                    <i className="fas fa-lightbulb"></i> Cook to Add
                                </h3>
                                <p className="text-gray-300 text-sm mb-4">
                                    We noticed these ingredients weren't in your Pantry. If you still have some left, add them to your inventory now:
                                </p>
                                <ul className="text-sm font-semibold text-gray-200 space-y-2 mb-4 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                    {missingIngredients.map((ing, i) => (
                                        <li
                                            key={i}
                                            className="flex justify-between items-center bg-gray-700/50 p-2 rounded-lg border border-gray-600"
                                        >
                                            <span>
                                                {ing.name}{' '}
                                                <span className="text-gray-400 ml-1 text-xs font-normal">
                                                    ({ing.category || 'Other'})
                                                </span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={handleAddMissingToPantry}
                                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold py-2 px-4 rounded-xl transition-colors shadow-lg shadow-yellow-500/20"
                                >
                                    Add All to Pantry
                                </button>
                            </div>
                        )}

                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    setIsCompleted(false);
                                    setCurrentStep(0);
                                    setMissingIngredients([]);
                                }}
                                className="px-6 py-3 rounded-xl border border-gray-500 text-gray-300 hover:bg-gray-800 transition-colors"
                            >
                                Cook Again
                            </button>
                            <Link
                                to="/"
                                className="px-8 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500 transition-transform hover:scale-105 shadow-lg"
                            >
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Active Multi-Timer Floating Dock (F-04) */}
            {activeTimers.length > 0 && (
                <div className="px-6 py-3 bg-gray-900/95 border-t border-gray-700 flex flex-wrap items-center justify-center gap-3 z-30">
                    {activeTimers.map(timer => (
                        <div
                            key={timer.id}
                            className={`px-4 py-2 rounded-2xl border flex items-center gap-3 shadow-lg transition-all ${
                                timer.isFinished
                                    ? 'bg-emerald-900/90 border-emerald-400 animate-bounce'
                                    : 'bg-gray-800 border-gray-600'
                            }`}
                        >
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                                    {timer.label}
                                </span>
                                <span
                                    className={`font-mono text-lg font-extrabold ${
                                        timer.isFinished ? 'text-emerald-300' : 'text-white'
                                    }`}
                                >
                                    {timer.isFinished ? 'DONE!' : formatTimerClock(timer.remainingSeconds)}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => toggleTimerRun(timer.id)}
                                    className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-xs"
                                    title={timer.isRunning ? 'Pause' : 'Resume'}
                                >
                                    <i className={`fas ${timer.isRunning ? 'fa-pause' : 'fa-play'}`}></i>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addOneMinuteToTimer(timer.id)}
                                    className="px-2 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-bold text-blue-300"
                                    title="Add 1 minute"
                                >
                                    +1m
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeTimer(timer.id)}
                                    className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white flex items-center justify-center text-xs"
                                    title="Dismiss timer"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Controls */}
            {!isCompleted && (
                <div className="p-6 md:p-8 bg-gray-800/90 backdrop-blur-sm border-t border-gray-700 flex justify-center items-center gap-8 md:gap-16 z-20">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-gray-300 hover:text-white"
                        title="Previous Step"
                    >
                        <i className="fas fa-arrow-left text-xl sm:text-2xl"></i>
                    </button>

                    <button
                        onClick={handleReplay}
                        className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full ${
                            isSpeaking
                                ? 'bg-yellow-500 animate-pulse-glow'
                                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400'
                        } flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95 text-white`}
                        title="Read Step Aloud"
                    >
                        <i className={`fas ${isSpeaking ? 'fa-volume-up' : 'fa-microphone'} text-3xl sm:text-4xl`}></i>
                    </button>

                    <button
                        onClick={handleNext}
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-gray-300 hover:text-white"
                        title={currentStep === steps.length - 1 ? 'Finish' : 'Next Step'}
                    >
                        <i
                            className={`fas ${
                                currentStep === steps.length - 1 ? 'fa-check text-green-400' : 'fa-arrow-right'
                            } text-xl sm:text-2xl`}
                        ></i>
                    </button>
                </div>
            )}

            {/* Slide-Over Ingredients & Live Serving Scaler Drawer */}
            {showIngredientsDrawer && (
                <div className="fixed right-4 top-20 w-80 bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-2xl p-5 max-h-[70vh] overflow-y-auto border border-gray-600 animate-fade-in z-40">
                    <div className="flex justify-between items-center border-b border-gray-600 pb-3 mb-3">
                        <h3 className="font-bold text-base text-orange-400 flex items-center">
                            <i className="fas fa-list-ul mr-2"></i> Ingredients
                        </h3>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setDesiredServings(prev => Math.max(1, prev - 1))}
                                className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold"
                            >
                                -
                            </button>
                            <span className="text-xs font-bold px-1">{desiredServings} serv</span>
                            <button
                                type="button"
                                onClick={() => setDesiredServings(prev => Math.min(48, prev + 1))}
                                className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold"
                            >
                                +
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowIngredientsDrawer(false)}
                                className="ml-2 text-gray-400 hover:text-white text-sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <ul className="space-y-2.5">
                        {scaledIngredients.map((ing, i) => (
                            <li
                                key={i}
                                className="flex justify-between items-center text-sm border-b border-gray-700/50 pb-2 last:border-0"
                            >
                                <span className="font-medium text-gray-200">{ing.name}</span>
                                <span className="text-gray-300 bg-gray-700 px-2 py-0.5 rounded-md text-xs font-mono">
                                    {formatQuantity(ing.quantity)} {ing.unit}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default CookingMode;
