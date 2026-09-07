import { useEffect, useState } from "react";

const SEAM_SEGMENTS = [
  { start: "4%", size: "7%", delay: "-1.3s", duration: "2.1s" },
  { start: "15%", size: "3%", delay: "-3.8s", duration: "1.4s" },
  { start: "23%", size: "12%", delay: "-.7s", duration: "2.8s" },
  { start: "41%", size: "5%", delay: "-2.6s", duration: "1.7s" },
  { start: "51%", size: "17%", delay: "-4.2s", duration: "3.2s" },
  { start: "72%", size: "8%", delay: "-1.9s", duration: "2.4s" },
  { start: "85%", size: "4%", delay: "-3.1s", duration: "1.6s" },
  { start: "92%", size: "6%", delay: "-.4s", duration: "2.7s" },
] as const;

export function MoshDivider() {
  const [effect, setEffect] = useState(0);

  useEffect(() => {
    let timer = 0;
    const roll = () => {
      setEffect(previous => {
        const next = 1 + Math.floor(Math.random() * 4);
        return next === previous ? (next % 4) + 1 : next;
      });
      timer = window.setTimeout(roll, 620 + Math.random() * 1180);
    };
    timer = window.setTimeout(roll, 480);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={`split-seam split-seam--${effect}`} aria-hidden="true">
      <i className="split-seam-core" />
      <i className="split-seam-scan" />
      {SEAM_SEGMENTS.map((segment, index) => (
        <i
          key={segment.start}
          className={`split-seam-fragment split-seam-fragment--${index % 3}`}
          style={{
            "--seam-start": segment.start,
            "--seam-size": segment.size,
            "--seam-delay": segment.delay,
            "--seam-duration": segment.duration,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function SourceTrace() {
  return (
    <svg className="split-trace split-trace--source" viewBox="0 0 760 760" aria-hidden="true">
      <g className="split-trace-ghost">
        <path d="M82 252h126l43-68h248l42 68h108v326H82z" />
        <circle cx="365" cy="410" r="112" />
      </g>
      <g className="split-trace-primary">
        <path d="M82 252h126l43-68h248l42 68h108v326H82z" />
        <path d="M144 252v-42h92M565 252v-42h38" />
        <circle cx="365" cy="410" r="112" />
        <circle cx="365" cy="410" r="70" />
        <path d="M365 298l61 105-61 119-61-119z" />
        <path d="M596 315h-62M565 284v62" />
        <path d="M160 494c52-19 92-16 121 8 33 28 61 42 86 43" />
      </g>
      <g className="split-trace-scan">
        {Array.from({ length: 18 }, (_, index) => (
          <path key={index} d={`M${98 + (index % 3) * 11} ${224 + index * 20}h${500 - (index % 4) * 38}`} />
        ))}
      </g>
    </svg>
  );
}

export function ForgeTrace() {
  return (
    <svg className="split-trace split-trace--forge" viewBox="0 0 760 760" aria-hidden="true">
      <g className="split-trace-ghost">
        <path d="M131 506h420l-43 84H190zM252 590h190l49 76H202z" />
        <path d="M292 480c-71-80 58-135 4-225 104 41 77 112 121 129 14-52 48-82 88-108 20 106 79 137 5 204z" />
      </g>
      <g className="split-trace-primary">
        <path d="M131 506h420l-43 84H190zM252 590h190l49 76H202z" />
        <path d="M292 480c-71-80 58-135 4-225 104 41 77 112 121 129 14-52 48-82 88-108 20 106 79 137 5 204z" />
        <path d="M345 475c-25-36 14-75 1-112 48 28 40 61 66 79 9-21 20-39 39-53 8 42 28 63-2 86z" />
      </g>
      <g className="split-pattern-lattice">
        {Array.from({ length: 28 }, (_, index) => {
          const column = index % 7;
          const row = Math.floor(index / 7);
          return <rect key={index} x={472 + column * 25} y={193 + row * 25} width="11" height="11" />;
        })}
      </g>
      <g className="split-trace-scan">
        {Array.from({ length: 16 }, (_, index) => (
          <path key={index} d={`M${154 + (index % 4) * 18} ${310 + index * 19}h${430 - (index % 3) * 52}`} />
        ))}
      </g>
    </svg>
  );
}

export function ForgePatternMark() {
  return (
    <svg className="forge-pattern-mark" viewBox="0 0 96 76" aria-hidden="true">
      <path d="M22 60c-12-14-2-27 7-36 2 11 10 15 14 21 0-14 8-25 20-34-1 19 14 24 14 39 0 14-12 22-28 22-12 0-21-4-27-12z" />
      <path d="M39 60c-5-7 1-13 6-18 1 7 5 9 8 12 1-6 4-11 9-15 1 11 7 14 5 21-2 7-8 10-15 10-6 0-11-3-13-10z" />
      <g>
        <rect x="67" y="20" width="7" height="7" />
        <rect x="78" y="20" width="7" height="7" />
        <rect x="67" y="31" width="7" height="7" />
        <rect x="78" y="31" width="7" height="7" />
        <rect x="67" y="42" width="7" height="7" />
        <rect x="78" y="42" width="7" height="7" />
      </g>
    </svg>
  );
}
