/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * This is an O(n) operation and is more efficient and provides a better
 * distribution than array.sort(() => 0.5 - Math.random()).
 *
 * @param array The array to shuffle
 * @returns A new shuffled array
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
