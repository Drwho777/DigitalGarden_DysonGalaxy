import { mountAITerminal } from '../lib/browser/ai-terminal';
import type {
  SceneGalaxy,
  SceneViewState,
} from '../lib/browser/galaxy-scene';

type Cleanup = () => void;

let sceneCleanup: Cleanup | undefined;
let terminalCleanup: Cleanup | undefined;
let mountSequence = 0;
let lastSceneViewState: SceneViewState | null = null;

function clearMountedHub() {
  sceneCleanup?.();
  sceneCleanup = undefined;
  terminalCleanup?.();
  terminalCleanup = undefined;
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

async function mountHomeHub() {
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

    sceneCleanup = initGalaxyScene(galaxy, {
      initialViewState: lastSceneViewState,
      onViewStateChange(nextViewState) {
        lastSceneViewState = nextViewState;
      },
    });
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

function unmountHomeHub() {
  mountSequence += 1;
  clearMountedHub();
}

document.addEventListener('astro:before-swap', unmountHomeHub);
document.addEventListener('astro:page-load', () => {
  void mountHomeHub();
});

void mountHomeHub();
