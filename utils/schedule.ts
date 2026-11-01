import type { DayOfWeekKey, MealSlotType, WeeklyScheduleMatrix } from '../types';

export const DAYS_OF_WEEK: DayOfWeekKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DAY_FULL_NAMES: Record<DayOfWeekKey, string> = {
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday'
};

export const ALL_MEAL_SLOTS: MealSlotType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const UNSCHEDULED_PLAN_KEY = 'unscheduled';
export const FLEXIBLE_SLOT_KEY = 'Flexible';

export const createUniformMatrix = (slots: MealSlotType[], days: DayOfWeekKey[] = DAYS_OF_WEEK): WeeklyScheduleMatrix => {
    const matrix = {} as WeeklyScheduleMatrix;
    DAYS_OF_WEEK.forEach(d => {
        matrix[d] = days.includes(d) ? [...slots] : [];
    });
    return matrix;
};

export const DEFAULT_SCHEDULE_MATRIX: WeeklyScheduleMatrix = createUniformMatrix(['Breakfast', 'Lunch', 'Dinner']);

export interface SchedulePreset {
    id: string;
    label: string;
    description: string;
    icon: string;
    build: () => WeeklyScheduleMatrix;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
    {
        id: 'only-dinners',
        label: 'Only Dinners',
        description: 'Dinners every night (7 meals/wk)',
        icon: 'fa-moon',
        build: () => createUniformMatrix(['Dinner'])
    },
    {
        id: 'weeknight-dinners',
        label: 'Weeknight Dinners',
        description: 'Mon–Fri Dinners only (5 meals/wk)',
        icon: 'fa-briefcase',
        build: () => createUniformMatrix(['Dinner'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    },
    {
        id: 'only-lunches',
        label: 'Only Lunches',
        description: 'Lunches every day (7 meals/wk)',
        icon: 'fa-sun',
        build: () => createUniformMatrix(['Lunch'])
    },
    {
        id: 'dinners-wed-lunch',
        label: 'Dinners + Wed Lunch',
        description: 'Nightly Dinners & Wednesday Lunch (8 meals/wk)',
        icon: 'fa-calendar-check',
        build: () => {
            const m = createUniformMatrix(['Dinner']);
            m.Wed = ['Lunch', 'Dinner'];
            return m;
        }
    },
    {
        id: 'lunches-and-dinners',
        label: 'Lunches & Dinners',
        description: 'Lunch & Dinner every day (14 meals/wk)',
        icon: 'fa-utensils',
        build: () => createUniformMatrix(['Lunch', 'Dinner'])
    },
    {
        id: 'full-week',
        label: 'All 3 Meals',
        description: 'Breakfast, Lunch & Dinner daily (21 meals/wk)',
        icon: 'fa-calendar-week',
        build: () => createUniformMatrix(['Breakfast', 'Lunch', 'Dinner'])
    }
];

export const normalizeScheduleMatrix = (matrix?: Partial<WeeklyScheduleMatrix> | null): WeeklyScheduleMatrix => {
    if (!matrix || typeof matrix !== 'object') {
        return createUniformMatrix(['Breakfast', 'Lunch', 'Dinner']);
    }
    const normalized = {} as WeeklyScheduleMatrix;
    DAYS_OF_WEEK.forEach(day => {
        const rawSlots = matrix[day];
        if (Array.isArray(rawSlots)) {
            normalized[day] = ALL_MEAL_SLOTS.filter(slot => rawSlots.includes(slot));
        } else {
            normalized[day] = ['Breakfast', 'Lunch', 'Dinner'];
        }
    });
    return normalized;
};

export const getDayKeyFromDate = (dateInput: Date | string): DayOfWeekKey => {
    const d = typeof dateInput === 'string'
        ? new Date(dateInput.includes('T') ? dateInput : `${dateInput}T00:00:00`)
        : dateInput;
    const jsDay = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const map: Record<number, DayOfWeekKey> = {
        0: 'Sun',
        1: 'Mon',
        2: 'Tue',
        3: 'Wed',
        4: 'Thu',
        5: 'Fri',
        6: 'Sat'
    };
    return map[jsDay] || 'Mon';
};

export const getActiveSlotsForDate = (dateInput: Date | string, matrix?: Partial<WeeklyScheduleMatrix> | null): MealSlotType[] => {
    const normalized = normalizeScheduleMatrix(matrix);
    const dayKey = getDayKeyFromDate(dateInput);
    return normalized[dayKey] || [];
};

export const countWeeklyTargetSlots = (matrix?: Partial<WeeklyScheduleMatrix> | null): number => {
    const normalized = normalizeScheduleMatrix(matrix);
    return DAYS_OF_WEEK.reduce((sum, day) => sum + (normalized[day]?.length || 0), 0);
};

export const matricesAreEqual = (a: WeeklyScheduleMatrix, b: WeeklyScheduleMatrix): boolean => {
    return DAYS_OF_WEEK.every(day => {
        const slotsA = a[day] || [];
        const slotsB = b[day] || [];
        return slotsA.length === slotsB.length && slotsA.every(s => slotsB.includes(s));
    });
};
