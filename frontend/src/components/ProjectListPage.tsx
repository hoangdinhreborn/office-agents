import {
  IconArrowsSort,
  IconCheck,
  IconDotsVertical,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTag,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { Project, SortMode } from '../types/workspace';
import { formatDateDDMMYYYY, projectTitleSchema } from '../utils/format';
import { NewProjectDialog } from './NewProjectDialog';
import { PickIconDialog } from './PickIconDialog';
import { ProjectIcon } from './ProjectIcon';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date_desc', label: 'Ngày tạo: Mới nhất' },
  { value: 'date_asc', label: 'Ngày tạo: Cũ nhất' },
  { value: 'name_asc', label: 'Tên dự án: A → Z' },
  { value: 'name_desc', label: 'Tên dự án: Z → A' },
];

export function ProjectListPage() {
  const projects = useWorkspaceStore((s) => s.projects);
  const projectSearch = useWorkspaceStore((s) => s.projectSearch);
  const projectSort = useWorkspaceStore((s) => s.projectSort);
  const setProjectSearch = useWorkspaceStore((s) => s.setProjectSearch);
  const setProjectSort = useWorkspaceStore((s) => s.setProjectSort);
  const openProjectDetail = useWorkspaceStore((s) => s.openProjectDetail);
  const renameProject = useWorkspaceStore((s) => s.renameProject);
  const changeProjectIcon = useWorkspaceStore((s) => s.changeProjectIcon);
  const deleteProject = useWorkspaceStore((s) => s.deleteProject);

  const [sortOpen, setSortOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [iconTarget, setIconTarget] = useState<Project | null>(null);

  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
      if (!(e.target as HTMLElement).closest('[data-card-menu="true"]')) {
        setOpenMenuProjectId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    const filtered = q
      ? projects.filter((p) => p.title.toLowerCase().includes(q))
      : [...projects];

    filtered.sort((a, b) => {
      switch (projectSort) {
        case 'date_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_asc':
          return a.title.localeCompare(b.title, 'vi');
        case 'name_desc':
          return b.title.localeCompare(a.title, 'vi');
      }
    });
    return filtered;
  }, [projects, projectSearch, projectSort]);

  const handleConfirmRename = async () => {
    if (!renameTarget) return;
    const parsed = projectTitleSchema.safeParse(renameValue);
    if (!parsed.success) {
      setRenameError(parsed.error.issues[0]?.message ?? 'Tiêu đề không hợp lệ.');
      return;
    }
    if (!await renameProject(renameTarget.id, parsed.data)) return;
    setRenameTarget(null);
    setRenameError(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg)]">
      {/* project-page.header: horizontal — left "Dự án", right input-field, arrows-sort icon, "Tạo dự án" button */}
      <header className="h-[64px] shrink-0 px-6 flex items-center justify-between gap-4">
        <h1 className="text-[25px] leading-[32px] font-bold tracking-[-0.01em] text-[var(--text)] whitespace-nowrap shrink-0">
          Dự án
        </h1>

        <div className="flex items-center gap-3 min-w-0">
          {/* Search input-field (outline: bg-transparent + border) */}
          <div className="relative flex items-center w-[220px] sm:w-[260px]">
            <IconSearch
              size={17}
              stroke={1.75}
              className="absolute left-3 text-[var(--text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Tìm kiếm dự án..."
              aria-label="Tìm kiếm dự án"
              className="w-full h-10 pl-9 pr-8 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] text-[var(--text)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-hover)]"
            />
            {projectSearch && (
              <button
                type="button"
                aria-label="Xóa từ khóa tìm kiếm"
                onClick={() => setProjectSearch('')}
                className="absolute right-1.5 w-7 h-7 flex items-center justify-center rounded-[6px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] cursor-pointer"
              >
                <IconX size={15} stroke={1.75} />
              </button>
            )}
          </div>

          {/* Sort icon -> opens filled popover */}
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              aria-label="Sắp xếp dự án"
              title="Sắp xếp dự án"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((v) => !v)}
              className={`w-10 h-10 flex items-center justify-center rounded-[8px] transition-colors cursor-pointer ${
                sortOpen
                  ? 'bg-[var(--surface-control)] text-[var(--text)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
              }`}
            >
              <IconArrowsSort size={20} stroke={1.75} />
            </button>

            {sortOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-[220px] rounded-[12px] bg-[var(--surface)] elevated-container p-1.5 z-30 flex flex-col gap-0.5"
              >
                {SORT_OPTIONS.map((opt) => {
                  const active = projectSort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setProjectSort(opt.value);
                        setSortOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-[8px] text-[14px] leading-[20px] transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--surface-control)] text-[var(--text)] font-semibold'
                          : 'bg-transparent text-[var(--text-body)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="whitespace-nowrap">{opt.label}</span>
                      {active && <IconCheck size={16} stroke={2} className="text-[var(--accent-ink)]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Primary CTA: Tạo dự án (filled accent) */}
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            className="h-10 px-4 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] leading-[20px] font-semibold hover:bg-[var(--accent-hover)] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <IconPlus size={18} stroke={2} />
            <span>Tạo dự án</span>
          </button>
        </div>
      </header>

      <div className="h-px w-full bg-[var(--divider)] shrink-0" />

      {/* project-page.content: scroll enable, 5-column grid */}
      <main className="flex-1 min-h-0 scroll-area p-6">
        {visibleProjects.length === 0 ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center gap-3 max-w-[420px] mx-auto">
            <h2 className="text-[20px] leading-[24px] font-semibold text-[var(--text)]">
              {projectSearch ? 'Không tìm thấy dự án phù hợp' : 'Chưa có dự án nào'}
            </h2>
            <p className="text-[16px] leading-[24px] text-[var(--text-muted)]">
              {projectSearch
                ? `Không có dự án nào khớp với từ khóa "${projectSearch}".`
                : 'Tạo dự án mới để gom tài liệu PDF, đồng bộ email và lập lịch làm việc trong một nơi.'}
            </p>
            {projectSearch ? (
              <button
                type="button"
                onClick={() => setProjectSearch('')}
                className="mt-1 px-4 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] font-semibold text-[var(--text)] hover:border-[var(--border-hover)] transition-colors cursor-pointer"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setNewProjectOpen(true)}
                className="mt-1 px-5 py-2.5 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] leading-[20px] font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
              >
                Tạo dự án đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visibleProjects.map((project) => {
              const menuOpen = openMenuProjectId === project.id;
              const sourceCount = project.resources.length;
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openProjectDetail(project.id, true, null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openProjectDetail(project.id, true, null);
                    }
                  }}
                  className="relative group rounded-[12px] bg-[var(--surface-card)] hover:bg-[var(--surface-card-hover)] transition-colors p-4 flex flex-col justify-between min-h-[156px] text-left cursor-pointer"
                >
                  {/* Top row: chosen icon left (ghost), dots-vertical right (ghost) */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="w-9 h-9 rounded-[8px] bg-transparent text-[var(--accent-ink)] flex items-center justify-center">
                      <ProjectIcon code={project.icon} size={22} />
                    </span>

                    <div className="relative" data-card-menu="true">
                      <button
                        type="button"
                        aria-label={`Tùy chọn cho ${project.title}`}
                        title="Tùy chọn"
                        aria-expanded={menuOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuProjectId(menuOpen ? null : project.id);
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-panel)] hover:text-[var(--text)] transition-colors cursor-pointer"
                      >
                        <IconDotsVertical size={18} stroke={1.75} />
                      </button>

                      {menuOpen && (
                        <div
                          role="menu"
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 mt-1.5 w-[180px] rounded-[12px] bg-[var(--surface)] elevated-container p-1.5 z-30 flex flex-col gap-0.5"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuProjectId(null);
                              setRenameTarget(project);
                              setRenameValue(project.title);
                              setRenameError(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] text-[14px] leading-[20px] text-[var(--text-body)] hover:text-[var(--text)] cursor-pointer"
                          >
                            <IconEdit size={16} stroke={1.75} />
                            <span>Sửa tiêu đề</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuProjectId(null);
                              setIconTarget(project);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-transparent hover:bg-[var(--surface-card-hover)] text-[14px] leading-[20px] text-[var(--text-body)] hover:text-[var(--text)] cursor-pointer"
                          >
                            <IconTag size={16} stroke={1.75} />
                            <span>Đổi nhãn</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMenuProjectId(null);
                              deleteProject(project.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-transparent hover:bg-[var(--destroy-bg)] text-[14px] leading-[20px] font-semibold text-[var(--destroy-fg)] hover:text-[var(--destroy-fg-hover)] cursor-pointer"
                          >
                            <IconTrash size={16} stroke={1.75} />
                            <span>Xóa dự án</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom stacked block: project title + dd-mm-yyyy · i nguồn */}
                  <div className="mt-5 flex flex-col gap-1.5">
                    <h2 className="text-[16px] leading-[24px] font-semibold text-[var(--text)] line-clamp-2">
                      {project.title}
                    </h2>
                    <p className="text-[13px] leading-[20px] text-[var(--text-muted)] tabular-nums">
                      {formatDateDDMMYYYY(project.createdAt)} · {sourceCount} nguồn
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New Project Dialog */}
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />

      {/* Rename Project Dialog */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)] p-4"
          onClick={() => setRenameTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-project-title"
        >
          <div
            className="w-full max-w-[420px] rounded-[16px] bg-[var(--surface)] elevated-container flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4">
              <h3
                id="rename-project-title"
                className="text-[20px] leading-[24px] font-semibold text-[var(--text)]"
              >
                Sửa tiêu đề dự án
              </h3>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setRenameTarget(null)}
                className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-card-hover)] hover:text-[var(--text)] cursor-pointer"
              >
                <IconX size={20} stroke={1.75} />
              </button>
            </div>
            <div className="h-px w-full bg-[var(--divider)]" />
            <div className="p-6 flex flex-col gap-2">
              <label
                htmlFor="rename-input"
                className="text-[14px] leading-[20px] font-semibold text-[var(--text)]"
              >
                Tiêu đề mới
              </label>
              <input
                id="rename-input"
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  if (renameError) setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename();
                }}
                className="w-full h-10 px-3 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] text-[var(--text)] hover:border-[var(--border-hover)]"
              />
              {renameError && (
                <p className="text-[12px] leading-[18px] font-semibold text-[var(--destroy-fg)]">
                  {renameError}
                </p>
              )}
            </div>
            <div className="h-px w-full bg-[var(--divider)]" />
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 rounded-[8px] bg-transparent border border-[var(--border)] text-[14px] leading-[20px] font-semibold text-[var(--text-body)] hover:border-[var(--border-hover)] hover:text-[var(--text)] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmRename}
                className="px-5 py-2 rounded-[8px] bg-[#FCA311] text-[#14213D] text-[14px] leading-[20px] font-semibold hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Icon Dialog */}
      <PickIconDialog
        open={Boolean(iconTarget)}
        selectedIcon={iconTarget?.icon ?? 'briefcase'}
        onSelect={(code) => {
          if (iconTarget) changeProjectIcon(iconTarget.id, code);
        }}
        onClose={() => setIconTarget(null)}
      />
    </div>
  );
}
