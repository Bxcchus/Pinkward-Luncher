export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="W3C-LoL">
      <div className="brand__mark" aria-hidden="true">
        <span>W</span>
        <i />
      </div>
      {!compact && (
        <div className="brand__type">
          <strong>W3C</strong>
          <span>LoL</span>
          <small>COMPANION</small>
        </div>
      )}
    </div>
  );
}
