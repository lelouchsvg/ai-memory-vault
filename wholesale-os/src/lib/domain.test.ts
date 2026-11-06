import { describe, expect, it } from 'vitest';
import {
  AGENTS,
  calculateArv,
  calculatePnl,
  calculateRepairs,
  estimateProbability,
  matchBuyer,
  normalizeAddress,
  redTeam,
  scoreLead,
  STAGES,
  underwrite,
  validateExternalExecution,
  validateTransition,
} from './domain';
import { providerRegistry } from './providers';

const now = new Date('2026-11-05T12:00:00Z');
const property = {
  id: 'p1',
  mode: 'DEMO',
  stage: 'UNDERWRITING',
  address: '100 Test St',
  city: 'Atlantic City',
  county: 'Atlantic',
  state: 'NJ',
  zip: '08401',
  sqft: 1500,
  bedrooms: 3,
  propertyType: 'SINGLE FAMILY',
  arvBase: 300000,
  arvLow: 280000,
  arvHigh: 320000,
  arvConfidence: 80,
  repairExpected: 40000,
  repairLow: 30000,
  repairHigh: 50000,
  ownerVerified: true,
  ownerConfidence: 95,
  riskGrade: 'GREEN',
  mao: 153000,
  targetAssignmentPrice: 168000,
  projectedAssignmentFee: 15000,
};
const comps = [0, 1, 2].map((i) => ({
  id: `c${i}`,
  source: 'Test county sales',
  saleDate: '2026-10-01',
  distance: 0.5,
  sqft: 1500,
  salePrice: 290000 + i * 10000,
  propertyType: 'SINGLE FAMILY',
}));
const buyer = {
  id: 'b1',
  counties: ['Atlantic'],
  propertyTypes: ['SINGLE FAMILY'],
  minPrice: 100000,
  maxPrice: 200000,
  maxRehab: 70000,
  minBedrooms: 2,
  minSqft: 1000,
  proofOfFundsStatus: 'VERIFIED',
  proofOfFundsExpiration: '2027-01-01',
  reliabilityScore: 90,
  closeSpeedDays: 14,
};

describe('comparable sales and repair ranges', () => {
  it('uses recent, nearby sourced sales to calculate ARV with uncertainty', () => {
    const result = calculateArv(property, comps, now);
    expect(result.arvBase).toBe(300000);
    expect(result.arvLow).toBeLessThan(result.arvBase);
    expect(result.arvHigh).toBeGreaterThan(result.arvBase);
    expect(result.eligibleComps).toHaveLength(3);
    expect(result.arvConfidence).toBeGreaterThan(50);
  });
  it('rejects stale, distant, future or unsourced comps', () => {
    expect(() => calculateArv(property, [{ ...comps[0], saleDate: '2020-01-01' }], now)).toThrow(
      'No eligible',
    );
    expect(() => calculateArv(property, [{ ...comps[0], distance: 10 }], now)).toThrow(
      'No eligible',
    );
    expect(() => calculateArv(property, [{ ...comps[0], saleDate: '2030-01-01' }], now)).toThrow(
      'No eligible',
    );
    expect(() => calculateArv(property, [{ ...comps[0], source: '' }], now)).toThrow('No eligible');
  });
  it('does not include a reviewer-excluded sale', () => {
    const result = calculateArv(
      property,
      [...comps, { ...comps[0], id: 'bad', salePrice: 900000, excluded: true }],
      now,
    );
    expect(result.arvBase).toBe(300000);
    expect(result.excludedComps[0].id).toBe('bad');
  });
  it('does not calculate an ARV without a valid subject area', () => {
    expect(() => calculateArv({ sqft: 0 }, comps, now)).toThrow('square footage');
  });
  it('itemizes ranges and applies configured contingency', () => {
    expect(
      calculateRepairs(
        [
          { category: 'roof', low: 10000, expected: 15000, high: 20000 },
          { category: 'paint', quantity: 2, low: 2000, expected: 3000, high: 4000 },
        ],
        10,
      ),
    ).toMatchObject({ repairLow: 15400, repairExpected: 23100, repairHigh: 30800 });
  });
  it('rejects inverted repair ranges', () => {
    expect(() => calculateRepairs([{ low: 100, expected: 50, high: 80 }])).toThrow('ranges');
  });
});

describe('underwriting is deterministic with explicit assumptions', () => {
  it('calculates investor limit and company MAO from each cost', () => {
    const result = underwrite(property);
    // 300000 - 40000 - 54000 - 8000 - 21000 - 9000 = 168000; less fee = 153000
    expect(result.investorMax).toBe(168000);
    expect(result.mao).toBe(153000);
    expect(result.recommendedOffer).toBe(145350);
    expect(result.scenarios.map((s) => s.scenario)).toEqual([
      'BASE',
      'CONSERVATIVE',
      'UPSIDE',
      'BREAK-EVEN',
    ]);
    expect(result.scenarios[1].mao).toBeLessThan(result.mao);
    expect(result.scenarios[2].mao).toBeGreaterThan(result.mao);
  });
  it('allows owner policy and does not impose a 70 percent rule', () => {
    const result = underwrite(property, {
      investorProfitPercent: 10,
      holdingCosts: 5000,
      transactionPercent: 5,
      riskPercent: 1,
      minimumAssignmentFee: 10000,
    });
    expect(result.investorMax).toBe(207000);
    expect(result.mao).toBe(197000);
  });
  it('projects the spread from actual contract and assignment price', () => {
    expect(
      underwrite({ ...property, contractPrice: 150000, targetAssignmentPrice: 180000 })
        .projectedAssignmentFee,
    ).toBe(30000);
  });
  it('does not conceal negative economics or invalid assumptions', () => {
    expect(underwrite({ ...property, repairExpected: 500000 }).mao).toBeLessThan(0);
    expect(() => underwrite({ arvBase: 0 })).toThrow('ARV');
    expect(() => underwrite(property, { investorProfitPercent: 101 })).toThrow('percentage');
  });
});

describe('matching and measurable scores', () => {
  it('matches known preferences with reasons, current funds and reliability', () => {
    const result = matchBuyer(property, buyer, undefined, now);
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(99);
    expect(result.reasons).toContain('Verified, current proof of funds');
  });
  it('never marks expired funds or over-budget buyers eligible', () => {
    expect(
      matchBuyer(property, { ...buyer, proofOfFundsExpiration: '2020-01-01' }, undefined, now)
        .eligible,
    ).toBe(false);
    expect(matchBuyer(property, { ...buyer, maxPrice: 100000 }, undefined, now).eligible).toBe(
      false,
    );
    expect(
      matchBuyer(property, { ...buyer, counties: ['Cape May'] }, undefined, now).eligible,
    ).toBe(false);
  });
  it('suppresses blocked buyers', () => {
    expect(matchBuyer(property, { ...buyer, tier: 'BLOCKED' }, undefined, now)).toMatchObject({
      score: 0,
      eligible: false,
    });
    expect(matchBuyer(property, { ...buyer, doNotContact: true }, undefined, now)).toMatchObject({
      score: 0,
      eligible: false,
    });
  });
  it('supports configurable matching weights', () => {
    expect(
      matchBuyer(
        property,
        { ...buyer, reliabilityScore: 0 },
        {
          geography: 0,
          propertyType: 0,
          price: 0,
          rehab: 0,
          size: 0,
          funds: 0,
          reliability: 100,
          closeSpeed: 0,
        },
        now,
      ).score,
    ).toBe(0);
  });
  it('scores observable signals consistently and keeps probabilities bounded', () => {
    expect(
      scoreLead({
        ...property,
        motivationScore: 90,
        equityPercent: 90,
        askingPrice: 100000,
        condition: 'distressed',
        timelineDays: 10,
      }),
    ).toBeGreaterThan(
      scoreLead({ ...property, motivationScore: 10, equityPercent: 10, askingPrice: 300000 }),
    );
    expect(estimateProbability({ ...property, stage: 'CLOSED' })).toBe(100);
    expect(estimateProbability({ ...property, stage: 'LOST' })).toBe(0);
    expect(estimateProbability(property)).toBeGreaterThan(0);
    expect(estimateProbability(property)).toBeLessThan(100);
  });
  it('normalizes address comparison without changing original display values', () => {
    expect(
      normalizeAddress({
        address: '100  Test ST',
        city: 'ATLANTIC CITY',
        state: 'NJ',
        zip: '08401',
      }),
    ).toBe(
      normalizeAddress({
        address: '100 Test st',
        city: 'Atlantic City',
        state: 'nj',
        zip: '08401',
      }),
    );
  });
});

describe('state transitions and approval gates', () => {
  const contract = {
    ...property,
    stage: 'NEGOTIATION',
    contractPrice: 150000,
    executionDate: '2026-11-01',
    signedDocumentStatus: 'SIGNED',
    contractApproved: true,
    deadlines: [{ dueAt: '2026-11-30', type: 'CLOSING' }],
  };
  it('requires complete evidence and owner approval before a contract', () => {
    expect(validateTransition(property, 'UNDER CONTRACT')).toHaveLength(5);
    expect(validateTransition(contract, 'UNDER CONTRACT')).toEqual([]);
    expect(
      validateTransition({ ...contract, contractApproved: false }, 'UNDER CONTRACT'),
    ).toContain('Owner contract approval is required.');
  });
  it('does not permit bypassing a contract by jumping to dispositions', () => {
    expect(validateTransition(property, 'DISPOSITIONS')).toContain(
      'A signed purchase agreement must be recorded.',
    );
  });
  it('requires explicit owner offer approval and MAO override', () => {
    const offer = { ...property, stage: 'OFFER READY FOR APPROVAL', actualOffer: 160000 };
    expect(validateTransition(offer, 'OFFER SENT')).toContain('Owner offer approval is required.');
    expect(validateTransition(offer, 'OFFER SENT', { offerApproved: true })).toContain(
      'Offer exceeds MAO: explicit owner override required.',
    );
    expect(
      validateTransition(offer, 'OFFER SENT', { offerApproved: true, maoOverride: true }),
    ).toEqual([]);
  });
  it('prevents DNC outreach even with owner approval', () => {
    expect(
      validateTransition({ ...property, doNotContact: true }, 'OFFER SENT', {
        offerApproved: true,
      }),
    ).toContain('Contact is suppressed by do-not-contact or opt-out.');
  });
  it('blocks live external execution without legal and contact requirements', () => {
    expect(
      validateTransition({ ...property, mode: 'LIVE' }, 'OFFER SENT', { offerApproved: true }),
    ).toContain('LEGAL REVIEW REQUIRED: jurisdiction rules not reviewed.');
    expect(
      validateExternalExecution(property, {
        jurisdictionReviewed: true,
        disclosuresVerified: true,
        templateAttorneyApproved: true,
        templateVersion: '1',
        assignmentPermitted: true,
        contactPermitted: true,
        ownerApproved: true,
      }),
    ).toEqual([]);
  });
  it('requires buyer, clear title, funding and owner approval to close', () => {
    expect(validateTransition(contract, 'CLOSED')).toContain('A selected buyer is required.');
    const closed = {
      ...contract,
      stage: 'CLOSING',
      buyerId: 'b1',
      titleStatus: 'CLEAR',
      fundingStatus: 'FUNDED',
      closingApproved: true,
      closingDate: '2026-11-30',
    };
    expect(validateTransition(closed, 'CLOSED')).toEqual([]);
    expect(validateTransition({ ...closed, fundingStatus: 'PENDING' }, 'CLOSED')).toContain(
      'Verified funding status must be FUNDED.',
    );
  });
  it('keeps terminal closed records and unknown stages protected', () => {
    expect(validateTransition({ ...property, stage: 'CLOSED' }, 'NEW LEAD')).toHaveLength(1);
    expect(validateTransition(property, 'NONSENSE')).toHaveLength(1);
    expect(STAGES).toHaveLength(23);
  });
});

describe('adversarial review and realized P&L', () => {
  it('does not label unverified ownership or unresolved title green', () => {
    expect(redTeam({ ...property, ownerVerified: false }, comps, now).grade).toBe('RED');
    expect(redTeam({ ...property, titleStatus: 'ISSUE' }, comps, now).reasons).toContain(
      'Unresolved title issue',
    );
    expect(redTeam(property, comps, now).grade).toBe('GREEN');
  });
  it('separates realized revenue, operating costs, deal costs and projections', () => {
    const result = calculatePnl(
      [
        {
          type: 'REVENUE',
          amount: 15000,
          category: 'Assignment Revenue',
          date: '2026-11-01',
          propertyId: 'p0',
        },
        { type: 'EXPENSE', amount: 1000, category: 'Title', propertyId: 'p0', date: '2026-11-01' },
        { type: 'EXPENSE', amount: 500, category: 'Software', date: '2026-11-01' },
        {
          type: 'EXPENSE',
          amount: 2000,
          category: 'EARNEST MONEY',
          propertyId: 'p1',
          date: '2026-11-01',
        },
      ],
      [{ ...property, id: 'p0', stage: 'CLOSED' }, property],
    );
    expect(result).toMatchObject({
      revenue: 15000,
      assignmentFees: 15000,
      expenses: 1500,
      dealExpenses: 1000,
      operatingExpenses: 500,
      netProfit: 13500,
      projectedRevenue: 15000,
    });
    expect(result.weightedPipeline).toBeGreaterThan(0);
    expect(result.weightedPipeline).toBeLessThan(15000);
  });
  it('uses the selected reporting period and excludes pending/void ledger entries', () => {
    const result = calculatePnl(
      [
        { type: 'REVENUE', amount: 100, date: '2026-11-01' },
        { type: 'REVENUE', amount: 200, date: '2026-10-01' },
        { type: 'REVENUE', amount: 300, date: '2026-11-01', status: 'PENDING' },
      ],
      [],
      'CURRENT MONTH',
      now,
    );
    expect(result.revenue).toBe(100);
    expect(
      calculatePnl([{ type: 'REVENUE', amount: 200, date: '2026-10-01' }], [], 'LAST MONTH', now)
        .revenue,
    ).toBe(200);
  });
  it('adds decimal amounts in cents and rejects negative ledger values', () => {
    expect(
      calculatePnl([
        { type: 'REVENUE', amount: 0.1 },
        { type: 'REVENUE', amount: 0.2 },
      ]).revenue,
    ).toBe(0.3);
    expect(() => calculatePnl([{ type: 'REVENUE', amount: -100 }])).toThrow('nonnegative');
  });
  it('defines bounded agent privileges, validated I/O and escalation', () => {
    expect(AGENTS.length).toBeGreaterThanOrEqual(16);
    expect(
      AGENTS.every(
        (a) =>
          a.readAccess.length &&
          a.writeAccess.length &&
          a.inputSchema &&
          a.outputSchema &&
          a.retryPolicy.maxAttempts === 3,
      ),
    ).toBe(true);
    expect(AGENTS.find((a) => a.name === 'BRIDGE')?.writeAccess).not.toContain('ledger');
  });
});

describe('provider boundaries', () => {
  it('reports unconfigured live providers without fabricating a result', async () => {
    expect(await providerRegistry.property.search('Atlantic', 'LIVE')).toMatchObject({
      status: 'NOT CONFIGURED',
      mode: 'LIVE',
    });
    expect(
      await providerRegistry.ai.analyze({ entityId: 'p1', context: {} }, 'LIVE'),
    ).toMatchObject({ status: 'NOT CONFIGURED' });
  });
  it('labels demo communication simulated and never delivered', async () => {
    const input = {
      to: 'fictional@example.test',
      subject: 'Demo',
      text: 'Demo message',
      idempotencyKey: 'demo-1',
      approved: true,
    };
    expect(await providerRegistry.email.send(input, 'DEMO')).toMatchObject({
      status: 'SIMULATED',
      mode: 'DEMO',
      data: { delivered: false },
    });
    expect(await providerRegistry.email.send(input, 'LIVE')).toMatchObject({
      status: 'NOT CONFIGURED',
      mode: 'LIVE',
    });
  });
  it('rejects unapproved communication even through a development adapter', async () => {
    await expect(
      providerRegistry.email.send(
        {
          to: 'fictional@example.test',
          subject: 'Demo',
          text: 'Demo',
          idempotencyKey: 'unapproved',
          approved: false,
        },
        'DEMO',
      ),
    ).rejects.toThrow();
  });
});
