import { useCallback, useEffect, useState } from 'react';
import { Button } from './components/ui/button';
import { GoogleAuthPage, type GoogleAuthStatus } from './components/GoogleAuthPage';
import { loadGoogleAuthStatus, oauthErrorMessage, startGoogleLogin } from './lib/google-auth-api';
import { ProjectDetailPage } from './components/ProjectDetailPage';
import { ProjectListPage } from './components/ProjectListPage';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { TooltipProvider } from './components/ui/tooltip';
import { useWorkspaceStore } from './store/useWorkspaceStore';
import { useCalendarReminders } from './lib/useCalendarReminders';

export default function App() {
  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace);
  const isLoadingProjects = useWorkspaceStore((s) => s.isLoadingProjects);
  const workspaceLoaded = useWorkspaceStore((s) => s.workspaceLoaded);
  const workspaceError = useWorkspaceStore((s) => s.workspaceError);
  const [authStatus, setAuthStatus] = useState<GoogleAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const checkGoogle = useCallback(async () => {
    setAuthLoading(true); setAuthError(null);
    try {
      const status = await loadGoogleAuthStatus();
      setAuthStatus(status);
      if (!status.configured && !status.authenticated) setAuthError(status.configuration_error);
      return status.authenticated;
    } catch (error) {
      setAuthStatus(null);
      setAuthError(error instanceof Error ? error.message : 'Không kết nối được backend.');
      return false;
    } finally { setAuthLoading(false); }
  }, []);
  const activeView = useWorkspaceStore((s) => s.activeView);
  const isLoggedOut = useWorkspaceStore((s) => s.isLoggedOut);
  const signBackIn = useWorkspaceStore((s) => s.signBackIn);
  const themeMode = useWorkspaceStore((s) => s.themeMode);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const oauthError = query.get('oauth_error');
    const connected = query.get('oauth') === 'connected';
    if (oauthError || connected) {
      query.delete('oauth'); query.delete('oauth_error');
      window.history.replaceState(null, '', window.location.pathname + (query.size ? `?${query}` : '') + window.location.hash);
    }
    void checkGoogle().then((authenticated) => {
      if (oauthError) setAuthError(oauthErrorMessage(oauthError));
      // Only status() grants access; the URL marker merely clears the local logout flag.
      if (connected && authenticated) signBackIn();
    });
  }, [checkGoogle, signBackIn]);
  const googleReady = Boolean(authStatus?.authenticated && !authError && !authLoading && !isLoggedOut);
  useEffect(() => { if (googleReady) void initializeWorkspace(); }, [googleReady, initializeWorkspace]);
  useCalendarReminders(workspaceLoaded && googleReady);

  // Sync resolved Light / Dark theme to <html> class & meta theme-color (reacting live to OS changes in system mode)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = themeMode === 'dark' || (themeMode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', isDark ? '#070E1F' : '#FFFFFF');
      }
    };

    applyTheme();

    if (themeMode === 'system') {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
    return undefined;
  }, [themeMode]);

  if (!googleReady) {
    return <TooltipProvider>
      <GoogleAuthPage status={authStatus} loading={authLoading} error={authError}
        onRetry={() => void checkGoogle()} onLogin={startGoogleLogin} />
      <ToastContainer />
    </TooltipProvider>;
  }

  if (!workspaceLoaded || workspaceError) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg)] text-[var(--text)] p-6">
      <p role="status">{workspaceError || 'Đang tải dự án từ backend…'}</p>
      {workspaceError && <Button disabled={isLoadingProjects} onClick={() => void initializeWorkspace()}>
        {isLoadingProjects ? 'Đang kết nối…' : 'Thử lại'}
      </Button>}
    </div>;
  }

  return (
    <TooltipProvider>
      <div className="h-screen w-screen overflow-hidden flex bg-[var(--bg)] text-[var(--text)]">
        <Sidebar />
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {activeView === 'projects' ? <ProjectListPage /> : <ProjectDetailPage />}
        </div>
        <ToastContainer />
      </div>
    </TooltipProvider>
  );
}
