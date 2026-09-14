import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MinimizeButton } from './Minimize';
import './floatingPanelMinimize.css';

function panelDock() {
  let dock = document.getElementById('mosh-minimized-panels');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'mosh-minimized-panels';
    dock.setAttribute('aria-label', 'Minimized panels');
    document.body.appendChild(dock);
  }
  return dock;
}

/** Outside-click dismissal must not discard a panel that the user parked. */
export function isPanelMinimized(selector: string) {
  return [...document.querySelectorAll('[data-floating-panel-minimized="true"]')]
    .some(panel => panel.matches(selector) || !!panel.closest(selector) || !!panel.querySelector(selector));
}

/** A direct child of a floating panel. Hides DOM without unmounting controls,
 * captures, or drafts; a body portal keeps restore buttons out of idle fades. */
export function FloatingPanelMinimize({ label, overlay = false }: { label: string; overlay?: boolean }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setDock(panelDock()); }, []);
  useLayoutEffect(() => {
    const panel = anchor.current?.parentElement;
    if (!panel) return;
    panel.dataset.floatingPanelMinimized = String(minimized);
    return () => { delete panel.dataset.floatingPanelMinimized; };
  }, [minimized]);
  const restore = () => {
    setMinimized(false);
    window.dispatchEvent(new CustomEvent('mosh:panel-restored', { detail: anchor.current?.parentElement }));
    requestAnimationFrame(() => anchor.current?.querySelector('button')?.focus());
  };
  return <>
    <div ref={anchor} data-panel-minimize-control className={overlay ? 'mosh-panel-minimize mosh-panel-minimize--overlay' : 'mosh-panel-minimize'}>
      <MinimizeButton minimized={false} onToggle={() => setMinimized(true)} label={label} variant="minus" />
    </div>
    {minimized && dock && createPortal(<button type="button" className="mosh-panel-restore" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); restore(); }} aria-label={`Restore ${label}`}>↗ {label}</button>, dock)}
  </>;
}
