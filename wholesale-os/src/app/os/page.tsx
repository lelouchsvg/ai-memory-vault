import type { Metadata } from 'next';
import AgenticOS from '@/components/AgenticOS';

export const metadata: Metadata = {
  title: 'Control Tower OS · Agentic Workspace',
  description: 'A persistent command layer for your real estate operation.',
};

export default function AgenticWorkspace() {
  return <AgenticOS />;
}
