/**
 * Faint name + time watermark for sensitive screens. A web page cannot block screenshots;
 * this makes any leaked screenshot traceable to the person who took it.
 */
export function Watermark({ name, role, stamp }: { name: string; role: string; stamp: string }) {
  const line = `${name} · ${role} · ${stamp}`;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div className="absolute -left-1/2 -top-1/4 flex h-[150%] w-[200%] -rotate-[28deg] flex-col justify-around">
        {Array.from({ length: 14 }, (_, i) => (
          <p key={i} className="whitespace-nowrap text-[15px] font-bold text-ink/[0.07]">
            {`${line}      ${line}      ${line}      ${line}`}
          </p>
        ))}
      </div>
    </div>
  );
}
