/** Placeholder bars shown while a reading page streams in. */
export function Skeleton({ lines }: { lines: string[] }) {
  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 pt-10 sm:px-6 sm:pt-14"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      <div className="h-3.5 w-36 rounded bg-paper-sunk" />
      <div className="mt-10 space-y-4">
        {lines.map((width, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          <div key={i} className={`rounded bg-paper-sunk ${width}`} />
        ))}
      </div>
    </div>
  );
}
