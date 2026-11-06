import { test, expect } from '@playwright/test';

async function enterDemo(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Explore the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Your business, in focus.' })).toBeVisible();
}

test('unauthenticated requests cannot read or mutate the CRM', async ({ request }) => {
  expect((await request.get('/api/state?mode=DEMO')).status()).toBe(401);
  expect(
    (
      await request.post('/api/action', {
        data: { action: 'save', mode: 'DEMO', entity: 'tasks', record: { title: 'unauthorized' } },
      })
    ).status(),
  ).toBe(401);
});

test('lead to underwriting, owner approval, contract, buyer, closing and P&L remain usable in the browser', async ({
  page,
}) => {
  test.setTimeout(120000);
  await enterDemo(page);
  await expect(page.getByText('DEMO', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Property workspace' })).toBeVisible();
  await page
    .getByRole('button', { name: /New property|Add property/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  const address = `${Date.now()} Browser Acceptance Lane`;
  await dialog.getByLabel('Street address', { exact: false }).fill(address);
  await dialog.getByLabel('City', { exact: false }).fill('Absecon');
  await dialog.getByLabel('County', { exact: false }).fill('Atlantic');
  await dialog.getByLabel('ZIP code', { exact: false }).fill('08201');
  await dialog.getByLabel('Square feet', { exact: false }).fill('1500');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: `Open ${address}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Open ${address}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: address })).toBeVisible();
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await page.getByRole('button', { name: 'Edit property', exact: true }).click();
  await dialog.getByLabel('Ownership verified from evidence').check();
  await dialog
    .getByLabel('Ownership source', { exact: true })
    .fill('Fictional browser acceptance deed');
  await dialog.getByLabel('Ownership confidence', { exact: false }).fill('95');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Comps', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Comparable sales' })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Add comp', exact: true }).click();
    await dialog.getByLabel('Comparable address', { exact: false }).fill(`${address} Comp ${i}`);
    await dialog.getByLabel('Sale price', { exact: false }).fill(String(300000 + i * 1000));
    await dialog.getByLabel('Square feet', { exact: false }).fill('1500');
    await dialog.getByLabel('Sale date', { exact: false }).fill(past);
    await dialog
      .getByLabel('Source / reference URL', { exact: false })
      .fill('Fictional browser acceptance sale');
    await dialog.getByRole('button', { name: /Save record/ }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole('tab', { name: 'Repairs', exact: true }).click();
  await page.getByRole('button', { name: 'Add estimate', exact: true }).click();
  await dialog.getByLabel('Category', { exact: false }).selectOption('kitchen');
  await dialog.getByLabel('Low estimate', { exact: false }).fill('10000');
  await dialog.getByLabel('Expected estimate', { exact: false }).fill('15000');
  await dialog.getByLabel('High estimate', { exact: false }).fill('20000');
  await dialog
    .getByLabel('Scope, source, and assumptions', { exact: false })
    .fill('Fictional browser acceptance inspection allowance');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Underwriting', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transparent deal economics' })).toBeVisible();
  await page.getByRole('button', { name: 'Recalculate underwriting', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Underwriting');
  const state = await (await page.request.get('/api/state?mode=DEMO')).json();
  const property = state.properties.find((p: any) => p.address === address);
  expect(property.mao).toBeGreaterThan(100000);
  expect(property.riskGrade).not.toBe('RED');
  await page.getByRole('button', { name: /Prepare offer/ }).click();
  await dialog
    .getByLabel('Recommendation and supporting context', { exact: false })
    .fill('Browser owner reviews sourced demo assumptions');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /^Approval Inbox/ }).click();
  await expect(page.getByRole('heading', { name: 'You make the call.' })).toBeVisible();
  const card = page.locator('.approval-card').filter({ hasText: address });
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toContainText('Approved');
  await card.getByRole('button', { name: new RegExp(address) }).click();
  await page.getByRole('tab', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Register reference', exact: true }).click();
  await dialog
    .getByLabel('Document name', { exact: false })
    .fill('Fictional signed purchase evidence');
  await dialog.getByLabel('Document type', { exact: false }).selectOption('Purchase Agreement');
  await dialog
    .getByLabel('Secure storage URL / reference', { exact: false })
    .fill('https://example.test/fictional-contract.pdf');
  await dialog.getByLabel('Document status', { exact: false }).selectOption('SIGNED');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /Update stage/ }).click();
  await dialog.getByLabel('Next stage', { exact: false }).selectOption('UNDER CONTRACT');
  await dialog
    .getByLabel('Reason for transition', { exact: false })
    .fill('Fictional signed contract evidence recorded by owner');
  const contract = Math.floor(property.recommendedOffer);
  await dialog.getByLabel('Contract price', { exact: false }).fill(String(contract));
  await dialog.getByLabel('Execution date', { exact: false }).fill(today);
  await dialog.getByLabel('Closing deadline', { exact: false }).fill(future);
  await dialog
    .getByLabel('Signed document', { exact: false })
    .selectOption({ label: 'Fictional signed purchase evidence · SIGNED' });
  await dialog.getByLabel('I confirm owner approval', { exact: false }).check();
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.detail-header')).toContainText('Under Contract');
  const origin = new URL(page.url()).origin;
  async function api(input: Record<string, any>) {
    const response = await page.request.post('/api/action', {
      headers: { Origin: origin },
      data: { mode: 'DEMO', ...input },
    });
    const result = await response.json();
    expect(response.ok(), JSON.stringify(result)).toBe(true);
    return result.data;
  }
  const buyer = await api({
    action: 'save',
    entity: 'buyers',
    record: {
      name: `Browser Buyer ${Date.now()}`,
      email: `browser-${Date.now()}@example.test`,
      counties: ['Atlantic'],
      markets: ['NJ'],
      propertyTypes: ['SINGLE FAMILY'],
      minPrice: 0,
      maxPrice: 500000,
      maxRehab: 100000,
      minSqft: 1000,
      minBedrooms: 2,
      proofOfFundsStatus: 'VERIFIED',
      proofOfFundsExpiry: future,
      reliabilityScore: 95,
    },
  });
  await page.getByRole('button', { name: 'Refresh workspace' }).click();
  await page.getByRole('tab', { name: 'Buyers', exact: true }).click();
  await page.getByRole('button', { name: 'Find matches', exact: true }).click();
  await expect(page.getByRole('cell', { name: buyer.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select buyer', exact: true }).click();
  await dialog.getByLabel('Committed buyer', { exact: false }).selectOption(buyer.id);
  await dialog
    .getByLabel('Assignment purchase price', { exact: false })
    .fill(String(contract + 20000));
  await dialog
    .getByLabel('Commitment evidence / notes', { exact: false })
    .fill('Fictional browser buyer commitment');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Closing', exact: true }).click();
  await page.getByRole('button', { name: 'Update title record', exact: true }).click();
  await dialog
    .getByLabel('Title company', { exact: false })
    .fill('Fictional browser title company');
  await dialog.getByLabel('Title status', { exact: false }).selectOption('CLEAR');
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Record completed closing', exact: true }).click();
  await dialog.getByLabel('Actual assignment revenue', { exact: false }).fill('20000');
  await dialog
    .getByLabel('Settlement statement reference', { exact: false })
    .fill('Fictional browser settlement');
  await dialog.getByLabel('I confirm the closing', { exact: false }).check();
  await dialog.getByRole('button', { name: /Save record/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.detail-header')).toContainText('Closed');
  await page.getByRole('tab', { name: 'Financials', exact: true }).click();
  await expect(page.locator('.stat-card').filter({ hasText: 'Recorded revenue' })).toContainText(
    '$20,000',
  );
  // The background worker may already hold the FORGE job; await its committed result.
  await expect
    .poll(
      async () => {
        await api({ action: 'runJobs' });
        const closedState = await (await page.request.get('/api/state?mode=DEMO')).json();
        return closedState.properties.find((p: any) => p.id === property.id).postmortem?.outcome;
      },
      { timeout: 15000 },
    )
    .toBe('CLOSED');
  await page.getByRole('button', { name: 'Agent Center', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your operations team' })).toBeVisible();
  const live = await page.request.get('/api/state?mode=LIVE');
  expect(live.status()).toBe(403);
  const csrf = await page.request.post('/api/action', {
    data: { action: 'runJobs', mode: 'DEMO' },
  });
  expect(csrf.status()).toBe(400);
  expect((await csrf.json()).error).toMatch(/origin/i);
  await page.reload();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(page.getByRole('button', { name: `Open ${address}`, exact: true })).toBeVisible();
});

test('document uploads preserve bytes, reject spoofed file types and enforce mode boundaries', async ({
  page,
}) => {
  await enterDemo(page);
  const origin = new URL(page.url()).origin;
  const state = await (await page.request.get('/api/state?mode=DEMO')).json();
  const property = state.properties[0];
  expect(property).toBeDefined();
  const bytes = Buffer.from(
    'DEMO ONLY — fictional document evidence.\nByte-for-byte round trip.\n',
    'utf8',
  );
  const upload = await page.request.post('/api/documents', {
    headers: { Origin: origin },
    multipart: {
      mode: 'DEMO',
      propertyId: property.id,
      type: 'Other',
      file: { name: 'acceptance-evidence.txt', mimeType: 'text/plain', buffer: bytes },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const { document } = await upload.json();
  const download = await page.request.get(`/api/documents/${document.id}`);
  expect(download.ok()).toBe(true);
  expect(await download.body()).toEqual(bytes);
  expect(download.headers()['content-disposition']).toContain('attachment');
  expect(download.headers()['x-content-type-options']).toBe('nosniff');
  const spoof = await page.request.post('/api/documents', {
    headers: { Origin: origin },
    multipart: {
      mode: 'DEMO',
      propertyId: property.id,
      type: 'Other',
      file: { name: 'spoof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') },
    },
  });
  expect(spoof.status()).toBe(400);
  expect((await spoof.json()).error).toMatch(/verified|supported/i);
  const denied = await page.request.post('/api/documents', {
    headers: { Origin: origin },
    multipart: {
      mode: 'LIVE',
      propertyId: property.id,
      type: 'Other',
      file: { name: 'evidence.txt', mimeType: 'text/plain', buffer: bytes },
    },
  });
  expect([400, 403]).toContain(denied.status());
  const after = await (await page.request.get('/api/state?mode=DEMO')).json();
  expect(after.documents.filter((d: any) => d.id === document.id)).toHaveLength(1);
});
