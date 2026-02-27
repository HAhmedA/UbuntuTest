// Shared statistical utilities

/**
 * Compute a percentile value from a pre-sorted array using linear interpolation.
 *
 * @param {number[]} sortedArr - Array of numbers sorted ascending
 * @param {number} p - Percentile to compute (0–100)
 * @returns {number}
 */
export function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    if (sortedArr.length === 1) return sortedArr[0];
    const idx = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sortedArr[lower];
    return sortedArr[lower] + (sortedArr[upper] - sortedArr[lower]) * (idx - lower);
}
