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
