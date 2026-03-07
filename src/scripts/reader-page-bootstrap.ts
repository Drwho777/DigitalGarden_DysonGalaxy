import { mountScrollReactiveNavbar } from '../lib/browser/navbar-scroll';

type Cleanup = () => void;

interface ReaderBootstrapState {
  mount: () => void;
  unmount: () => void;
}

declare global {
  interface Window {
    __DG_READER_PAGE_BOOTSTRAP__?: ReaderBootstrapState;
  }
}

function createReaderBootstrapState(): ReaderBootstrapState {
  let pageCleanup: Cleanup | undefined;

  function mount() {
    pageCleanup?.();
    pageCleanup = mountScrollReactiveNavbar('reader-navbar');
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

const readerBootstrap =
  window.__DG_READER_PAGE_BOOTSTRAP__ ??
  (window.__DG_READER_PAGE_BOOTSTRAP__ = createReaderBootstrapState());

readerBootstrap.mount();
