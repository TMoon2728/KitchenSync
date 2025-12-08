
export type UnitType = 'mass' | 'volume' | 'count' | 'unknown';

interface UnitDefinition {
    type: UnitType;
    base: number; // Conversion factor to base unit
    aliases: string[];
}

const UNIT_DEFINITIONS: Record<string, UnitDefinition> = {
    // Mass (Base: grams)
    g: { type: 'mass', base: 1, aliases: ['g', 'gram', 'grams'] },
    kg: { type: 'mass', base: 1000, aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
    mg: { type: 'mass', base: 0.001, aliases: ['mg', 'milligram', 'milligrams'] },
    oz: { type: 'mass', base: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
    lb: { type: 'mass', base: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
    
    // Volume (Base: milliliters)
    ml: { type: 'volume', base: 1, aliases: ['ml', 'milliliter', 'milliliters', 'cc'] },
    l: { type: 'volume', base: 1000, aliases: ['l', 'liter', 'liters'] },
    tsp: { type: 'volume', base: 4.92892, aliases: ['tsp', 'teaspoon', 'teaspoons', 't'] },
    tbsp: { type: 'volume', base: 14.7868, aliases: ['tbsp', 'tablespoon', 'tablespoons', 'tbs', 'T'] },
    cup: { type: 'volume', base: 236.588, aliases: ['cup', 'cups', 'c'] },
    pt: { type: 'volume', base: 473.176, aliases: ['pt', 'pint', 'pints'] },
    qt: { type: 'volume', base: 946.353, aliases: ['qt', 'quart', 'quarts'] },
    gal: { type: 'volume', base: 3785.41, aliases: ['gal', 'gallon', 'gallons'] },
    floz: { type: 'volume', base: 29.5735, aliases: ['floz', 'fl oz', 'fluid ounce', 'fluid ounces'] },

    // Count (Base: each)
    each: { type: 'count', base: 1, aliases: ['each', 'ea', 'unit', 'units', 'pc', 'pcs', 'piece', 'pieces', 'clove', 'cloves', 'slice', 'slices', 'head', 'heads'] },
};

export const normalizeUnit = (unit: string): string => {
    if (!unit) return 'unknown';
    const cleanUnit = unit.toLowerCase().trim().replace(/\.$/, ''); 
    
    // 1. Exact alias match
    for (const [key, def] of Object.entries(UNIT_DEFINITIONS)) {
        if (key === cleanUnit || def.aliases.includes(cleanUnit)) {
            return key;
        }
    }
    
    // 2. Try removing trailing 's' if not found (simple pluralization check for unknown units)
    if (cleanUnit.endsWith('s')) {
        const singular = cleanUnit.slice(0, -1);
         for (const [key, def] of Object.entries(UNIT_DEFINITIONS)) {
            if (key === singular || def.aliases.includes(singular)) {
                return key;
            }
        }
        return singular;
    }
    
    return cleanUnit;
};

export const convertQuantity = (quantity: number, fromUnit: string, toUnit: string): number | null => {
    const fromKey = normalizeUnit(fromUnit);
    const toKey = normalizeUnit(toUnit);

    // If normalized units are the same (even if unknown), return quantity
    if (fromKey === toKey) return quantity;

    const fromDef = UNIT_DEFINITIONS[fromKey];
    const toDef = UNIT_DEFINITIONS[toKey];

    // If either unit is not in our DB, we can't mathematically convert
    if (!fromDef || !toDef) {
        return null;
    }

    if (fromDef.type !== toDef.type) {
        return null;
    }

    // Convert
    const baseQuantity = quantity * fromDef.base;
    return baseQuantity / toDef.base;
};
