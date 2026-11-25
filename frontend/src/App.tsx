import { useEffect } from 'react';
import { Button } from './components/ui/button';
import { ProjectDetailPage } from './components/ProjectDetailPage';
import { ProjectListPage } from './components/ProjectListPage';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { TooltipProvider } from './components/ui/tooltip';
import { useWorkspaceStore } from './store/useWorkspaceStore';

export default function App() {
  const currentUser = useWorkspaceStore((s) => s.currentUser);
  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace);
  const isLoadingProjects = useWorkspaceStore((s) => s.isLoadingProjects);
  const workspaceLoaded = useWorkspaceStore((s) => s.workspaceLoaded);
  const workspaceError = useWorkspaceStore((s) => s.workspaceError);
  useEffect(() => { void initializeWorkspace(); }, [initializeWorkspace]);
  const activeView = useWorkspaceStore((s) => s.activeView);
  const isLoggedOut = useWorkspaceStore((s) => s.isLoggedOut);
  const signBackIn = useWorkspaceStore((s) => s.signBackIn);
  const themeMode = useWorkspaceStore((s) => s.themeMode);

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

  if (isLoggedOut) {
    return (
      <TooltipProvider>
        <div className="h-screen w-screen overflow-hidden bg-[var(--bg)] flex items-center justify-center p-6">
          <div className="w-full max-w-[420px] rounded-[16px] bg-[var(--surface)] elevated-subtle p-8 flex flex-col items-center text-center gap-4">
            <img
              src="/assets/mesoffice-logo.png"
              alt="Logo Sổ Việc"
              className="w-14 h-14 object-contain"
            />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[25px] leading-[32px] font-bold text-[var(--text)]">
                Đã đăng xuất
              </h1>
              <p className="text-[16px] leading-[24px] text-[var(--text-body)]">
                Phiên làm việc cục bộ của {currentUser.name} đã kết thúc. Dữ liệu dự án vẫn được giữ
                nguyên.
              </p>
            </div>
            <button
              type="button"
              onClick={signBackIn}
              className="mt-2 w-full h-11 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] leading-[20px] font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              Đăng nhập lại
            </button>
          </div>
          <ToastContainer />
        </div>
      </TooltipProvider>
    );
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
