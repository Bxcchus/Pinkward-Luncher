import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { PartyDialog } from './components/PartyDialog';
import { Toast } from './components/UI';
import { useAppController } from './hooks/useAppController';
import { LoginScreen } from './screens/LoginScreen';
import {
  CreatingMatchScreen,
  ChatScreen,
  HistoryScreen,
  HomeScreen,
  JoiningLobbyScreen,
  MatchOverviewScreen,
  PlayScreen,
  PostGameScreen,
  ReadyCheckScreen,
  SearchingScreen,
  SettingsScreen,
} from './screens/MainScreens';

export default function App() {
  const controller = useAppController();
  const { state } = controller;
  const [dismissedInvitationId, setDismissedInvitationId] = useState<string | null>(null);
  const pendingInvitation = state.partyInvitations[0];

  useEffect(() => {
    if (!state.toast) return;
    const timeout = window.setTimeout(controller.clearToast, 2_500);
    return () => window.clearTimeout(timeout);
  }, [controller, state.toast]);

  if (!state.player || state.screen === 'LOGIN') return <LoginScreen controller={controller} />;

  let screen: React.ReactNode;
  switch (state.screen) {
    case 'HOME': screen = <HomeScreen controller={controller} />; break;
    case 'PLAY': screen = <PlayScreen controller={controller} />; break;
    case 'SEARCHING': screen = <SearchingScreen controller={controller} />; break;
    case 'READY_CHECK': screen = <ReadyCheckScreen controller={controller} />; break;
    case 'CREATING_MATCH': screen = <CreatingMatchScreen controller={controller} />; break;
    case 'JOINING_LOBBY': screen = <JoiningLobbyScreen controller={controller} />; break;
    case 'MATCH_OVERVIEW': screen = <MatchOverviewScreen controller={controller} />; break;
    case 'POST_GAME': screen = <PostGameScreen controller={controller} />; break;
    case 'HISTORY': screen = <HistoryScreen state={state} />; break;
    case 'CHAT': screen = <ChatScreen controller={controller} />; break;
    case 'SETTINGS': screen = <SettingsScreen controller={controller} />; break;
    default: screen = <HomeScreen controller={controller} />;
  }

  return (
    <AppShell state={state} controller={controller}>
      {screen}
      {pendingInvitation && pendingInvitation.id !== dismissedInvitationId && (
        <PartyDialog
          controller={controller}
          locked={false}
          onClose={() => setDismissedInvitationId(pendingInvitation.id)}
        />
      )}
      {state.toast && <Toast>{state.toast}</Toast>}
    </AppShell>
  );
}
