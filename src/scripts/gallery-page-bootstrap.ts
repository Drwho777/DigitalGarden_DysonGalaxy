import { mountAITerminal } from '../lib/browser/ai-terminal';
import { mountScrollReactiveNavbar } from '../lib/browser/navbar-scroll';
import { mountTiltCards } from '../lib/browser/tilt-cards';

type Cleanup = () => void;

interface GalleryBootstrapState {
  mount: () => void;
  unmount: () => void;
}

declare global {
  interface Window {
    __DG_GALLERY_PAGE_BOOTSTRAP__?: GalleryBootstrapState;
  }
}

function createGalleryBootstrapState(): GalleryBootstrapState {
  let pageCleanup: Cleanup | undefined;

  function mount() {
    pageCleanup?.();

    const cleanups: Cleanup[] = [
      mountScrollReactiveNavbar('gallery-navbar'),
      mountTiltCards(),
      mountAITerminal(),
    ];

    pageCleanup = () => {
      while (cleanups.length > 0) {
        cleanups.pop()?.();
      }
    };
  }

  function unmount() {
    pageCleanup?.();
    pageCleanup = undefined;
  }

  document.addEventListener('astro:before-swap', unmount);
  document.addEventListener('astro:page-load', mount);

  return {
    mount,
    unmount,
  };
}

const galleryBootstrap =
  window.__DG_GALLERY_PAGE_BOOTSTRAP__ ??
  (window.__DG_GALLERY_PAGE_BOOTSTRAP__ = createGalleryBootstrapState());

galleryBootstrap.mount();
