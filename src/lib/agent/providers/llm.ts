import type { AgentPromptFactory, AgentProvider } from '../types';

export interface CreateLlmAgentProviderOptions {
  promptFactory?: AgentPromptFactory;
}

const defaultPromptFactory: AgentPromptFactory = {
  createSystemPrompt() {
    return 'Future system prompt placeholder for the Digital Garden agent.';
  },
  createRoutePrompt({ message }) {
    return message;
  },
};

export function createLlmAgentProvider(
  options: CreateLlmAgentProviderOptions = {},
): AgentProvider {
  const promptFactory = options.promptFactory ?? defaultPromptFactory;

  return {
    id: 'llm',
    async decide(input) {
      const systemPrompt = promptFactory.createSystemPrompt(input);
      const routePrompt = promptFactory.createRoutePrompt(input);

      throw new Error(
        `LLM provider is not wired yet. Prepared prompts (${systemPrompt.length}/${routePrompt.length}) are ready for a future model adapter.`,
      );
    },
  };
}
