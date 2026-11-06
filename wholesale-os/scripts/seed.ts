import { createHash } from 'node:crypto';
import { pool, transaction, type DB } from '../src/lib/db';
import { DEFAULT_SETTINGS } from '../src/lib/service';
import {
  STAGES,
  AGENTS,
  DEFAULT_POLICY,
  calculateArv,
  calculateRepairs,
  underwrite,
  estimateProbability,
  scoreLead,
  redTeam,
  matchBuyer,
} from '../src/lib/domain';

type R = Record<string, any>;
const DAY = 86400000;
const id = (key: string) => {
  const h = createHash('sha256')
    .update('wholesale-demo-v1:' + key)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const later = (days: number) => new Date(Date.now() + days * DAY).toISOString();
async function put(db: DB, table: string, key: string, data: R, refs: R = {}) {
  const columns = ['id', 'mode', 'data', ...Object.keys(refs)];
  const vals = [id(key), 'DEMO', JSON.stringify({ ...data, demo: true }), ...Object.values(refs)];
  await db.query(
    `INSERT INTO ${table}(${columns.join(',')}) VALUES(${vals.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT(id) DO NOTHING`,
    vals,
  );
  return id(key);
}
export async function seedDemo() {
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('wholesale-demo-seed-v1'))");
    const exists = await db.query(
      "SELECT count(*)::int AS count FROM properties WHERE mode='DEMO' AND id=$1",
      [id('property:0')],
    );
    if (exists.rows[0].count > 0) {
      console.log(`Fictional DEMO dataset already seeded; preserved existing records`);
      return;
    }
    const settings: R = { ...DEFAULT_SETTINGS, onboardingComplete: false };
    await db.query(
      "INSERT INTO settings(mode,data) VALUES('DEMO',$1) ON CONFLICT(mode) DO NOTHING",
      [JSON.stringify(settings)],
    );
    await db.query(
      "INSERT INTO settings(mode,data) VALUES('LIVE',$1) ON CONFLICT(mode) DO NOTHING",
      [
        JSON.stringify({
          ...DEFAULT_SETTINGS,
          companyName: 'Your company',
          primaryMarket: '',
          targetCounties: [],
        }),
      ],
    );
    const names = [
      'Jordan Ellis',
      'Morgan Reed',
      'Casey Bennett',
      'Avery Carter',
      'Taylor Brooks',
      'Riley Hayes',
      'Jamie Quinn',
      'Drew Parker',
      'Alex Jordan',
      'Cameron Blake',
      'Robin West',
      'Dana Lewis',
      'Skyler Grant',
      'Rowan Kelly',
      'Peyton Lee',
      'Sam Rivers',
      'Reese Howard',
      'Finley Gray',
    ];
    for (let i = 0; i < names.length; i++)
      await put(db, 'sellers', `seller:${i}`, {
        name: names[i],
        preferredName: names[i].split(' ')[0],
        email: `demo.seller${i + 1}@example.test`,
        phone: `+1609555${String(1000 + i).slice(-4)}`,
        status: ['HOT', 'WARM', 'NURTURE', 'QUALIFIED', 'CONNECTED', 'NEW'][i % 6],
        contactSource: 'DEMO fictional referral',
        consent: i % 4 !== 0,
        doNotContact: i === 17,
        motivationCategory: ['Inherited property', 'Downsizing', 'Vacant property'][i % 3],
        motivationNotes: 'Fictional demo scenario; verify actual seller circumstances.',
        timeline: '30–60 days',
        lastContact: ago(i + 1),
        nextFollowUp: later((i % 7) - 2),
        notes: 'DEMO — fictional contact. No external messages are sent.',
      });
    const buyers: R[] = [];
    for (let i = 0; i < 34; i++) {
      const buyer = {
        id: id(`buyer:${i}`),
        name: `${['Harbor', 'Pine', 'Atlantic', 'Keystone', 'Summit', 'Bayview'][i % 6]} Capital ${i + 1}`,
        company: `Demo Investment Group ${i + 1}`,
        email: `demo.buyer${i + 1}@example.test`,
        phone: `+1609555${String(2000 + i).slice(-4)}`,
        buyerType: ['FLIPPER', 'LANDLORD', 'BRRRR', 'DEVELOPER'][i % 4],
        tier: ['PREFERRED', 'VIP', 'ACTIVE', 'VERIFIED', 'NEW'][i % 5],
        counties: i % 4 === 0 ? ['Cape May'] : ['Atlantic', 'Cape May'],
        markets: ['NJ'],
        zipCodes: [],
        propertyTypes: ['SINGLE FAMILY', 'DUPLEX'],
        minPrice: 80000,
        maxPrice: 250000 + i * 5000,
        maxRehab: 60000 + i * 1000,
        minBedrooms: 2,
        minSqft: 800,
        targetMargin: 20,
        minimumSpread: 25000,
        reliabilityScore: 65 + (i % 30),
        activityScore: 50 + i,
        proofOfFundsStatus: i % 9 === 0 ? 'EXPIRED' : 'VERIFIED',
        proofOfFundsExpiry: i % 9 === 0 ? ago(10) : later(120),
        proofOfFundsExpiration: i % 9 === 0 ? ago(10) : later(120),
        closeSpeed: 14 + (i % 14),
        dealsPurchased: i % 6,
        notes: 'DEMO — fictional investment preferences',
        lastContact: ago(i % 20),
      };
      await put(db, 'buyers', `buyer:${i}`, buyer);
      buyers.push(buyer);
    }
    const streets = [
      'Cedar Avenue',
      'Magnolia Drive',
      'Pine Street',
      'Bayview Road',
      'Oak Lane',
      'Atlantic Avenue',
      'Maple Court',
      'Walnut Street',
      'Harbor Drive',
      'Spruce Avenue',
      'Birch Lane',
      'Willow Court',
    ];
    const cities = [
      'Egg Harbor Township',
      'Absecon',
      'Galloway',
      'Somers Point',
      'Pleasantville',
      'Northfield',
    ];
    const sources = [
      'Referral',
      'CSV import',
      'Direct mail',
      'Public record upload',
      'Website inquiry',
    ];
    const properties: R[] = [];
    for (let i = 0; i < STAGES.length * 2; i++) {
      const stage = STAGES[Math.floor(i / 2)];
      const propertyId = id(`property:${i}`);
      const contract =
        STAGES.indexOf(stage as never) >= STAGES.indexOf('UNDER CONTRACT' as never) &&
        STAGES.indexOf(stage as never) <= STAGES.indexOf('CLOSED' as never);
      const closed = stage === 'CLOSED';
      const titleIssue = i === 25 || i === 29;
      let p: R = {
        id: propertyId,
        address: `${101 + i * 7} ${streets[i % streets.length]}`,
        city: cities[i % 6],
        county: 'Atlantic',
        state: 'NJ',
        zip: ['08234', '08201', '08205', '08244', '08232', '08225'][i % 6],
        propertyType: i % 11 === 0 ? 'DUPLEX' : 'SINGLE FAMILY',
        bedrooms: 3 + (i % 2),
        bathrooms: 2,
        sqft: 1350 + (i % 5) * 110,
        lotSize: 7000,
        yearBuilt: 1960 + i,
        occupancyStatus: ['Vacant', 'Owner occupied', 'Tenant occupied'][i % 3],
        condition: 'Moderate rehab',
        leadSource: sources[i % 5],
        source: 'DEMO fictional data set',
        sourceDate: ago(20 + i),
        listingPrice: 175000 + i * 1000,
        sellerAskingPrice: 160000 + i * 500,
        askingPrice: 160000 + i * 500,
        ownershipVerified: i >= 6,
        ownershipConfidence: i >= 6 ? 95 : 35,
        ownershipSource: 'DEMO fictional county tax record',
        ownershipRetrievedAt: ago(12),
        sellerId: id(`seller:${i % names.length}`),
        stage,
        titleStatus: closed
          ? 'CLOSED'
          : titleIssue
            ? 'ISSUE'
            : contract
              ? 'TITLE OPEN'
              : 'NOT STARTED',
        leadScore: 65 + (i % 30),
        assignedAgent: 'SCOUT',
        notes:
          'DEMO — all people, addresses, sources and financials in this record are fictional training data.',
        nextAction: contract
          ? 'Review closing checklist'
          : 'Verify sources and complete underwriting',
        nextActionDue: later((i % 8) - 2),
        probability: 40 + (i % 50),
      };
      const compData: R[] = Array.from({ length: 3 }, (_, j) => ({
        id: id(`comp:${i}:${j}`),
        propertyId,
        address: `${500 + i * 3 + j} Comparable Lane`,
        city: p.city,
        state: 'NJ',
        saleDate: ago(40 + j * 20),
        salePrice: 330000 + i * 1000 + j * 14000,
        sqft: p.sqft + (j - 1) * 60,
        distance: 0.3 + j * 0.2,
        distanceMiles: 0.3 + j * 0.2,
        propertyType: p.propertyType,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        source: 'DEMO fictional recorded sale',
        retrievedAt: ago(10),
        excluded: false,
      }));
      const repairData: R[] = [
        {
          id: id(`repair:${i}:0`),
          propertyId,
          category: 'Kitchen',
          low: 10000,
          expected: 15000,
          high: 21000,
          assumption: 'DEMO cabinet and appliance allowance; inspection required',
        },
        {
          id: id(`repair:${i}:1`),
          propertyId,
          category: 'Paint / flooring',
          low: 10000,
          expected: 15000,
          high: 20000,
          assumption: 'DEMO cosmetic rehab; actual condition not verified',
        },
      ];
      const arv = calculateArv(p, compData);
      const repairs = calculateRepairs(repairData, 15);
      p = { ...p, ...arv, ...repairs };
      const numbers = underwrite(p, {
        ...DEFAULT_POLICY,
        minimumAssignmentFee: 15000,
        targetInvestorMargin: 20,
        transactionCosts: 18000,
        holdingCosts: 12000,
        riskAllowance: 10000,
      });
      p = { ...p, ...numbers };
      const risk = redTeam(p, compData);
      p.riskGrade = titleIssue ? 'RED' : risk.grade;
      p.riskReasons = titleIssue ? ['DEMO title lien requires professional review'] : risk.reasons;
      p.riskMitigations = risk.mitigations;
      p.leadScore = scoreLead(p);
      p.probability = closed ? 100 : estimateProbability(p);
      p.underwrittenAt = ago(5);
      p.underwritingRevision = `demo-${i}-v1`;
      p.underwriting = { ...numbers, calculatedAt: ago(5) };
      p.targetAssignmentPrice = p.investorMax;
      p.projectedAssignmentFee = 15000;
      p.weightedPipeline = closed ? 0 : Math.round(p.projectedAssignmentFee * p.probability) / 100;
      const offerStage =
        STAGES.indexOf(stage as never) >= STAGES.indexOf('OFFER SENT' as never) &&
        STAGES.indexOf(stage as never) <= STAGES.indexOf('CLOSED' as never);
      if (offerStage) {
        p.offerApproved = true;
        p.actualOffer = p.recommendedOffer;
        p.offerDeliveryStatus = 'DEMO SIMULATED';
      }
      if (contract) {
        p.contractApproved = true;
        p.contractApprovedBy = 'demo-owner';
        p.contractPrice = Math.round(p.mao - 3000);
        p.executionDate = ago(10);
        p.closingDate = closed ? ago(3) : later(14);
        p.signedDocumentId = id(`document:${i}`);
        p.signedDocumentStatus = 'SIGNED';
        p.targetAssignmentPrice = p.contractPrice + 15000;
      }
      if (
        STAGES.indexOf(stage as never) >= STAGES.indexOf('BUYER COMMITTED' as never) &&
        STAGES.indexOf(stage as never) <= STAGES.indexOf('CLOSED' as never)
      ) {
        p.selectedBuyerId = id('buyer:1');
        p.buyerId = p.selectedBuyerId;
      }
      if (closed) {
        p.actualAssignmentFee = 14000 + i * 100;
        p.closedAt = ago(3);
        p.fundingStatus = 'FUNDED';
      }
      await put(db, 'properties', `property:${i}`, p, {
        deal_id: `NJ-ATL-${String(100 + i).padStart(6, '0')}`,
        seller_id: p.sellerId,
      });
      properties.push(p);
      for (let j = 0; j < compData.length; j++)
        await put(db, 'comps', `comp:${i}:${j}`, compData[j], { property_id: propertyId });
      for (let j = 0; j < repairData.length; j++)
        await put(db, 'repairs', `repair:${i}:${j}`, repairData[j], { property_id: propertyId });
      await put(
        db,
        'tasks',
        `task:${i}`,
        {
          title: p.nextAction,
          description: 'DEMO operational checklist',
          department: contract ? 'ESCROW' : 'NINJA',
          assignedAgent: contract ? 'ESCROW' : 'VERIFY',
          priority: i % 5 === 0 ? 'HIGH' : 'MEDIUM',
          status: i % 7 === 0 ? 'BLOCKED' : 'READY',
          dueDate: p.nextActionDue,
          dedupeKey: `seed-task:${i}`,
        },
        { property_id: propertyId, seller_id: p.sellerId },
      );
      await put(
        db,
        'transactions',
        `expense:${i}`,
        {
          type: 'EXPENSE',
          category: i % 2 ? 'Data' : 'Marketing',
          amount: 125 + i * 10,
          date: ago(i % 50),
          description: 'DEMO fictional acquisition expense',
          leadSource: p.leadSource,
          reference: `demo:expense:${i}`,
        },
        { property_id: propertyId },
      );
      if (stage === 'OFFER READY FOR APPROVAL')
        await put(
          db,
          'approvals',
          `approval:${i}`,
          {
            action: 'SEND SELLER OFFER',
            status: 'PENDING',
            amount: p.recommendedOffer,
            financialImpact: p.recommendedOffer,
            risk: p.riskGrade,
            reason: 'DEMO underwriting recommendation ready for owner review',
            recommendedAction: 'Review assumptions and approve or revise',
            payload: { amount: p.recommendedOffer, underwritingRevision: p.underwritingRevision },
            supportingData: { mao: p.mao, arvBase: p.arvBase, repairExpected: p.repairExpected },
            requestedBy: 'DEMO SCOUT',
            requestedAt: ago(1),
          },
          { property_id: propertyId, seller_id: p.sellerId },
        );
      if (contract) {
        await put(
          db,
          'documents',
          `document:${i}`,
          {
            name: 'DEMO executed-contract reference',
            type: 'Purchase Agreement',
            status: 'SIGNED',
            approvalStatus: 'APPROVED',
            version: 1,
            source: 'DEMO fictional contract — no legal effect',
            signedAt: ago(10),
            content:
              'DEMO ONLY. No contract clauses or enforceable legal terms. Simulated evidence for workflow testing.',
          },
          { property_id: propertyId },
        );
        await put(
          db,
          'closings',
          `closing:${i}`,
          {
            titleCompany: 'DEMO Harbor Closing',
            attorney: 'DEMO legal reviewer',
            titleStatus: p.titleStatus,
            closingDate: p.closingDate,
            fundingStatus: closed ? 'FUNDED' : 'PENDING',
            notes: titleIssue
              ? 'DEMO lien issue — do not advance until cleared'
              : 'DEMO fictional closing checklist',
          },
          { property_id: propertyId },
        );
        await put(
          db,
          'deadlines',
          `deadline:${i}`,
          { type: 'CLOSING', dueDate: p.closingDate, status: closed ? 'DONE' : 'OPEN' },
          { property_id: propertyId },
        );
        for (const buyer of buyers.slice(1, 6)) {
          const m = matchBuyer(p, buyer, settings.buyerWeights);
          if (m.eligible)
            await put(
              db,
              'matches',
              `match:${i}:${buyer.id}`,
              {
                score: m.score,
                reasons: m.reasons,
                status: p.selectedBuyerId === buyer.id ? 'SELECTED' : 'SUGGESTED',
                buyerName: buyer.name,
                matchedAt: ago(2),
              },
              { property_id: propertyId, buyer_id: buyer.id },
            );
        }
      }
      if (closed)
        await put(
          db,
          'transactions',
          `revenue:${i}`,
          {
            type: 'REVENUE',
            category: 'Assignment Fee',
            amount: p.actualAssignmentFee,
            date: p.closedAt,
            description: 'DEMO fictional realized assignment fee',
            reference: `closing:${propertyId}`,
          },
          { property_id: propertyId },
        );
      await db.query(
        "INSERT INTO audit_log(id,mode,actor,actor_type,action,entity,entity_id,property_id,new_value,reason,source,created_at) VALUES($1,'DEMO','DEMO SEED','SYSTEM','DEMO_RECORD_CREATED','properties',$2,$2,$3,'Fictional demo training record','DEMO SEED',$4)",
        [
          id(`audit:${i}`),
          propertyId,
          JSON.stringify({ stage: p.stage, dealId: `NJ-ATL-${String(100 + i).padStart(6, '0')}` }),
          ago(20 + i),
        ],
      );
    }
    for (const agent of AGENTS) {
      await db.query(
        "INSERT INTO agent_status(mode,name,status) VALUES('DEMO',$1,'ACTIVE') ON CONFLICT DO NOTHING",
        [agent.name],
      );
    }
    for (let i = 0; i < 10; i++)
      await db.query(
        "INSERT INTO agent_runs(id,mode,property_id,agent,status,output,started_at,completed_at) VALUES($1,'DEMO',$2,$3,'COMPLETED',$4,$5,$6)",
        [
          id(`run:${i}`),
          properties[i].id,
          ['SCOUT', 'NUMBERS', 'RED TEAM', 'BRIDGE', 'OPS'][i % 5],
          JSON.stringify({
            demo: true,
            message: 'DEMO seeded deterministic review',
            leadScore: properties[i].leadScore,
          }),
          ago(1 + i / 24),
          ago(1 + i / 24 - 0.00001),
        ],
      );
    await put(
      db,
      'notifications',
      'notification:0',
      {
        title: 'DEMO title issue requires owner review',
        severity: 'HIGH',
        read: false,
        dedupeKey: 'seed:title',
      },
      { property_id: properties[25].id },
    );
    console.log(
      `Seeded ${properties.length} DEMO properties, ${names.length} sellers and ${buyers.length} buyers. LIVE remains empty.`,
    );
  });
}
if (process.argv[1]?.endsWith('seed.ts'))
  seedDemo()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
