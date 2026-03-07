export type Cleanup = () => void;

export function mountScrollReactiveNavbar(navbarId: string): Cleanup {
  const navbar = document.getElementById(navbarId);

  if (!(navbar instanceof HTMLElement)) {
    return () => {};
  }

  const navbarElement = navbar;
  let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop;

  function handleScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollTop > lastScrollTop && scrollTop > 100) {
      navbarElement.style.transform = 'translateY(-100%)';
    } else {
      navbarElement.style.transform = 'translateY(0)';
    }

    lastScrollTop = scrollTop;
  }

  window.addEventListener('scroll', handleScroll, { passive: true });

  return () => {
    window.removeEventListener('scroll', handleScroll);
    navbarElement.style.transform = 'translateY(0)';
  };
}
