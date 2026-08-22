import appLogoUrl from '../assets/pinkward-logo-final.png';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Pinkward">
      <div className="brand__mark" aria-hidden="true">
        <img src={appLogoUrl} alt="" draggable={false} />
      </div>
      {!compact && (
        <div className="brand__type">
          <strong>Pinkward</strong>
          <small>Companion</small>
        </div>
      )}
    </div>
  );
}
