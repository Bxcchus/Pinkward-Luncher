interface DemoLegalNavProps {
  compact?: boolean;
  showNotice?: boolean;
}

export function DemoLegalNav({ compact = false, showNotice = false }: DemoLegalNavProps) {
  return (
    <footer className={compact ? 'demo-legal-nav demo-legal-nav--compact' : 'demo-legal-nav'}>
      <nav aria-label="Demo and legal information">
        <a href="/">Demo</a>
        <a href="/matchmaking">Matchmaking</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms</a>
        <a href="/contact">Contact</a>
      </nav>
      {showNotice && <p>Pinkward is an independent community project and is not endorsed by Riot Games.</p>}
    </footer>
  );
}
