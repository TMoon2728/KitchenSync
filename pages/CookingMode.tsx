
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Recipe } from '../types';
import { useKitchen } from '../context/KitchenContext';
import confetti from 'canvas-confetti';

const CookingMode: React.FC = () => {
    const { recipes } = useKitchen();
    const { id } = useParams();
    const recipe = recipes.find(r => r.id === Number(id));

    const steps = React.useMemo(() => {
        if (!recipe) return [];
        const rawSteps = recipe.instructions.split(/(?:\r\n|\r|\n)|(?=\d+\.\s)/).map(s => s.trim()).filter(s => s.length > 0);
        return rawSteps;
    }, [recipe]);

    const [currentStep, setCurrentStep] = useState(0);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);

    if (!recipe) return <div className="text-white text-center mt-20">Recipe not found</div>;

    const progress = Math.min(100, ((currentStep + 1) / steps.length) * 100);

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
        if (currentStep < steps.length - 1) {
            const nextStep = currentStep + 1;
            setCurrentStep(nextStep);
            speakText(steps[nextStep]);
        } else {
            setIsCompleted(true);
            fireConfetti();
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
        speakText(steps[currentStep]);
    };

    const fireConfetti = () => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 text-white z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-6 bg-gray-800 shadow-lg z-10">
                <Link to={`/recipes/${recipe.id}`} className="text-gray-400 hover:text-white flex items-center transition-colors group">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-2 group-hover:bg-gray-600">
                        <i className="fas fa-times text-sm"></i>
                    </div>
                    <span className="font-semibold">Exit Kitchen</span>
                </Link>
                <div className="text-center">
                    <h1 className="text-lg md:text-xl font-bold truncate max-w-xs md:max-w-md text-gray-100">{recipe.name}</h1>
                </div>
                <div className="text-gray-400 font-mono text-sm bg-gray-700 px-3 py-1 rounded-full border border-gray-600">
                    {!isCompleted ? `Step ${currentStep + 1} / ${steps.length}` : 'Complete'}
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
            <div className="flex-grow flex flex-col items-center justify-center p-6 md:p-12 text-center relative">
                {/* Background Decoration */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-pulse"></div>

                {!isCompleted ? (
                    <div className="bg-gray-800/80 backdrop-blur-md p-8 md:p-16 rounded-3xl shadow-2xl max-w-5xl w-full border border-gray-700 transition-all duration-500 transform animate-scale-in">
                        <div className="mb-6">
                            <span className="text-6xl md:text-8xl font-bold text-gray-700 select-none opacity-30">{currentStep + 1}</span>
                        </div>
                        <p className="text-2xl md:text-4xl font-medium leading-relaxed tracking-wide text-gray-100">
                            {steps[currentStep]}
                        </p>
                    </div>
                ) : (
                    <div className="bg-gradient-to-br from-green-900 to-gray-900 p-12 rounded-3xl shadow-2xl max-w-3xl w-full border border-green-700 animate-scale-in flex flex-col items-center">
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg animate-bounce-slow">
                            <i className="fas fa-check text-4xl text-white"></i>
                        </div>
                        <h2 className="text-4xl font-bold text-white mb-4">Dish Completed!</h2>
                        <p className="text-xl text-gray-300 mb-8">Great job, Chef! You've successfully cooked {recipe.name}.</p>

                        <div className="flex gap-4">
                            <button onClick={() => { setIsCompleted(false); setCurrentStep(0); }} className="px-6 py-3 rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-800 transition-colors">
                                Cook Again
                            </button>
                            <Link to="/" className="px-8 py-3 rounded-lg bg-green-600 text-white font-bold hover:bg-green-500 transition-transform hover:scale-105 shadow-lg">
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            {!isCompleted && (
                <div className="p-8 md:p-12 bg-gray-800/90 backdrop-blur-sm border-t border-gray-700 flex justify-center items-center gap-8 md:gap-16 z-20">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className="w-16 h-16 rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-gray-300 hover:text-white"
                        title="Previous Step"
                    >
                        <i className="fas fa-arrow-left text-2xl"></i>
                    </button>

                    <button
                        onClick={handleReplay}
                        className={`w-24 h-24 rounded-full ${isSpeaking ? 'bg-yellow-500 animate-pulse-glow' : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400'} flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95 text-white`}
                        title="Read Aloud"
                    >
                        <i className={`fas ${isSpeaking ? 'fa-volume-up' : 'fa-microphone'} text-4xl`}></i>
                    </button>

                    <button
                        onClick={handleNext}
                        className="w-16 h-16 rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-gray-300 hover:text-white"
                        title={currentStep === steps.length - 1 ? "Finish" : "Next Step"}
                    >
                        <i className={`fas ${currentStep === steps.length - 1 ? 'fa-check text-green-400' : 'fa-arrow-right'} text-2xl`}></i>
                    </button>
                </div>
            )}

            {/* Ingredients Sidebar Toggle */}
            <div className="absolute top-24 right-4 group z-40 hidden md:block">
                <button className="bg-gray-700 p-4 rounded-full shadow-lg opacity-70 group-hover:opacity-100 transition-all hover:bg-gray-600 border border-gray-600">
                    <i className="fas fa-carrot text-xl text-orange-400"></i>
                </button>
                <div className="absolute right-0 top-14 w-72 bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-2xl p-6 hidden group-hover:block max-h-[60vh] overflow-y-auto border border-gray-600 animate-fade-in origin-top-right">
                    <h3 className="font-bold border-b border-gray-600 pb-3 mb-3 text-lg text-orange-400 flex items-center">
                        <i className="fas fa-list-ul mr-2"></i> Ingredients
                    </h3>
                    <ul className="space-y-3">
                        {recipe.ingredients.map((ing, i) => (
                            <li key={i} className="flex justify-between items-center text-sm border-b border-gray-700/50 pb-2 last:border-0">
                                <span className="font-medium text-gray-200">{ing.name}</span>
                                <span className="text-gray-400 bg-gray-700 px-2 py-1 rounded-md text-xs">{ing.quantity} {ing.unit}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default CookingMode;
