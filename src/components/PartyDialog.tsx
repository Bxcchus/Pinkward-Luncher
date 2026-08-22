import { useState, type FormEvent } from 'react';
import type { AppController } from '../hooks/useAppController';
import { Icon } from './Icon';
import { Button } from './UI';

export function PartyDialog({ controller, locked, onClose }: { controller: AppController; locked: boolean; onClose(): void }) {
  const { state } = controller;
  const [riotId, setRiotId] = useState('');
  const memberCount = 1 + state.partyMembers.length;
  const openSlots = Math.max(0, 5 - memberCount);
  const isLeader = !state.partyId || state.partyLeaderId === state.player?.id;

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await controller.inviteToParty(riotId)) setRiotId('');
  };

  return (
    <div className="party-overlay">
      <section className="party-dialog" role="dialog" aria-modal="true" aria-labelledby="party-title" aria-describedby="party-description">
        <header className="party-dialog__header">
          <div>
            <span className="eyebrow">YOUR PARTY</span>
            <h2 id="party-title">Assemble your group</h2>
            <p id="party-description">Invite up to four teammates before entering the Community 5v5 queue.</p>
          </div>
          <button type="button" className="party-dialog__close" onClick={onClose} aria-label="Close party"><Icon name="close" size={19} /></button>
        </header>

        <div className="party-capacity">
          <span><Icon name="users" size={18} /> Party members</span>
          <strong>{memberCount}<small>/5</small></strong>
        </div>

        <div className="party-members" aria-label={`${memberCount} of 5 party slots occupied`}>
          <div className="party-member party-member--leader">
            <span className="party-member__avatar">{state.player?.gameName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{state.player?.gameName}<small>#{state.player?.tagLine}</small></strong><em>{isLeader ? 'Party leader' : 'Party member'}</em></span>
            <span className="party-member__state party-member__state--ready"><i /> Ready</span>
          </div>
          {state.partyMembers.map((member) => (
            <div className="party-member" key={member.id}>
              <span className="party-member__avatar">{member.gameName.slice(0, 1).toUpperCase()}</span>
              <span><strong>{member.gameName}<small>#{member.tagLine}</small></strong><em>{member.leader ? 'Party leader' : member.status === 'JOINED' ? 'In your party' : 'Invitation sent'}</em></span>
              <span className={`party-member__state${member.status === 'JOINED' ? ' party-member__state--ready' : ''}`}><i /> {member.status === 'JOINED' ? 'Ready' : 'Pending'}</span>
              {isLeader && <button type="button" onClick={() => void controller.removePartyMember(member.id)} disabled={locked} aria-label={`Remove ${member.gameName} from party`}><Icon name="close" size={15} /></button>}
            </div>
          ))}
          {Array.from({ length: openSlots }, (_, index) => (
            <div className="party-member party-member--empty" key={`empty-${index}`}>
              <span className="party-member__avatar"><Icon name="users" size={16} /></span>
              <span><strong>Open slot</strong><em>Invite a teammate</em></span>
            </div>
          ))}
        </div>

        {state.partyInvitations.length > 0 && <section className="party-invitations">
          <span className="eyebrow">INVITATIONS</span>
          {state.partyInvitations.map((invitation) => <div className="party-invitation" key={invitation.id}>
            <span><strong>{invitation.gameName}<small>#{invitation.tagLine}</small></strong><em>invited you to a party</em></span>
            <div><Button tone="ghost" onClick={() => void controller.declinePartyInvitation(invitation.id)}>Decline</Button><Button tone="success" onClick={() => void controller.acceptPartyInvitation(invitation.id)}>Join</Button></div>
          </div>)}
        </section>}

        {isLeader ? <form className="party-invite" onSubmit={(event) => void submitInvite(event)}>
          <label htmlFor="party-riot-id">Invite by Riot ID</label>
          <div>
            <input
              id="party-riot-id"
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              placeholder="Game name#TAG"
              autoComplete="off"
              spellCheck={false}
              disabled={locked || memberCount >= 5}
            />
            <Button type="submit" tone="primary" icon="users" disabled={locked || memberCount >= 5 || !riotId.trim()}>Invite</Button>
          </div>
          <small>{locked ? 'Party changes are locked while searching.' : memberCount >= 5 ? 'Your party is full.' : 'Inviting a teammate selects Community 5v5 automatically.'}</small>
        </form> : <div className="party-invite"><Button tone="destructive" onClick={() => void controller.leaveParty()} disabled={locked}>Leave party</Button><small>The leader starts and cancels matchmaking for the whole party.</small></div>}
      </section>
    </div>
  );
}
