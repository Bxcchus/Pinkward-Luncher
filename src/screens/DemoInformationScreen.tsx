import { Brand } from '../components/Brand';
import { DemoLegalNav } from '../components/DemoLegalNav';

export type DemoInformationRoute = 'matchmaking' | 'privacy' | 'terms' | 'contact';

const riotNotice = 'Pinkward is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.';

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="demo-info-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function MatchmakingInformation() {
  return (
    <>
      <PageHeader eyebrow="RIOT REVIEW INFORMATION" title="How Pinkward matchmaking works" description="Two voluntary custom-game queues, presented here exactly as they behave in the Windows companion." />
      <div className="demo-mode-grid">
        <article>
          <span className="eyebrow">01 · SUMMONER'S RIFT</span>
          <h2>Community 5v5</h2>
          <p>Players select a primary and secondary role. They may queue alone or in a party of up to five members.</p>
          <ol>
            <li><strong>Role selection</strong><span>Top, Jungle, Mid, Bot and Support are represented on both teams.</span></li>
            <li><strong>Team formation</strong><span>The Pinkward server assembles ten available players and assigns two five-player teams.</span></li>
            <li><strong>Ready check</strong><span>Every participant must accept before a custom lobby is prepared.</span></li>
            <li><strong>Custom game</strong><span>Players join the League custom lobby and Pinkward synchronizes the match result.</span></li>
          </ol>
        </article>
        <article>
          <span className="eyebrow">02 · HOWLING ABYSS</span>
          <h2>1v1 Showdown</h2>
          <p>A solo queue pairs two players for a short custom duel on Howling Abyss.</p>
          <ol>
            <li><strong>Two-player queue</strong><span>Parties cannot enter the Showdown queue.</span></li>
            <li><strong>Ready check</strong><span>Both players confirm before the lobby workflow begins.</span></li>
            <li><strong>Victory conditions</strong><span>The first player to score First Blood, reach 100 CS or destroy the first turret wins.</span></li>
            <li><strong>Result</strong><span>The Windows companion observes the game and sends the outcome to Pinkward.</span></li>
          </ol>
        </article>
      </div>
      <aside className="demo-policy-callout"><strong>No alternative ranking system</strong><p>Pinkward does not replace Riot ranked queues and does not calculate or publish an alternative MMR or ELO. The browser demo uses fictitious local data and never enters a real queue.</p></aside>
    </>
  );
}

function PrivacyInformation() {
  return (
    <>
      <PageHeader eyebrow="LEGAL" title="Privacy Policy" description="Last updated: 23 August 2026" />
      <div className="demo-legal-sections">
        <section><h2>1. Scope and contact</h2><p>This policy covers the Pinkward browser demo, Windows companion and associated Pinkward services. Privacy requests can be sent to <a href="mailto:contact@pinkward.lol">contact@pinkward.lol</a>.</p></section>
        <section><h2>2. Browser demo</h2><p>The demo on companion.pinkward.lol is an isolated simulation. It does not connect to Riot, the League Client or the Pinkward production API. The sample Riot ID, settings and fictitious match data stay in the browser and may be stored in localStorage. Clearing site data removes them.</p></section>
        <section><h2>3. Live service data</h2><p>When the Windows application is used with the live service, Pinkward may process Riot ID, PUUID, region, profile icon, selected roles, queue and party state, invitations, ready checks, custom match assignments, results, chat messages, moderation records, timestamps, IP address and security logs.</p></section>
        <section><h2>4. Purposes</h2><p>Data is used to provide requested matchmaking, form teams, synchronize custom matches, display player-selected public statistics, operate community features, prevent abuse and secure the service. Pinkward does not sell personal data.</p></section>
        <section><h2>5. Sessions and security</h2><p>Web login tickets expire after 90 seconds and authenticated sessions after 12 hours. HTTPS protects public traffic. Riot API secrets are kept server-side and are not included in the browser demo or distributed executables.</p></section>
        <section><h2>6. Your rights</h2><p>Depending on applicable law, you may request access, correction, deletion, restriction, portability or objection by contacting <a href="mailto:contact@pinkward.lol">contact@pinkward.lol</a>. Users in France may also contact the CNIL.</p></section>
      </div>
    </>
  );
}

function TermsInformation() {
  return (
    <>
      <PageHeader eyebrow="LEGAL" title="Terms of Service" description="Last updated: 23 August 2026" />
      <div className="demo-legal-sections">
        <section><h2>1. Service</h2><p>Pinkward is an independent community service for voluntary League of Legends custom games. It provides Community 5v5 role matchmaking and 1v1 Showdown. It is not a Riot ranked queue and provides no alternative rank, MMR or ELO.</p></section>
        <section><h2>2. Demo and live use</h2><p>The browser demo contains fictitious local data and cannot join a real queue or control League. Live matches require the Windows companion, the official League Client and available Pinkward services.</p></section>
        <section><h2>3. Player conduct</h2><p>Harassment, discrimination, spam, impersonation, cheating, exploit abuse, sanction evasion, unauthorized data collection and sharing lobby secrets are prohibited. Pinkward may restrict access to protect players and the service.</p></section>
        <section><h2>4. Availability</h2><p>Pinkward is provided without a guarantee of uninterrupted availability. Changes to League, Riot APIs or the League Client may temporarily affect features.</p></section>
        <section><h2>5. Riot Games</h2><blockquote>{riotNotice}</blockquote></section>
        <section><h2>6. Contact</h2><p>Questions about these terms can be sent to <a href="mailto:contact@pinkward.lol">contact@pinkward.lol</a>.</p></section>
      </div>
    </>
  );
}

function ContactInformation() {
  return (
    <>
      <PageHeader eyebrow="SUPPORT" title="Contact Pinkward" description="Support, privacy, security and technical reports." />
      <div className="demo-contact-grid">
        <article><span className="eyebrow">GENERAL CONTACT</span><h2>Email</h2><p>For support, privacy requests, security reports and administrative questions.</p><a className="demo-info-action" href="mailto:contact@pinkward.lol">contact@pinkward.lol</a></article>
        <article><span className="eyebrow">TECHNICAL ISSUE</span><h2>GitHub</h2><p>Report a reproducible problem without including personal information, tokens or lobby credentials.</p><a className="demo-info-action" href="https://github.com/Bxcchus/Pinkward-Luncher/issues" target="_blank" rel="noreferrer">Open an issue ↗</a></article>
      </div>
      <aside className="demo-policy-callout"><strong>Never share credentials</strong><p>Pinkward will never ask by email for a Riot password, login code, API key, session token or lobby password.</p></aside>
    </>
  );
}

export function DemoInformationScreen({ route }: { route: DemoInformationRoute }) {
  return (
    <main className="demo-info-page">
      <header className="demo-info-topbar"><Brand /><a href="/">← Back to interactive demo</a></header>
      <article className="demo-info-content">
        {route === 'matchmaking' && <MatchmakingInformation />}
        {route === 'privacy' && <PrivacyInformation />}
        {route === 'terms' && <TermsInformation />}
        {route === 'contact' && <ContactInformation />}
      </article>
      <DemoLegalNav showNotice />
    </main>
  );
}
