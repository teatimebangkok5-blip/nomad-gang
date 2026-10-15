export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-ink-200" />
      <div className="h-32 rounded-xl bg-ink-100" />
      <div className="h-32 rounded-xl bg-ink-100" />
    </div>
  );
}
