import { test, expect, type Page } from '@playwright/test';

async function enterOs(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Explore the demo/ }).click();
  await page.goto('/os');
  await expect(page.getByRole('textbox', { name: 'Command', exact: true })).toBeVisible();
}

test('agentic OS authenticates requests and isolates demo data from live workspaces', async ({
  page,
  request,
}) => {
  expect((await request.get('/api/os?mode=DEMO')).status()).toBe(401);
  expect(
    (
      await request.post('/api/os', {
        data: { action: 'chat', mode: 'DEMO', message: 'morning brief' },
      })
    ).status(),
  ).toBe(401);
  await enterOs(page);
  expect((await page.request.get('/api/os?mode=LIVE')).status()).toBe(403);
  expect(
    (
      await page.request.post('/api/os', {
        headers: { Origin: 'https://untrusted.example.test' },
        data: { action: 'chat', mode: 'DEMO', message: 'morning brief' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post('/api/os', {
        headers: { Origin: 'http://localhost:3000' },
        data: { action: 'chat', mode: 'LIVE', message: 'morning brief' },
      })
    ).status(),
  ).toBe(403);
});

test('command input produces a persisted real brief and exposes its actual console events', async ({
  page,
}) => {
  await enterOs(page);
  const response = page.waitForResponse(
    (item) => new URL(item.url()).pathname === '/api/os' && item.request().method() === 'POST',
  );
  await page.getByRole('textbox', { name: 'Command', exact: true }).fill('morning brief');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  const queued = await (await response).json();
  expect(queued.ok).toBe(true);
  const runId = queued.data.runId;
  await expect
    .poll(
      async () => {
        const state = await (await page.request.get('/api/os?mode=DEMO')).json();
        return state.runs.find((run: any) => run.id === runId)?.status;
      },
      { timeout: 20000 },
    )
    .toBe('COMPLETED');
  const state = await (await page.request.get('/api/os?mode=DEMO')).json();
  const reply = state.messages.find(
    (message: any) => message.runId === runId && String(message.role).toUpperCase() === 'ASSISTANT',
  );
  expect(reply?.content).toBeTruthy();
  await expect(page.getByRole('log', { name: 'Assistant transcript' })).toContainText(
    reply.content.slice(0, 90),
  );
  await page.getByRole('button', { name: 'Toggle agent console', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Agent console' })).toBeVisible();
  expect(state.events.some((event: any) => event.runId === runId)).toBe(true);
  await page.getByRole('button', { name: /^Event log/ }).click();
  const claimed = state.events.find(
    (event: any) => event.runId === runId && event.message.includes('claimed'),
  );
  expect(claimed).toBeDefined();
  await expect(page.getByRole('log', { name: 'Agent console' })).toContainText(claimed.message);
  await page.reload();
  await expect(page.getByRole('log', { name: 'Assistant transcript' })).toContainText(
    'morning brief',
  );
});

test('memory notes can be created, recalled, edited and deleted across reloads', async ({
  page,
}) => {
  await enterOs(page);
  const title = `OS browser memory ${Date.now()}`;
  const content = 'Fictional preference: Atlantic County, moderate inspected rehab.';
  await page.getByRole('button', { name: 'Add memory note', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New vault note' });
  await dialog.getByLabel('Memory title', { exact: true }).fill(title);
  await dialog.getByLabel('Memory content', { exact: true }).fill(content);
  await dialog.getByLabel('Memory tags', { exact: true }).fill('qa, preferences');
  await dialog.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const noteButton = page.getByRole('button', { name: new RegExp(title) });
  await expect(noteButton).toBeVisible();
  const reply = page.waitForResponse(
    (item) => new URL(item.url()).pathname === '/api/os' && item.request().method() === 'POST',
  );
  await page.getByRole('textbox', { name: 'Command', exact: true }).fill('recall memory');
  await page.getByRole('button', { name: 'Send command', exact: true }).click();
  const queued = await (await reply).json();
  await expect
    .poll(
      async () => {
        const state = await (await page.request.get('/api/os?mode=DEMO')).json();
        return state.runs.find((run: any) => run.id === queued.data.runId)?.status;
      },
      { timeout: 20000 },
    )
    .toBe('COMPLETED');
  await expect(page.getByRole('log', { name: 'Assistant transcript' })).toContainText(title);
  await noteButton.click();
  const edit = page.getByRole('dialog', { name: 'Edit vault note' });
  const updated = 'Fictional revised preference: verify ownership before underwriting.';
  await edit.getByLabel('Memory content', { exact: true }).fill(updated);
  await edit.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page.reload();
  await noteButton.click();
  await expect(edit.getByLabel('Memory content', { exact: true })).toHaveValue(updated);
  await edit.getByRole('button', { name: 'Delete note', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(noteButton).not.toBeVisible();
});
