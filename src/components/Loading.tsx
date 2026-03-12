export function LoadingDots() {
  return (
    <span className="inline-flex gap-1 items-center">
      {[0,1,2].map(i => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-terminal-accent animate-pulse-dim"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export function SectionLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-48 text-terminal-dim">
      <LoadingDots />
      <span className="text-xs font-mono">{label}</span>
    </div>
  );
}
