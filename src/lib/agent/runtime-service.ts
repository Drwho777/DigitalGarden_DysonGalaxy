import { getGalaxyData } from '../galaxy-data';
import { createRuleBasedAgentProvider } from './providers/rule-based';
import { createAgentService } from './service';

export const ruleBasedAgentService = createAgentService({
  loadGalaxy: getGalaxyData,
  provider: createRuleBasedAgentProvider(),
});
