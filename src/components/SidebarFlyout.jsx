import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Shared by Search/Notifications/Avatar to pick which trigger markup to render
// (full labeled row vs icon-only) and which SidebarFlyout placement to use.
// Watches for .main-nav--rail class on the sidebar (set by JS toggle) rather than
// a media query, so the search collapses in sync with the sidebar collapse state.
export function useIsRail() {
  const [isRail, setIsRail] = useState(() => {
    if (typeof document === 'undefined') return false;
    return !!document.querySelector('.main-nav--rail');
  });

  useEffect(() => {
    const nav = document.querySelector('.main-nav');
    if (!nav) return;

    const observer = new MutationObserver(() => {
      setIsRail(nav.classList.contains('main-nav--rail'));
    });
    observer.observe(nav, { attributes: true, attributeFilter: ['class'] });
    // Also re-check on mount in case the class was already set
    setIsRail(nav.classList.contains('main-nav--rail'));
    return () => observer.disconnect();
  }, []);

  return isRail;
}

// Portals to document.body so the panel escapes .main-nav's overflow-y:auto /
// overflow-x:hidden (a position:absolute child would get clipped otherwise),
// then positions itself with position:fixed against the trigger's live rect.
//
// placement="up"    — desktop rail: opens upward, left-aligned to the trigger
//                      (footer avatar/notifications dropdowns).
// placement="right" — 64px icon rail: opens rightward from the trigger
//                      (shared by Search and Notifications on tablet).
export default function SidebarFlyout({ open, anchorRef, placement = 'up', children, className = '' }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!open || !anchorRef.current) { setRect(null); return; }
    const measure = () => setRect(anchorRef.current.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, anchorRef]);

  if (typeof document === 'undefined') return null;

  // Anchor by whichever vertical edge keeps the panel on-screen — a trigger
  // near the bottom of the viewport (e.g. the avatar row) must open upward
  // even in "right" placement, or the panel runs off the bottom of the screen.
  const opensUpward = rect ? rect.top > window.innerHeight / 2 : false;
  const style = rect
    ? placement === 'right'
      ? opensUpward
        ? { left: rect.right + 8, bottom: window.innerHeight - rect.bottom }
        : { left: rect.right + 8, top: rect.top }
      : { left: rect.left, bottom: window.innerHeight - rect.top + 8 }
    : {};

  return createPortal(
    <AnimatePresence>
      {open && rect && (
        <motion.div
          className={`sb-flyout sb-flyout-${placement} ${className}`}
          style={style}
          initial={{ opacity: 0, y: placement === 'right' ? 0 : 8, x: placement === 'right' ? -8 : 0, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: placement === 'right' ? 0 : 8, x: placement === 'right' ? -8 : 0, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
