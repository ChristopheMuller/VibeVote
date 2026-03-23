import { performance } from 'perf_hooks';

// Simulated network latency
const NETWORK_LATENCY_MS = 50;

// Simulate deleteDoc
const mockDeleteDoc = async (id: string) => {
  return new Promise(resolve => setTimeout(resolve, NETWORK_LATENCY_MS));
};

// Simulate writeBatch
class MockBatch {
  private operations = 0;

  delete(ref: any) {
    this.operations++;
    if (this.operations > 500) {
      throw new Error('Batch limit exceeded');
    }
  }

  async commit() {
    return new Promise(resolve => setTimeout(resolve, NETWORK_LATENCY_MS));
  }
}

const mockWriteBatch = () => new MockBatch();

// Benchmark scenarios
const VOTE_COUNTS = [10, 100, 500, 1000];

async function runBenchmark() {
  console.log('Running Deletion Benchmark...\n');

  for (const count of VOTE_COUNTS) {
    console.log(`--- Testing with ${count} votes ---`);

    // Scenario 1: N+1 Deletions (Current)
    const docs = Array.from({ length: count }, (_, i) => ({ ref: `doc_${i}` }));

    const startN1 = performance.now();
    const deletePromises = docs.map(d => mockDeleteDoc(d.ref));
    await Promise.all(deletePromises);
    const endN1 = performance.now();
    const durationN1 = endN1 - startN1;

    console.log(`[Current] N+1 (Promise.all): ${durationN1.toFixed(2)} ms`);

    // Scenario 2: Chunked Batch Deletions (Optimized)
    const startBatch = performance.now();

    // Logic similar to what will be in App.tsx
    const chunks = [];
    for (let i = 0; i < docs.length; i += 500) {
      chunks.push(docs.slice(i, i + 500));
    }

    const batchPromises = chunks.map(async chunk => {
      const batch = mockWriteBatch();
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    });

    await Promise.all(batchPromises);

    const endBatch = performance.now();
    const durationBatch = endBatch - startBatch;

    console.log(`[Optimized] Chunked writeBatch: ${durationBatch.toFixed(2)} ms`);
    console.log(`Improvement: ${durationN1 > durationBatch ? '+' : ''}${((durationN1 - durationBatch) / durationN1 * 100).toFixed(2)}% faster`);
    console.log('\n');
  }
}

runBenchmark().catch(console.error);
