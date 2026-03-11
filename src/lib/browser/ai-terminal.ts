import type {
  AgentAction,
  AgentRequestPayload,
  AgentResponse,
} from '../../types/agent';
import type { AgentRequestContextInput } from '../../types/agent-context';
import { dispatchGalaxyAction, queueGalaxyAction } from './galaxy-events';

type TerminalRole = 'user' | 'assistant';

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function readAgentPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return (await response.json()) as AgentResponse;
  } catch {
    return null;
  }
}

function readTerminalContext(element: HTMLElement): AgentRequestContextInput {
  const serializedContext = element.dataset.agentContext;
  if (!serializedContext) {
    return { routeType: 'hub' };
  }

  try {
    return JSON.parse(serializedContext) as AgentRequestContextInput;
  } catch {
    return { routeType: 'hub' };
  }
}

function routeAgentAction(action: AgentAction) {
  if (action.type === 'OPEN_PATH') {
    window.location.assign(action.path);
    return;
  }

  if (window.location.pathname === '/') {
    dispatchGalaxyAction(action);
    return;
  }

  queueGalaxyAction(action);
  window.location.assign('/');
}

function describeRecommendationAction(action: AgentAction) {
  if (action.type === 'OPEN_PATH') {
    return '打开文章';
  }

  return action.targetType === 'star' ? '进入恒星' : '进入星球';
}

export function mountAITerminal() {
  const fabElement = document.getElementById('ai-terminal-fab');
  const panelElement = document.getElementById('ai-terminal');
  const closeButtonElement = document.getElementById('ai-terminal-close');
  const formElement = document.getElementById('ai-terminal-form');
  const inputElement = document.getElementById('ai-terminal-input');
  const sendButtonElement = document.getElementById('ai-terminal-send');
  const historyElement = document.getElementById('ai-terminal-history');

  if (
    !(fabElement instanceof HTMLButtonElement) ||
    !(panelElement instanceof HTMLElement) ||
    !(closeButtonElement instanceof HTMLButtonElement) ||
    !(formElement instanceof HTMLFormElement) ||
    !(inputElement instanceof HTMLInputElement) ||
    !(sendButtonElement instanceof HTMLButtonElement) ||
    !(historyElement instanceof HTMLElement)
  ) {
    return () => {};
  }

  const fab = fabElement;
  const panel = panelElement;
  const closeButton = closeButtonElement;
  const form = formElement;
  const input = inputElement;
  const sendButton = sendButtonElement;
  const history = historyElement;
  const context = readTerminalContext(panel);

  let destroyed = false;
  let requestController: AbortController | null = null;

  function scrollHistoryToBottom() {
    history.scrollTop = history.scrollHeight;
  }

  function setOpen(nextOpen: boolean) {
    if (destroyed) return;

    fab.classList.toggle('hidden', nextOpen);
    panel.classList.toggle('hidden', !nextOpen);
    panel.classList.toggle('flex', nextOpen);

    if (nextOpen) {
      requestAnimationFrame(() => {
        if (!destroyed) {
          input.focus();
        }
      });
    }
  }

  function appendMessage(text: string, role: TerminalRole) {
    if (destroyed) return null;

    const bubble = document.createElement('div');
    const baseClassName =
      'max-w-[90%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 text-slate-200';
    const roleClassName =
      role === 'user'
        ? 'self-end border-r-2 border-[var(--accent-cyan)] bg-[rgba(0,191,255,0.12)]'
        : 'self-start border-l-2 border-[var(--accent-orange)] bg-[rgba(255,140,0,0.12)]';

    bubble.className = `${baseClassName} ${roleClassName}`;
    bubble.textContent = text;
    history.appendChild(bubble);
    scrollHistoryToBottom();

    return bubble;
  }

  function appendRecommendations(
    recommendations: NonNullable<AgentResponse['recommendations']>,
  ) {
    if (destroyed || recommendations.items.length === 0) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'self-start flex w-full max-w-[90%] flex-col gap-2';
    container.dataset.agentRecommendations = recommendations.mode;

    const buttons: HTMLButtonElement[] = [];

    for (const item of recommendations.items) {
      const button = document.createElement('button');
      const accentClassName =
        item.kind === 'primary'
          ? 'border-[var(--accent-orange)]/40 bg-[rgba(255,140,0,0.12)]'
          : 'border-white/10 bg-white/5';

      button.type = 'button';
      button.className =
        `rounded-xl border px-3 py-3 text-left transition-colors hover:border-[var(--accent-cyan)]/45 hover:bg-[rgba(0,191,255,0.08)] ${accentClassName}`;
      button.dataset.agentRecommendationItem = item.id;

      const meta = document.createElement('div');
      meta.className =
        'flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.24em] text-slate-400';

      const badge = document.createElement('span');
      badge.textContent = `${item.kind === 'primary' ? 'PRIMARY' : 'OPTION'}${item.badge ? ` · ${item.badge}` : ''}`;

      const action = document.createElement('span');
      action.className = 'text-[var(--accent-cyan)]';
      action.textContent = describeRecommendationAction(item.action);

      const title = document.createElement('div');
      title.className = 'mt-2 text-sm font-medium text-white';
      title.textContent = item.title;

      const description = document.createElement('div');
      description.className = 'mt-1 text-xs leading-5 text-slate-300';
      description.textContent = item.description;

      meta.append(badge, action);
      button.append(meta, title, description);

      if (item.hint) {
        const hint = document.createElement('div');
        hint.className = 'mt-2 text-[11px] leading-5 text-slate-500';
        hint.textContent = item.hint;
        button.append(hint);
      }

      button.addEventListener('click', () => {
        if (destroyed) {
          return;
        }

        for (const currentButton of buttons) {
          currentButton.disabled = true;
        }

        routeAgentAction(item.action);
      });

      buttons.push(button);
      container.appendChild(button);
    }

    history.appendChild(container);
    scrollHistoryToBottom();
  }

  async function sendMessage(message: string) {
    requestController = new AbortController();
    const requestPayload: AgentRequestPayload = {
      context,
      message,
    };

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
      signal: requestController.signal,
    });

    const payload = await readAgentPayload(response);

    if (!response.ok) {
      throw new Error(
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message.trim()
          : `Agent request failed with status ${response.status}`,
      );
    }

    if (destroyed) {
      return;
    }

    const output =
      typeof payload?.message === 'string'
        ? payload.message
        : '[agent unavailable] no response payload received';

    appendMessage(output, 'assistant');

    if (payload?.recommendations?.items.length) {
      appendRecommendations(payload.recommendations);
    }

    if (payload?.action) {
      routeAgentAction(payload.action);
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const message = input.value.trim();
    if (!message || destroyed) return;

    appendMessage(message, 'user');
    input.value = '';
    input.disabled = true;
    sendButton.disabled = true;

    try {
      await sendMessage(message);
    } catch (error) {
      if (destroyed || isAbortError(error)) {
        return;
      }

      const fallbackMessage =
        error instanceof Error
          ? `[system error] ${error.message}`
          : '[system error] failed to reach navigation relay';
      appendMessage(fallbackMessage, 'assistant');
    } finally {
      requestController = null;

      if (destroyed) {
        return;
      }

      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  function handleOpen() {
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  fab.addEventListener('click', handleOpen);
  closeButton.addEventListener('click', handleClose);
  form.addEventListener('submit', handleSubmit);
  setOpen(false);

  return function cleanupAITerminal() {
    if (destroyed) return;

    destroyed = true;
    requestController?.abort();
    requestController = null;
    fab.removeEventListener('click', handleOpen);
    closeButton.removeEventListener('click', handleClose);
    form.removeEventListener('submit', handleSubmit);
    input.disabled = false;
    sendButton.disabled = false;
  };
}
