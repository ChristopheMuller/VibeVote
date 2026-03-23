import { performance } from 'node:perf_hooks';

// Simulate a large array of votes
const NUM_VOTES = 10000;
const votes = Array.from({ length: NUM_VOTES }, (_, i) => ({
  trackId: `track_${i % 10}`,
  skipVote: i % 3 === 0, // 33% skip votes
}));

// Baseline: Inefficient filtering every render
const RUNS = 10000;

console.log(`Running benchmark with ${NUM_VOTES} votes, ${RUNS} renders...`);

const startBaseline = performance.now();
let baselineTotalSkipVotes = 0;
for (let i = 0; i < RUNS; i++) {
  // Simulating an IIFE running on every render
  const skipVotes = votes.filter(v => v.skipVote === true).length;
  baselineTotalSkipVotes += skipVotes;
}
const endBaseline = performance.now();
const baselineTime = endBaseline - startBaseline;

console.log(`Baseline (Re-filtering every render): ${baselineTime.toFixed(2)} ms`);

// Optimized: Memoized calculation
const startOptimized = performance.now();
let optimizedTotalSkipVotes = 0;

// Simulating useMemo (only calculating once when votes array changes)
const memoizedSkipVotes = votes.filter(v => v.skipVote === true).length;

for (let i = 0; i < RUNS; i++) {
  // Simulating accessing the memoized value on every render
  const skipVotes = memoizedSkipVotes;
  optimizedTotalSkipVotes += skipVotes;
}
const endOptimized = performance.now();
const optimizedTime = endOptimized - startOptimized;

console.log(`Optimized (Memoized calculation): ${optimizedTime.toFixed(2)} ms`);

const improvement = baselineTime / optimizedTime;
console.log(`Improvement: ${improvement.toFixed(2)}x faster`);

// Assert correctness
if (baselineTotalSkipVotes !== optimizedTotalSkipVotes) {
  console.error('Error: Baseline and optimized calculations do not match!');
}
