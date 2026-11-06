import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ fetch: vi.fn(), close: vi.fn() }));
vi.mock('undici', () => ({
  fetch: transport.fetch,
  ProxyAgent: class {
    close = transport.close;
  },
}));
import { getOsPlannerStatus, resolveOsPlan, validateAiPlan } from './os-ai';
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.clearAllMocks());
describe('bounded optional AI planner', () => {
  it('reports the local engine honestly and needs no network or model', async () => {
    vi.stubEnv('OS_AI_PROVIDER', '');
    vi.stubEnv('OS_AI_API_KEY', '');
    vi.stubEnv('OS_AI_MODEL', '');
    expect(getOsPlannerStatus()).toMatchObject({
      provider: 'LOCAL',
      aiConfigured: false,
      claudeConnected: false,
      codexConnected: false,
    });
    expect(await resolveOsPlan('plan today', { mode: 'DEMO' })).toBeNull();
  });
  it('recognizes complete configuration without exposing credentials', () => {
    vi.stubEnv('OS_AI_PROVIDER', 'openai');
    vi.stubEnv('OS_AI_API_KEY', 'test-private-value');
    vi.stubEnv('OS_AI_MODEL', 'configured-model');
    expect(getOsPlannerStatus().aiConfigured).toBe(true);
    expect(JSON.stringify(getOsPlannerStatus())).not.toContain('test-private-value');
  });
  it('accepts only a bounded skill proposal and omits nullable values', () => {
    expect(
      validateAiPlan({
        skillId: 'underwrite',
        propertyQuery: 'NJ-ATL-000100',
        amount: null,
        reason: null,
      }),
    ).toEqual({ skillId: 'underwrite', propertyQuery: 'NJ-ATL-000100' });
    for (const skillId of ['approve', 'sign_contract', 'shell', 'send_email', 'transfer_funds'])
      expect(() =>
        validateAiPlan({ skillId, propertyQuery: null, amount: null, reason: null }),
      ).toThrow();
    expect(() =>
      validateAiPlan({ skillId: 'prepare_offer', propertyQuery: null, amount: -100, reason: null }),
    ).toThrow();
    expect(() =>
      validateAiPlan({
        skillId: 'underwrite',
        propertyQuery: null,
        amount: null,
        reason: null,
        sql: 'DROP TABLE properties',
      }),
    ).toThrow();
  });
  it('uses structured output over the configured proxy and limits the context sent', async () => {
    vi.stubEnv('OS_AI_PROVIDER', 'openai');
    vi.stubEnv('OS_AI_API_KEY', 'unit-test-only');
    vi.stubEnv('OS_AI_MODEL', 'configured-model');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy:8080');
    const plan = {
      skillId: 'underwrite',
      propertyQuery: 'NJ-ATL-000100',
      amount: null,
      reason: null,
    };
    transport.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(plan) }] }],
      }),
    });
    expect(
      await resolveOsPlan('underwrite NJ-ATL-000100', {
        mode: 'DEMO',
        properties: [
          { id: 'one', dealId: 'NJ-ATL-000100', address: 'Selected test property' },
          { id: 'two', dealId: 'NJ-ATL-000101', address: 'Unrelated private address' },
        ],
      }),
    ).toMatchObject({ skillId: 'underwrite' });
    const [url, init] = transport.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const request = JSON.parse(init.body);
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(request.input).not.toContain('Unrelated private address');
    expect(request.tools).toBeUndefined();
    expect(transport.close).toHaveBeenCalledOnce();
  });
  it('fails closed on invalid model output without returning a tool invocation', async () => {
    vi.stubEnv('OS_AI_PROVIDER', 'openai');
    vi.stubEnv('OS_AI_API_KEY', 'unit-test-only');
    vi.stubEnv('OS_AI_MODEL', 'configured-model');
    transport.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          { content: [{ type: 'output_text', text: '{"skillId":"shell","command":"rm"}' }] },
        ],
      }),
    });
    await expect(resolveOsPlan('arbitrary text', { mode: 'DEMO' })).rejects.toThrow('invalid plan');
  });
});
