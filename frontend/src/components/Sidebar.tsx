import {
  IconDeviceDesktop,
  IconFolders,
  IconFoldersFilled,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconLogout,
  IconMessage,
  IconMessageFilled,
  IconMoon,
  IconSelector,
  IconSun,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ChatSession, ThemeMode } from '../types/workspace';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { formatShortDate } from '../utils/format';

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  Icon: typeof IconSun;
}> = [
  { value: 'light', label: 'Sáng', Icon: IconSun },
  { value: 'dark', label: 'Tối', Icon: IconMoon },
  { value: 'system', label: 'Hệ thống', Icon: IconDeviceDesktop },
];

export function Sidebar() {
  const currentUser = useWorkspaceStore((s) => s.currentUser);
  const sidebarOpen = useWorkspaceStore((s) => s.sidebarOpen);
  const setSidebarOpen = useWorkspaceStore((s) => s.setSidebarOpen);
  const activeView = useWorkspaceStore((s) => s.activeView);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const chatSessions = useWorkspaceStore((s) => s.chatSessions);
  const projects = useWorkspaceStore((s) => s.projects);
  const openProjectsList = useWorkspaceStore((s) => s.openProjectsList);
  const openChatSession = useWorkspaceStore((s) => s.openChatSession);
  const deleteChatSession = useWorkspaceStore((s) => s.deleteChatSession);
  const isAgentResponding = useWorkspaceStore((s) => s.isAgentResponding);
  const logoutUser = useWorkspaceStore((s) => s.logoutUser);
  const themeMode = useWorkspaceStore((s) => s.themeMode);
  const setThemeMode = useWorkspaceStore((s) => s.setThemeMode);

  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [logoHovered, setLogoHovered] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setUserPopoverOpen(false);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!logoutDialogOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLogoutDialogOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [logoutDialogOpen]);

  const getProjectTitle = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.title ?? 'Dự án';

  return (
    <>
      <aside
        aria-label="Thanh điều hướng chính"
        className={`h-full shrink-0 bg-[var(--surface-panel)] border-r border-[var(--divider)] flex flex-col overflow-hidden transition-[width] duration-150 ${
          sidebarOpen ? 'w-[260px]' : 'w-[68px]'
        }`}
      >
        {/* Sidebar Header: horizontal, logo left, text left, layout-sidebar icon right */}
        <div
          className={`h-[64px] shrink-0 flex items-center px-4 ${
            sidebarOpen ? 'justify-between gap-2' : 'justify-center'
          }`}
        >
          {sidebarOpen ? (
            <>
              <button
                type="button"
                onClick={openProjectsList}
                title="deskhive-harness"
                className="flex items-center gap-2 min-w-0 rounded-[8px] py-1 px-1 bg-transparent hover:bg-[var(--surface-card-hover)] transition-colors cursor-pointer"
              >
                <img
                  src="/assets/mesoffice-logo.png"
                  alt="Logo deskhive-harness"
                  className="w-9 h-9 object-contain shrink-0"
                />
                <span className="text-[14px] leading-[24px] font-bold tracking-[-0.01em] text-[var(--text)] whitespace-nowrap truncate">
                  deskhive-harness
                </span>
              </button>
              <button
                type="button"
                aria-label="Thu gọn thanh bên"
                title="Thu gọn thanh bên"
                onClick={() => {
                  setLogoHovered(false);
                  setSidebarOpen(false);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors shrink-0 cursor-pointer"
              >
                <IconLayoutSidebar size={20} stroke={1.75} />
              </button>
            </>
          ) : (
            /* Collapsed event: hover on app logo transforms to layout-sidebar-right; click expands */
            <button
              type="button"
              aria-label="Mở rộng thanh bên"
              title="Mở rộng thanh bên"
              onMouseEnter={() => setLogoHovered(true)}
              onMouseLeave={() => setLogoHovered(false)}
              onFocus={() => setLogoHovered(true)}
              onBlur={() => setLogoHovered(false)}
              onClick={() => {
                setLogoHovered(false);
                setSidebarOpen(true);
              }}
              className="w-10 h-10 rounded-[10px] bg-transparent hover:bg-[var(--surface-card-hover)] text-[var(--text)] flex items-center justify-center transition-colors cursor-pointer"
            >
              {logoHovered ? (
                <IconLayoutSidebarRight size={20} stroke={1.75} className="text-[var(--text)]" />
              ) : (
                <img
                  src="/assets/mesoffice-logo.png"
                  alt="Logo deskhive-harness"
                  className="w-9 h-9 object-contain"
                />
              )}
            </button>
          )}
        </div>

        {/* Sidebar Content: feature group (no scroll) + chat-session group (scroll enable) */}
        <div className="flex-1 min-h-0 flex flex-col px-3 py-2 gap-4 overflow-hidden">
          {/* group.feature (scroll: disable) */}
          <div className="shrink-0 flex flex-col gap-1">
            <button
              type="button"
              onClick={openProjectsList}
              title="Dự án"
              aria-current={activeView === 'projects' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[14px] leading-[20px] font-semibold transition-colors cursor-pointer ${
                sidebarOpen ? 'justify-start pr-10' : 'justify-center px-0'
              } ${
                activeView === 'projects'
                  ? 'bg-[var(--surface-control)] text-[var(--text)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
              }`}
            >
              {activeView === 'projects' ? (
                <IconFoldersFilled size={19} className="shrink-0 text-[var(--accent-ink)]" />
              ) : (
                <IconFolders size={19} stroke={1.75} className="shrink-0" />
              )}
              {sidebarOpen && <span className="whitespace-nowrap truncate">Dự án</span>}
            </button>
          </div>

          {/* group.chat-session (scroll: enable, title: history) */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {sidebarOpen && (
              <div className="px-3 pb-2 shrink-0 flex items-center justify-between">
                <span className="text-[12px] leading-[16px] font-bold tracking-[0.06em] text-[var(--text-muted)]">
                  Lịch sử
                </span>
                <span className="text-[12px] leading-[16px] text-[var(--text-muted)] tabular-nums">
                  {chatSessions.length}
                </span>
              </div>
            )}

            <div className="flex-1 min-h-0 scroll-area flex flex-col gap-1 pr-0.5">
              {chatSessions.length === 0 ? (
                sidebarOpen ? (
                  <p className="px-3 py-4 text-[13px] leading-[20px] text-[var(--text-muted)]">
                    Chưa có cuộc hội thoại nào. Mở một dự án để bắt đầu.
                  </p>
                ) : null
              ) : (
                chatSessions.map((session) => {
                  const isActive =
                    activeView === 'project-detail' && activeSessionId === session.id;
                  return (
                    <div key={session.id} className="relative group">
                    <button
                      type="button"
                      title={`${session.title} — ${getProjectTitle(session.projectId)}`}
                      onClick={() => openChatSession(session.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-left transition-colors cursor-pointer ${
                        sidebarOpen ? 'justify-start pr-10' : 'justify-center px-0'
                      } ${
                        isActive
                          ? 'bg-[var(--surface-control)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      {isActive ? (
                        <IconMessageFilled size={17} className="shrink-0 text-[var(--accent-ink)]" />
                      ) : (
                        <IconMessage size={17} stroke={1.75} className="shrink-0" />
                      )}
                      {sidebarOpen && (
                        <div className="min-w-0 flex-1 flex flex-col">
                          <span
                            className={`text-[13px] leading-[20px] truncate ${
                              isActive
                                ? 'font-semibold text-[var(--text)]'
                                : 'font-normal text-[var(--text-body)]'
                            }`}
                          >
                            {session.title}
                          </span>
                          <span className="text-[12px] leading-[16px] text-[var(--text-muted)] truncate tabular-nums">
                            {getProjectTitle(session.projectId)} · {formatShortDate(session.updatedAt)}
                          </span>
                        </div>
                      )}
                    </button>
                    {sidebarOpen && <button type="button" disabled={isAgentResponding}
                      title={isAgentResponding ? 'Chờ câu trả lời hoàn tất' : `Xóa phiên ${session.title}`}
                      aria-label={`Xóa phiên ${session.title}`}
                      onClick={() => setDeleteTarget(session)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--destroy-fg)] hover:bg-[var(--destroy-bg)] disabled:opacity-30 cursor-pointer">
                      <IconTrash size={15} />
                    </button>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-[var(--divider)] shrink-0" />

        {/* Sidebar Footer: expanded shows avatar + name/role + selector; collapsed shows avatar only; both open popover */}
        <div
          className={`shrink-0 flex items-center ${
            sidebarOpen ? 'p-2.5 justify-between' : 'p-3 justify-center'
          }`}
        >
          <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
            <PopoverTrigger asChild>
              {sidebarOpen ? (
                <button
                  type="button"
                  aria-label={`Tùy chọn tài khoản ${currentUser.name}`}
                  className="w-full flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-[10px] bg-transparent hover:bg-[var(--surface-card-hover)] transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {avatarFailed || !currentUser.avatarUrl ? (
                      <div className="w-9 h-9 rounded-full bg-[var(--surface-control)] text-[var(--accent-ink)] flex items-center justify-center text-[13px] font-bold shrink-0">
                        {currentUser.name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()}
                      </div>
                    ) : (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.name}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                        className="w-9 h-9 rounded-full object-cover shrink-0 bg-[var(--surface-control)]"
                      />
                    )}
                    <div className="min-w-0 flex flex-col">
                      <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)] truncate">
                        {currentUser.name}
                      </span>
                      <span className="text-[12px] leading-[16px] text-[var(--text-muted)] truncate">
                        {currentUser.email || currentUser.role}
                      </span>
                    </div>
                  </div>
                  <span className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[var(--text-muted)] shrink-0">
                    <IconSelector size={18} stroke={1.75} />
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Tài khoản ${currentUser.name}`}
                  title={currentUser.name}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent hover:bg-[var(--surface-card-hover)] transition-colors shrink-0 cursor-pointer"
                >
                  {avatarFailed || !currentUser.avatarUrl ? (
                    <div className="w-9 h-9 rounded-full bg-[var(--surface-control)] text-[var(--accent-ink)] flex items-center justify-center text-[13px] font-bold shrink-0">
                      {currentUser.name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()}
                    </div>
                  ) : (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.name}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                      className="w-9 h-9 rounded-full object-cover shrink-0 bg-[var(--surface-control)]"
                    />
                  )}
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent
              side={sidebarOpen ? 'top' : 'right'}
              align={sidebarOpen ? 'center' : 'end'}
              sideOffset={sidebarOpen ? 8 : 10}
              className="w-[236px] p-2 rounded-[12px] bg-[var(--surface)] border-0 elevated-container text-[var(--text)] flex flex-col gap-1.5"
            >
              <div className="px-2.5 py-1.5 flex flex-col">
                <span className="text-[14px] leading-[20px] font-semibold text-[var(--text)] truncate">
                  {currentUser.name}
                </span>
                <span className="text-[12px] leading-[16px] text-[var(--text-muted)] truncate">
                  {currentUser.email || currentUser.role}
                </span>
              </div>

              <div className="h-px w-full bg-[var(--divider)]" />

              <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] leading-[18px] font-medium text-[var(--text-muted)]">
                  Giao diện
                </span>
                <div
                  role="radiogroup"
                  aria-label="Chế độ giao diện"
                  className="inline-flex items-center p-0.5 rounded-[8px] bg-[var(--surface-track)] gap-0.5"
                >
                  {THEME_OPTIONS.map(({ value, label, Icon }) => {
                    const active = themeMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={label}
                        title={label}
                        onClick={() => setThemeMode(value)}
                        className={`w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--surface)] dark:bg-[#1B2C4E] text-[var(--text)] shadow-xs'
                            : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        <Icon size={15} stroke={1.75} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px w-full bg-[var(--divider)]" />

              <button
                type="button"
                onClick={() => {
                  setUserPopoverOpen(false);
                  setLogoutDialogOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] bg-transparent text-[13px] leading-[18px] font-semibold text-[var(--destroy-fg)] hover:bg-[var(--destroy-bg)] hover:text-[var(--destroy-fg-hover)] transition-colors cursor-pointer"
              >
                <IconLogout size={17} stroke={1.75} className="shrink-0" />
                <span>Đăng xuất</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </aside>

      {/* Logout Dialog: header (title + x), content (recommendation), footer right-aligned (Đăng xuất outline, Hủy filled) */}
      {logoutDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
          onClick={() => setLogoutDialogOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
        >
          <div
            className="w-full max-w-[420px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4">
              <h3
                id="logout-dialog-title"
                className="text-[20px] leading-[24px] font-semibold text-[var(--text)]"
              >
                Đăng xuất khỏi phiên làm việc
              </h3>
              <button
                type="button"
                aria-label="Đóng hộp thoại đăng xuất"
                title="Đóng"
                onClick={() => setLogoutDialogOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <IconX size={20} stroke={1.75} />
              </button>
            </div>

            <div className="h-px w-full bg-[var(--divider)]" />

            <div className="px-6 py-5">
              <p className="text-[16px] leading-[24px] text-[var(--text-body)]">
                Phiên làm việc hiện tại sẽ kết thúc. Toàn bộ dự án, tài liệu đã tóm tắt và lịch đã
                duyệt vẫn được lưu an toàn tại máy cục bộ.
              </p>
            </div>

            <div className="h-px w-full bg-[var(--divider)]" />

            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setLogoutDialogOpen(false);
                  logoutUser();
                }}
                className="px-4 py-2 rounded-[8px] bg-transparent border border-[var(--destroy-fg)]/45 text-[14px] leading-[20px] font-semibold text-[var(--destroy-fg)] hover:border-[var(--destroy-fg)] transition-colors whitespace-nowrap cursor-pointer"
              >
                Đăng xuất
              </button>
              <button
                type="button"
                onClick={() => setLogoutDialogOpen(false)}
                className="px-5 py-2 rounded-[8px] bg-[var(--primary-btn-bg)] text-[var(--primary-btn-fg)] text-[14px] leading-[20px] font-semibold hover:bg-[var(--primary-btn-hover)] transition-colors whitespace-nowrap cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDeleteDialog open={Boolean(deleteTarget)} title="Xóa phiên chat?"
        description={`Xóa vĩnh viễn “${deleteTarget?.title || ''}” và toàn bộ tin nhắn trong phiên. Dự án và tài nguyên vẫn được giữ lại.`}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => deleteTarget ? deleteChatSession(deleteTarget.id) : Promise.resolve(false)} />
    </>
  );
}
