'use client';

import { useEffect, useState, type RefObject } from 'react';

export function useScrollHeader(headerRef: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let previousY = Math.max(0, window.scrollY);
    let direction = 0;
    let distance = 0;
    let frame: number | null = null;

    const update = () => {
      frame = null;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - previousY;
      previousY = currentY;

      const focusedElement = document.activeElement;
      const hasKeyboardFocus = focusedElement?.matches(':focus-visible') &&
        headerRef.current?.contains(focusedElement);

      if (currentY <= 80 || hasKeyboardFocus) {
        setVisible(true);
        direction = 0;
        distance = 0;
        return;
      }

      if (delta === 0) return;
      const nextDirection = Math.sign(delta);
      distance = nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta);
      direction = nextDirection;

      if (distance >= 12) {
        setVisible(direction < 0);
        distance = 0;
      }
    };

    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [headerRef]);

  return visible;
}
