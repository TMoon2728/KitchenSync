import React from 'react';
import type { DayOfWeekKey, MealSlotType, WeeklyScheduleMatrix } from '../types';
import {
    DAYS_OF_WEEK,
    ALL_MEAL_SLOTS,
    SCHEDULE_PRESETS,
    normalizeScheduleMatrix,
    countWeeklyTargetSlots,
    matricesAreEqual
} from '../utils/schedule';

interface ScheduleSelectorProps {
    matrix: WeeklyScheduleMatrix;
    onChange: (newMatrix: WeeklyScheduleMatrix) => void;
    compact?: boolean;
}

const SLOT_ICONS: Record<MealSlotType, string> = {
    Breakfast: 'fa-mug-hot text-amber-500',
    Lunch: 'fa-sun text-yellow-500',
    Dinner: 'fa-moon text-indigo-500',
    Snack: 'fa-apple-whole text-green-500'
};

const ScheduleSelector: React.FC<ScheduleSelectorProps> = ({ matrix, onChange, compact = false }) => {
    const normalized = normalizeScheduleMatrix(matrix);
    const totalMeals = countWeeklyTargetSlots(normalized);

    const toggleCell = (day: DayOfWeekKey, slot: MealSlotType) => {
        const currentDaySlots = normalized[day] || [];
        const exists = currentDaySlots.includes(slot);
        const updatedDaySlots = exists
            ? currentDaySlots.filter(s => s !== slot)
            : ALL_MEAL_SLOTS.filter(s => s === slot || currentDaySlots.includes(s));

        onChange({
            ...normalized,
            [day]: updatedDaySlots
        });
    };

    const toggleEntireMealRow = (slot: MealSlotType) => {
        const allEnabled = DAYS_OF_WEEK.every(day => normalized[day]?.includes(slot));
        const nextMatrix = { ...normalized };
        DAYS_OF_WEEK.forEach(day => {
            const current = nextMatrix[day] || [];
            if (allEnabled) {
                nextMatrix[day] = current.filter(s => s !== slot);
            } else if (!current.includes(slot)) {
                nextMatrix[day] = ALL_MEAL_SLOTS.filter(s => s === slot || current.includes(s));
            }
        });
        onChange(nextMatrix);
    };

    const toggleEntireDayColumn = (day: DayOfWeekKey) => {
        const current = normalized[day] || [];
        const hasMainMeals = ['Breakfast', 'Lunch', 'Dinner'].every(s => current.includes(s as MealSlotType));
        onChange({
            ...normalized,
            [day]: hasMainMeals ? [] : ['Breakfast', 'Lunch', 'Dinner']
        });
    };

    return (
        <div className="space-y-4">
            {/* Quick Presets */}
            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Quick Schedule Presets
                    </span>
                    <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full">
                        {totalMeals} meal{totalMeals === 1 ? '' : 's'} / week
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {SCHEDULE_PRESETS.map(preset => {
                        const presetMatrix = preset.build();
                        const isActive = matricesAreEqual(normalized, presetMatrix);
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => onChange(presetMatrix)}
                                title={preset.description}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                    isActive
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                                }`}
                            >
                                <i className={`fas ${preset.icon} text-[11px]`}></i>
                                {preset.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Interactive Day x Meal Grid */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 p-2 sm:p-3">
                <table className="w-full text-center border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 pb-2 pr-2">
                                Meal / Day
                            </th>
                            {DAYS_OF_WEEK.map(day => {
                                const dayCount = normalized[day]?.length || 0;
                                return (
                                    <th key={day} className="pb-2 px-1">
                                        <button
                                            type="button"
                                            onClick={() => toggleEntireDayColumn(day)}
                                            title={`Toggle ${day} meals`}
                                            className={`w-full py-1 px-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                                                dayCount > 0
                                                    ? 'text-gray-800 dark:text-gray-100 hover:bg-blue-100 dark:hover:bg-gray-700'
                                                    : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            {day}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {ALL_MEAL_SLOTS.map(slot => {
                            const rowActiveCount = DAYS_OF_WEEK.filter(d => normalized[d]?.includes(slot)).length;
                            const isAllRowActive = rowActiveCount === DAYS_OF_WEEK.length;
                            return (
                                <tr key={slot}>
                                    <td className="py-1.5 pr-2 text-left whitespace-nowrap">
                                        <button
                                            type="button"
                                            onClick={() => toggleEntireMealRow(slot)}
                                            title={`Toggle all ${slot}s`}
                                            className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded-lg transition-colors w-full ${
                                                isAllRowActive
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <i className={`fas ${SLOT_ICONS[slot]} w-4 text-center`}></i>
                                            <span>{slot}</span>
                                        </button>
                                    </td>
                                    {DAYS_OF_WEEK.map(day => {
                                        const checked = normalized[day]?.includes(slot);
                                        return (
                                            <td key={`${day}-${slot}`} className="py-1.5 px-1">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleCell(day, slot)}
                                                    aria-label={`${day} ${slot}`}
                                                    className={`w-8 ${compact ? 'h-7' : 'h-8'} mx-auto rounded-lg flex items-center justify-center transition-all border ${
                                                        checked
                                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm scale-100'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-transparent hover:border-blue-300'
                                                    }`}
                                                >
                                                    <i className="fas fa-check text-[10px]"></i>
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 text-center">
                    Tip: Click any cell (e.g. <strong>Wed × Lunch</strong>), or click a row/day header to toggle a whole row or day.
                </p>
            </div>
        </div>
    );
};

export default ScheduleSelector;
