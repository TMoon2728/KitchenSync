import React, { useState } from 'react';
import { convertQuantity } from '../utils/unitConversion';
import { formatQuantity, parseQuantity } from '../utils/formatters';

const MeasurementConverter: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [amount, setAmount] = useState<string>('1');
    const [fromUnit, setFromUnit] = useState<string>('cup');
    const [toUnit, setToUnit] = useState<string>('ml');
    
    // Group units for the dropdown
    const units = {
        Volume: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'pt', 'qt', 'gal', 'floz'],
        Mass: ['g', 'kg', 'mg', 'oz', 'lb']
    };

    const parsedAmount = parseQuantity(amount);
    const result = convertQuantity(parsedAmount, fromUnit, toUnit);

    return (
        <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start hide-on-print">
            {isOpen && (
                <div className="mb-4 w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-scale-in origin-bottom-left">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex justify-between items-center">
                        <h3 className="font-bold flex items-center"><i className="fas fa-balance-scale mr-2"></i> Converter</h3>
                        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white"><i className="fas fa-times"></i></button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-1/3 form-input p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg dark:text-gray-100 text-center"
                                placeholder="Qty"
                            />
                            <select 
                                value={fromUnit} 
                                onChange={(e) => setFromUnit(e.target.value)}
                                className="w-2/3 form-input p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg dark:text-gray-100"
                            >
                                {Object.entries(units).map(([category, unitList]) => (
                                    <optgroup label={category} key={category}>
                                        {unitList.map(u => <option value={u} key={u}>{u}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-center text-gray-400">
                            <i className="fas fa-arrow-down"></i>
                        </div>

                        <select 
                            value={toUnit} 
                            onChange={(e) => setToUnit(e.target.value)}
                            className="w-full form-input p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg dark:text-gray-100"
                        >
                            {Object.entries(units).map(([category, unitList]) => (
                                <optgroup label={category} key={category}>
                                    {unitList.map(u => <option value={u} key={u}>{u}</option>)}
                                </optgroup>
                            ))}
                        </select>

                        <div className="mt-4 p-3 bg-blue-50 dark:bg-gray-700/50 rounded-xl border border-blue-100 dark:border-gray-600 text-center relative overflow-hidden">
                            {result !== null ? (
                                <div className="relative z-10">
                                    <span className="text-3xl font-black text-gray-800 dark:text-gray-100">{formatQuantity(result)}</span>
                                    <span className="text-gray-500 dark:text-gray-400 ml-2 font-bold">{toUnit}</span>
                                    {/* Subtext with raw decimal if fraction */}
                                    {result % 1 !== 0 && (
                                        <div className="text-xs text-gray-400 mt-1 font-mono">({result.toFixed(2)} {toUnit})</div>
                                    )}
                                </div>
                            ) : (
                                <span className="text-red-500 text-sm font-semibold relative z-10">Cannot convert {fromUnit} to {toUnit}</span>
                            )}
                            <i className="fas fa-equals absolute text-[100px] -right-4 -bottom-4 text-blue-500/5 dark:text-white/5 z-0 transform -rotate-12"></i>
                        </div>
                    </div>
                </div>
            )}
            
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-white border-2 border-white/20 dark:border-gray-700/50 ${isOpen ? 'bg-gray-800 rotate-90' : 'bg-gradient-to-br from-indigo-500 to-blue-600'}`}
                title="Measurement Converter"
            >
                <i className={`fas ${isOpen ? 'fa-times' : 'fa-calculator'} text-xl`}></i>
            </button>
        </div>
    );
};

export default MeasurementConverter;
