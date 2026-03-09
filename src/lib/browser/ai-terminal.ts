import type { AgentResponse } from '../../types/agent';
import { dispatchGalaxyAction } from './galaxy-events';

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

  let destroyed = false;
  let requestController: AbortController | null = null;

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
      'max-w-[90%] rounded-xl px-4 py-3 text-sm leading-6 text-slate-200';
    const roleClassName =
      role === 'user'
        ? 'self-end border-r-2 border-[var(--accent-cyan)] bg-[rgba(0,191,255,0.12)]'
        : 'self-start border-l-2 border-[var(--accent-orange)] bg-[rgba(255,140,0,0.12)]';

    bubble.className = `${baseClassName} ${roleClassName}`;
    bubble.textContent = text;
    history.appendChild(bubble);
    history.scrollTop = history.scrollHeight;

    return bubble;
  }

  async function sendMessage(message: string) {
    requestController = new AbortController();

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
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

    if (payload?.action) {
      dispatchGalaxyAction(payload.action);
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
