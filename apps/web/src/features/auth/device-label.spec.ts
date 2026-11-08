import { describe, expect, it } from 'vitest';
import { describeDevice } from './device-label';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';

describe('describeDevice', () => {
  it.each([
    [CHROME, 'Chrome on Linux'],
    [IPHONE, 'Safari on iOS'],
    [null, 'Unknown device'],
    ['curl/8.0', 'curl/8.0'],
  ])('%s -> %s', (agent, label) => expect(describeDevice(agent)).toBe(label));
});
