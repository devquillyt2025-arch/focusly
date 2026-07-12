/**
 * The ending: a giant wordmark rising off the bottom edge of the page —
 * deliberately clipped so it reads as the surface continuing past the frame.
 */
export default function Finale() {
  return (
    <section className="relative z-10 overflow-hidden pt-4">
      <p className="mb-4 text-center font-mono text-xs tracking-[0.3em] text-holo-ice/30">
        nook · built to be looked at · triple-click the object
      </p>
      <h2
        aria-hidden
        className="text-holo-gradient pointer-events-none -mb-[0.18em] select-none text-center text-[27vw] font-medium leading-none tracking-[0.06em]"
      >
        nook
      </h2>
    </section>
  );
}
