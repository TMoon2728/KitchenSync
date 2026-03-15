/**
 * Coverts a decimal number to a human readable fraction string.
 * Example: 1.5 -> "1 1/2", 0.33 -> "1/3", 0.75 -> "3/4"
 */
export const formatQuantity = (quantity: number | string): string => {
    const num = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    
    if (isNaN(num)) return String(quantity);
    if (num === 0) return "0";

    // Small threshold for floating point inaccuracies
    const tolerance = 0.05;

    // Separate whole number and remainder
    const whole = Math.floor(num);
    const decimal = num - whole;

    // If it's effectively a whole number, return just the whole part
    if (decimal < tolerance) {
        return whole.toString();
    }
    if (1 - decimal < tolerance) {
        return (whole + 1).toString();
    }

    // Common fractions check
    let fraction = "";
    if (Math.abs(decimal - 0.25) < tolerance) fraction = "1/4";
    else if (Math.abs(decimal - 1/3) < tolerance) fraction = "1/3";
    else if (Math.abs(decimal - 0.5) < tolerance) fraction = "1/2";
    else if (Math.abs(decimal - 2/3) < tolerance) fraction = "2/3";
    else if (Math.abs(decimal - 0.75) < tolerance) fraction = "3/4";
    else {
        // Fallback for weird numbers (e.g. 0.8)
        // Just return one decimal place
        return Number(num.toFixed(1)).toString();
    }

    if (whole > 0) {
        return `${whole} ${fraction}`;
    }
    
    return fraction;
};

/**
 * Parses a string that might be a fraction (like "1 1/2" or "1/2") into a decimal number.
 * Returns the original number if it's already a number or standard decimal string.
 */
export const parseQuantity = (input: string | number): number => {
    if (typeof input === 'number') return input;
    
    const str = input.trim();
    if (!str) return 0;
    
    const parts = str.split(' ');
    if (parts.length === 2) {
        const whole = parseFloat(parts[0]);
        const fractionParts = parts[1].split('/');
        if (fractionParts.length === 2) {
            const num = parseFloat(fractionParts[0]);
            const den = parseFloat(fractionParts[1]);
            if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) {
                return whole + (num / den);
            }
        }
    } else if (parts.length === 1) {
        const fractionParts = str.split('/');
        if (fractionParts.length === 2) {
            const num = parseFloat(fractionParts[0]);
            const den = parseFloat(fractionParts[1]);
            if (!isNaN(num) && !isNaN(den) && den !== 0) {
                return num / den;
            }
        } else {
            const num = parseFloat(str);
            if (!isNaN(num)) return num;
        }
    }
    
    return 0;
};
