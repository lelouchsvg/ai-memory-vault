/** Providers expose capabilities honestly. Unconfigured live providers fail closed.
 * DEMO simulation is always explicit, and is never delivery or verified public-record evidence. */
import { z } from 'zod';

export type Mode = 'DEMO' | 'LIVE';
export type ProviderResult<T> =
  | {
      status: 'SIMULATED';
      mode: 'DEMO';
      provider: string;
      data: T;
      source: string;
      retrievedAt: string;
    }
  | {
      status: 'NOT CONFIGURED';
      mode: Mode;
      provider: string;
      error: { code: 'PROVIDER_NOT_CONFIGURED'; message: string; retryable: false };
    };

export interface PropertyDataProvider {
  search(query: string, mode: Mode): Promise<ProviderResult<unknown[]>>;
}
export interface ContactProvider {
  lookup(entityId: string, mode: Mode): Promise<ProviderResult<unknown[]>>;
}
export interface EmailProvider {
  send(
    input: { to: string; subject: string; text: string; idempotencyKey: string; approved: boolean },
    mode: Mode,
  ): Promise<ProviderResult<{ simulationId: string; delivered: false }>>;
}
export interface SMSProvider {
  send(
    input: { to: string; text: string; idempotencyKey: string; approved: boolean },
    mode: Mode,
  ): Promise<ProviderResult<{ simulationId: string; delivered: false }>>;
}
export interface DocumentProvider {
  prepare(
    input: {
      templateId: string;
      attorneyApproved: boolean;
      fields: Record<string, string>;
      idempotencyKey: string;
    },
    mode: Mode,
  ): Promise<ProviderResult<{ simulationId: string; executed: false }>>;
}
export interface AIProvider {
  analyze(
    input: { entityId: string; context: unknown },
    mode: Mode,
  ): Promise<ProviderResult<{ summary: string; authoritative: false }>>;
}

const unconfigured = <T>(provider: string, mode: Mode): ProviderResult<T> => ({
  status: 'NOT CONFIGURED',
  mode,
  provider,
  error: {
    code: 'PROVIDER_NOT_CONFIGURED',
    message: `${provider} is NOT CONFIGURED. No external operation was performed. Configure an approved adapter with valid credentials before enabling live use.`,
    retryable: false,
  },
});
const simulated = <T>(provider: string, data: T): ProviderResult<T> => ({
  status: 'SIMULATED',
  mode: 'DEMO',
  provider,
  data,
  source: 'Explicit development simulation; no external service contacted',
  retrievedAt: new Date().toISOString(),
});
const messageSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1).max(100_000),
  idempotencyKey: z.string().min(1),
  approved: z.literal(true),
});

export class UnconfiguredPropertyProvider implements PropertyDataProvider {
  async search(_query: string, mode: Mode) {
    return unconfigured<unknown[]>('Property data', mode);
  }
}
export class UnconfiguredContactProvider implements ContactProvider {
  async lookup(_entityId: string, mode: Mode) {
    return unconfigured<unknown[]>('Contact data', mode);
  }
}
export class DevelopmentEmailProvider implements EmailProvider {
  async send(
    input: { to: string; subject: string; text: string; idempotencyKey: string; approved: boolean },
    mode: Mode,
  ) {
    messageSchema.extend({ subject: z.string().min(1) }).parse(input);
    if (mode === 'LIVE')
      return unconfigured<{ simulationId: string; delivered: false }>('Email', mode);
    return simulated('Email development adapter', {
      simulationId: `demo-email-${input.idempotencyKey}`,
      delivered: false as const,
    });
  }
}
export class DevelopmentSMSProvider implements SMSProvider {
  async send(
    input: { to: string; text: string; idempotencyKey: string; approved: boolean },
    mode: Mode,
  ) {
    messageSchema.parse(input);
    if (mode === 'LIVE')
      return unconfigured<{ simulationId: string; delivered: false }>('SMS', mode);
    return simulated('SMS development adapter', {
      simulationId: `demo-sms-${input.idempotencyKey}`,
      delivered: false as const,
    });
  }
}
export class DevelopmentDocumentProvider implements DocumentProvider {
  async prepare(
    input: {
      templateId: string;
      attorneyApproved: boolean;
      fields: Record<string, string>;
      idempotencyKey: string;
    },
    mode: Mode,
  ) {
    if (mode === 'LIVE')
      return unconfigured<{ simulationId: string; executed: false }>(
        'Transactional documents',
        mode,
      );
    if (!input.templateId || !input.idempotencyKey)
      throw new Error('Template and idempotency key are required.');
    return simulated('Document development adapter', {
      simulationId: `demo-doc-${input.idempotencyKey}`,
      executed: false as const,
    });
  }
}
export class UnconfiguredAIProvider implements AIProvider {
  async analyze(_input: { entityId: string; context: unknown }, mode: Mode) {
    return unconfigured<{ summary: string; authoritative: false }>('AI', mode);
  }
}

export const providerRegistry = {
  property: new UnconfiguredPropertyProvider(),
  contact: new UnconfiguredContactProvider(),
  email: new DevelopmentEmailProvider(),
  sms: new DevelopmentSMSProvider(),
  document: new DevelopmentDocumentProvider(),
  ai: new UnconfiguredAIProvider(),
};

export const INTEGRATION_REQUIREMENTS = [
  {
    name: 'Property data',
    status: 'NOT CONFIGURED',
    requirements:
      'Licensed provider adapter, API credential, approved destination and authorized source',
  },
  {
    name: 'Ownership records',
    status: 'NOT CONFIGURED',
    requirements: 'Lawfully accessible records adapter with source date and confidence',
  },
  {
    name: 'Email',
    status: 'NOT CONFIGURED',
    requirements:
      'Approved email adapter, verified sender, credential, consent checks and owner approval',
  },
  {
    name: 'SMS',
    status: 'NOT CONFIGURED',
    requirements:
      'Approved SMS adapter, authorized sender, credential, consent checks and owner approval',
  },
  {
    name: 'AI',
    status: 'NOT CONFIGURED',
    requirements: 'Approved provider adapter and credential; outputs remain recommendations',
  },
  { name: 'Maps', status: 'NOT CONFIGURED', requirements: 'Maps/geocoding adapter and credential' },
  {
    name: 'Calendar',
    status: 'NOT CONFIGURED',
    requirements: 'Calendar adapter and scoped authorization',
  },
] as const;
