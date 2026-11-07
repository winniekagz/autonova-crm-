import { hash } from '@node-rs/argon2';

/** Prints hash time for a few cost settings so ARGON2_* can be tuned on the deployment host. */
const candidates = [
  { memoryCost: 19456, timeCost: 2 },
  { memoryCost: 32768, timeCost: 3 },
  { memoryCost: 65536, timeCost: 3 },
  { memoryCost: 131072, timeCost: 3 },
];

for (const c of candidates) {
  const runs = 5;
  const start = performance.now();
  for (let i = 0; i < runs; i++) await hash('benchmark password', { parallelism: 1, ...c });
  const ms = (performance.now() - start) / runs;
  console.log(`m=${c.memoryCost} KiB t=${c.timeCost} p=1  ->  ${ms.toFixed(0)} ms/hash`);
}
console.log('Target roughly 250-500 ms per hash on the production host.');
