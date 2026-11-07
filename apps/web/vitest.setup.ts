import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Only meaningful (and only importable) in jsdom specs.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
