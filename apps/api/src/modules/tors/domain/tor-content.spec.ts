import { describe, expect, it } from 'vitest';
import { diffVersions } from './tor-diff.js';
import { contentHashOf, type HashableVersion } from './tor-content.js';

const version = (over: Partial<HashableVersion> = {}): HashableVersion => ({
  torNumber: 'TOR-2026-0001',
  versionNo: 1,
  currency: 'KES',
  setupFee: '100000.00',
  discountType: 'NONE',
  discountValue: '0.00',
  hostingName: 'Standard',
  hostingDescription: 'Hosting and backups',
  hostingCycle: 'MONTHLY',
  hostingAmount: '5000.00',
  paymentTerms: '50% deposit',
  vatTreatment: 'APPLIED',
  vatRate: '16.00',
  scopeItems: [
    {
      itemKey: 'k1',
      name: 'POS',
      description: null,
      inScope: true,
      estimateDays: '5.00',
      price: '40000.00',
    },
    {
      itemKey: 'k2',
      name: 'Reports',
      description: null,
      inScope: false,
      estimateDays: '2.00',
      price: '0.00',
    },
  ],
  addons: [],
  milestones: [{ kind: 'GO_LIVE', name: 'Go live', targetDate: '2026-12-01' }],
  totals: {
    oneOffSubtotal: '140000.00',
    discountAmount: '0.00',
    netOneOff: '140000.00',
    vatOneOff: '22400.00',
    totalOneOff: '162400.00',
    recurringVat: '800.00',
    recurringTotal: '5800.00',
  },
  ...over,
});

describe('ToR content hash', () => {
  it('is stable for the same content and a sha-256 hex digest', () => {
    expect(contentHashOf(version())).toBe(contentHashOf(version()));
    expect(contentHashOf(version())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when scope, price, terms, milestones or the version number change', () => {
    const original = contentHashOf(version());
    const changed = [
      version({ setupFee: '100000.01' }),
      version({ paymentTerms: '30% deposit' }),
      version({ vatTreatment: 'EXEMPT' }),
      version({ versionNo: 2 }),
      version({ milestones: [{ kind: 'GO_LIVE', name: 'Go live', targetDate: '2026-12-02' }] }),
      version({
        scopeItems: [
          {
            itemKey: 'k1',
            name: 'POS',
            description: null,
            inScope: false,
            estimateDays: '5.00',
            price: '40000.00',
          },
        ],
      }),
      version({
        addons: [{ kind: 'HARDWARE', description: 'Scanner', quantity: '1.00', unitPrice: '1.00' }],
      }),
    ];
    for (const other of changed) expect(contentHashOf(other)).not.toBe(original);
  });

  it('does not depend on who edited it or when', () => {
    expect(contentHashOf(version())).toBe(contentHashOf({ ...version() }));
  });
});

describe('ToR version diff', () => {
  const item = (key: string, name: string, over: object = {}) => ({
    itemKey: key,
    name,
    inScope: true,
    estimateDays: '1.00',
    price: '100.00',
    ...over,
  });
  const make = (versionNo: number, items: ReturnType<typeof item>[], over: object = {}) => ({
    versionNo,
    currency: 'KES',
    setupFee: '0.00',
    discountType: 'NONE',
    discountValue: '0.00',
    hostingAmount: '0.00',
    hostingCycle: null,
    paymentTerms: null,
    vatTreatment: 'APPLIED',
    scopeItems: items,
    addons: [],
    milestones: [],
    ...over,
  });

  it('lists added, removed, changed and flipped scope, keeping dropped requests visible', () => {
    const v1 = make(1, [
      item('a', 'POS'),
      item('b', 'Loyalty'),
      item('c', 'Reports', { inScope: false }),
    ]);
    const v2 = make(2, [
      item('a', 'POS', { price: '150.00', estimateDays: '2.00' }),
      item('c', 'Reports', { inScope: true }),
      item('d', 'Mobile app'),
    ]);
    const diff = diffVersions(v1, v2);
    expect(diff).toMatchObject({ fromVersionNo: 1, toVersionNo: 2 });
    expect(diff.scope).toEqual([
      {
        kind: 'CHANGED',
        itemName: 'POS',
        detail: 'estimate 1.00 to 2.00 days; price 100.00 to 150.00',
      },
      { kind: 'SCOPE_FLIPPED', itemName: 'Reports', detail: 'Out of scope to in scope' },
      { kind: 'ADDED', itemName: 'Mobile app', detail: 'In scope' },
      { kind: 'REMOVED', itemName: 'Loyalty', detail: 'Dropped in this round' },
    ]);
  });

  it('lists commercial changes and nothing when versions are identical', () => {
    const v1 = make(1, [item('a', 'POS')]);
    expect(diffVersions(v1, make(2, [item('a', 'POS')]))).toMatchObject({
      scope: [],
      commercial: [],
    });
    const diff = diffVersions(
      v1,
      make(2, [item('a', 'POS')], { setupFee: '500.00', paymentTerms: '50% deposit' }),
    );
    expect(diff.commercial).toEqual([
      'Setup fee: 0.00 to 500.00',
      'Payment terms: none to 50% deposit',
    ]);
  });
});
