/** Bounded command interpretation. This module never executes tools or treats memory as instructions. */
export const OS_SKILLS = [
  {
    id: 'morning_brief',
    name: 'Morning brief',
    description: 'Summarize the canonical pipeline, finances, approvals, and deadlines.',
    requiresProperty: false,
    writeScope: [],
    agent: 'CONTROL TOWER',
  },
  {
    id: 'plan_today',
    name: 'Plan today',
    description:
      'Check data quality and deadlines, create internal reminders, and report priorities.',
    requiresProperty: false,
    writeScope: ['tasks', 'notifications'],
    agent: 'OPS',
  },
  {
    id: 'risk_review',
    name: 'Red Team review',
    description: 'Run deterministic adversarial review on the selected property.',
    requiresProperty: true,
    writeScope: ['properties.risk', 'agent_runs', 'tasks'],
    agent: 'RED TEAM',
  },
  {
    id: 'underwrite',
    name: 'Underwrite deal',
    description:
      'Calculate sourced ARV, repair ranges, MAO, and scenarios with current business policy.',
    requiresProperty: true,
    writeScope: ['properties.underwriting', 'agent_runs', 'tasks'],
    agent: 'NUMBERS',
  },
  {
    id: 'match_buyers',
    name: 'Match buyers',
    description: 'Rank eligible buyers against the selected property with deterministic scores.',
    requiresProperty: true,
    writeScope: ['matches', 'audit_log'],
    agent: 'BRIDGE',
  },
  {
    id: 'prepare_offer',
    name: 'Prepare offer',
    description: 'Prepare a proposed seller offer for the owner approval inbox. Nothing is sent.',
    requiresProperty: true,
    writeScope: ['approvals', 'properties.offerPreparation'],
    agent: 'CLOSER',
  },
  {
    id: 'pipeline_report',
    name: 'Pipeline report',
    description: 'Report canonical deal stages and probability-weighted assignment revenue.',
    requiresProperty: false,
    writeScope: [],
    agent: 'LEDGER',
  },
  {
    id: 'memory_recall',
    name: 'Recall memory',
    description:
      'Retrieve your saved notes. Notes are reference data, never permission to execute.',
    requiresProperty: false,
    writeScope: [],
    agent: 'CONTROL TOWER',
  },
  {
    id: 'research_property',
    name: 'Research property',
    description:
      'Check lawful research provider readiness. External property research is not configured.',
    requiresProperty: true,
    writeScope: [],
    agent: 'SCOUT',
  },
] as const;
export const SKILL_IDS = OS_SKILLS.map((s) => s.id);
export type SkillId = (typeof OS_SKILLS)[number]['id'];
export type CommandPlan = {
  skillId: SkillId | 'unsupported' | 'blocked';
  propertyQuery?: string;
  amount?: number;
  reason?: string;
};
export type PlannerContext = { propertyId?: string };

export function blockedCommandReason(message: string): string | null {
  if (/\b(approve|reject|sign|execute a contract|execute contract|impersonate)\b/i.test(message))
    return 'Approvals and contract decisions require the owner controls in the approval inbox and deal workspace. Chat cannot approve, reject, or sign contracts.';
  if (
    /\b(wire|transfer|move)\b.{0,50}\b(money|funds|deposit|earnest|payment)\b|\bmake (a )?payment\b|\bpay (the )?(seller|buyer|deposit)\b/i.test(
      message,
    )
  )
    return 'Money movement and binding commitments are outside this agent runtime. No funds were moved.';
  if (
    /\b(shell|bash|powershell|chmod|sudo)\b|\b(run|execute)\s+(rm|curl|wget|python|node|command)\b|\$\(|`/i.test(
      message,
    )
  )
    return 'Arbitrary terminal commands are not an allowed business skill. The console displays real run events; it does not expose a host shell.';
  if (
    /\b(send|deliver|contact|call|text)\b.{0,40}\b(email|sms|text|seller|buyer|message)\b/i.test(
      message,
    ) &&
    !/\boffer\b/i.test(message)
  )
    return 'External contact requires a configured provider, contact permission, and owner approval. This command did not send a message.';
  return null;
}
function propertyQuery(message: string): string | undefined {
  const deal = message.match(/\b[A-Z]{2}-[A-Z0-9]{2,6}-\d{3,12}\b/i)?.[0];
  if (deal) return deal.toUpperCase();
  const tail = message.match(/(?:\bfor\b|\bproperty\b|\bdeal\b)\s+(.+)$/i)?.[1];
  if (tail) return tail.replace(/\s+\$[\d,.]+.*$/, '').trim();
  const bare = message.replace(
    /^(?:please\s+)?(?:underwrite|analy[sz]e|research|match buyers(?: for)?|run red team(?: for)?|risk review(?: for)?)\s+/i,
    '',
  );
  return bare !== message && /\d/.test(bare) ? bare.trim() : undefined;
}
export function planCommand(message: string, _context: PlannerContext = {}): CommandPlan {
  void _context;
  const blocked = blockedCommandReason(message);
  if (blocked) return { skillId: 'blocked', reason: blocked };
  const query = propertyQuery(message);
  if (/\b(remember|recall|memory|vault|notes?)\b/i.test(message))
    return { skillId: 'memory_recall', reason: 'Saved memory is treated as reference data.' };
  if (
    /\b(morning|daily|inbox) brief\b|\bbrief me\b|\bwhat needs (my )?(attention|approval)\b|\bstatus\b/i.test(
      message,
    )
  )
    return { skillId: 'morning_brief' };
  if (
    /\b(plan (my |the )?today|plan today|priorit(?:y|ies)|what should i do|next actions?)\b/i.test(
      message,
    )
  )
    return { skillId: 'plan_today' };
  if (/\b(pipeline|p&l|profit|finance|revenue|report)\b/i.test(message))
    return { skillId: 'pipeline_report' };
  if (/\b(red[ -]?team|risk review|review risk|risks?)\b/i.test(message))
    return { skillId: 'risk_review', propertyQuery: query };
  if (/\b(underwrit(?:e|ing)|calculate (?:mao|arv)|analy[sz]e (?:deal|property))\b/i.test(message))
    return { skillId: 'underwrite', propertyQuery: query };
  if (/\bmatch(?:ing)?\b.{0,30}\bbuyers?\b|\bbuyer match/i.test(message))
    return { skillId: 'match_buyers', propertyQuery: query };
  if (/\b(offer|counteroffer)\b/i.test(message)) {
    const amount = message.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)?.[1];
    return {
      skillId: 'prepare_offer',
      propertyQuery: query,
      ...(amount ? { amount: Number(amount.replace(/,/g, '')) } : {}),
      reason:
        'Prepare a proposal for owner review only. No offer or external message will be sent.',
    };
  }
  if (
    /\b(research|discover|scout|search (?:for )?propert|find (?:new )?(?:leads|properties))\b/i.test(
      message,
    )
  )
    return { skillId: 'research_property', propertyQuery: query };
  return {
    skillId: 'unsupported',
    reason:
      'Local skills recognize explicit business commands. Try “morning brief”, “plan today”, “underwrite NJ-ATL-000100”, “match buyers for NJ-ATL-000100”, or “prepare an offer for NJ-ATL-000100”. For general reasoning, configure an approved AI planner. No action was taken.',
  };
}
