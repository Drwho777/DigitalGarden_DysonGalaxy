export type Cleanup = () => void;

const DEFAULT_CARD_TRANSFORM =
  'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';

export function mountTiltCards(selector = '.tilt-card'): Cleanup {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(selector));

  if (cards.length === 0) {
    return () => {};
  }

  const cleanups = cards.map((card) => {
    function handleMouseMove(event: MouseEvent) {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      card.style.transform =
        `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    }

    function resetTransform() {
      card.style.transform = DEFAULT_CARD_TRANSFORM;
    }

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', resetTransform);
    resetTransform();

    return () => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', resetTransform);
      resetTransform();
    };
  });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
