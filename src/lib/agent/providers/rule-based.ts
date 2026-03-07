import { matchAgentAction } from '../rule-matcher';
import type { AgentProvider } from '../types';

export function createRuleBasedAgentProvider(): AgentProvider {
  return {
    id: 'rule-based',
    decide({ message, galaxy }) {
      return matchAgentAction(message, galaxy);
    },
  };
}
