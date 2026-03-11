import { mountAITerminal } from '../lib/browser/ai-terminal';
import {
  consumeQueuedGalaxyAction,
  dispatchGalaxyAction,
} from '../lib/browser/galaxy-events';
import type {
  GalaxySceneHandle,
  SceneGalaxy,
  SceneViewState,
} from '../lib/browser/galaxy-scene';

type Cleanup = () => void;

interface HomeHubBootstrapState {
  mount: () => Promise<void>;
  unmount: () => void;
}

declare global {
  interface Window {
    __DG_HOME_HUB_BOOTSTRAP__?: HomeHubBootstrapState;
  }
}

function getSceneDataElement() {
  const dataElement = document.getElementById('galaxy-scene-data');
  return dataElement instanceof HTMLScriptElement ? dataElement : null;
}

function showHubFallback(message: string) {
  const container = document.getElementById('canvas-container');
  const fallback = document.getElementById('webgl-fallback');

  if (container instanceof HTMLElement) {
    container.innerHTML = '';
  }

  if (fallback instanceof HTMLElement) {
    fallback.classList.remove('hidden');
    fallback.textContent = message;
  }
}

// Record initial script execution time (HMR/Astro safe tracker)
const loaderScriptStart = Date.now();

function createHomeHubBootstrapState(): HomeHubBootstrapState {
  let sceneHandle: GalaxySceneHandle | undefined;
  let terminalCleanup: Cleanup | undefined;
  let mountSequence = 0;
  let lastSceneViewState: SceneViewState | null = null;

  function clearMountedHub() {
    sceneHandle?.dispose();
    sceneHandle = undefined;
    terminalCleanup?.();
    terminalCleanup = undefined;
  }

  async function mount() {
    const dataElement = getSceneDataElement();
    if (!dataElement?.textContent) {
      return;
    }

    const currentSequence = ++mountSequence;
    clearMountedHub();

    let galaxy: SceneGalaxy;

    try {
      galaxy = JSON.parse(dataElement.textContent) as SceneGalaxy;
    } catch (error) {
      showHubFallback(
        error instanceof Error
          ? `[scene bootstrap failed] ${error.message}`
          : '[scene bootstrap failed] invalid scene payload',
      );
      return;
    }

    terminalCleanup = mountAITerminal();

    try {
      const { initGalaxyScene } = await import('../lib/browser/galaxy-scene');

      if (currentSequence !== mountSequence) {
        return;
      }

      sceneHandle = initGalaxyScene(galaxy, {
        initialViewState: lastSceneViewState,
        onViewStateChange(nextViewState) {
          lastSceneViewState = nextViewState;
        },
      });

      const loader = document.getElementById('vortex-loader');
      if (loader) {
        // Enforce a minimum 3.6s (3600ms) delay. Use absolute Date.now() difference to ignore HMR navigationStart discrepancies.
        const timeElapsed = Date.now() - loaderScriptStart;
        const remainingDelay = Math.max(0, 3600 - timeElapsed);

        setTimeout(() => {
          loader.classList.add('opacity-0');
          setTimeout(() => loader.remove(), 1000);
        }, remainingDelay);
      }

      const pendingAction = consumeQueuedGalaxyAction();
      if (pendingAction) {
        requestAnimationFrame(() => {
          if (currentSequence === mountSequence) {
            dispatchGalaxyAction(pendingAction);
          }
        });
      }
    } catch (error) {
      if (currentSequence !== mountSequence) {
        return;
      }

      showHubFallback(
        error instanceof Error
          ? `[scene bootstrap failed] ${error.message}`
          : '[scene bootstrap failed] unable to load scene runtime',
      );
      console.error('Failed to mount galaxy scene', error);
    }
  }

  function unmount() {
    mountSequence += 1;
    clearMountedHub();
  }

  document.addEventListener('astro:before-swap', unmount);
  document.addEventListener('astro:page-load', () => {
    void mount();
  });

  return {
    mount,
    unmount,
  };
}

window.__DG_HOME_HUB_BOOTSTRAP__ ??= createHomeHubBootstrapState();
