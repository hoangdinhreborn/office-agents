"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/layout/topbar";
import { Sidebar } from "@/components/layout/sidebar";
import { ChatView } from "@/components/chat/chat-view";
import { DocsView } from "@/components/views/docs-view";
import { InboxView } from "@/components/views/inbox-view";
import { CalendarView } from "@/components/views/calendar-view";
import { TasksView } from "@/components/views/tasks-view";
import { TrainingView } from "@/components/views/training-view";

import { CommandPalette } from "@/components/modals/command-palette";
import { ModelModal } from "@/components/modals/model-modal";
import { AddTaskModal } from "@/components/modals/add-task-modal";
import { CreateEventModal } from "@/components/modals/create-event-modal";
import { SendEmailModal } from "@/components/modals/send-email-modal";
import { CritiqueModal } from "@/components/modals/critique-modal";
import { FolderRulesModal } from "@/components/modals/folder-rules-modal";
import { DailyDigestModal } from "@/components/modals/daily-digest-modal";

import {
  ChatMessageItem,
  ChatSessionSummary,
  SystemStatus,
  UpcomingEventsResponse,
} from "@/types";
import { api } from "@/lib/api";
import { playChime } from "@/lib/audio";
import { toast } from "sonner";

export default function DashboardPage() {
  // Navigation & View State
  const [currentView, setCurrentView] = useState<string>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // System & Model Status
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [upcomingData, setUpcomingData] = useState<UpcomingEventsResponse | null>(null);
  const [pendingTasksCount, setPendingTasksCount] = useState<number>(0);

  // Chat Sessions & History State
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Composer State
  const [selectedAgent, setSelectedAgent] = useState<string>("auto");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  // Modals Open State
  const [openCommand, setOpenCommand] = useState(false);
  const [openModel, setOpenModel] = useState(false);
  const [openAddTask, setOpenAddTask] = useState(false);
  const [openCreateEvent, setOpenCreateEvent] = useState(false);
  const [openSendEmail, setOpenSendEmail] = useState(false);
  const [openFolderRules, setOpenFolderRules] = useState(false);
  const [openDailyDigest, setOpenDailyDigest] = useState(false);
  const [critiqueState, setCritiqueState] = useState<{
    open: boolean;
    prompt: string;
    response: string;
  }>({
    open: false,
    prompt: "",
    response: "",
  });

  // 1. Initial Load: System Status & Notifications
  const loadInitialData = useCallback(async () => {
    try {
      const [sysStatus, upcoming, sessList] = await Promise.all([
        api.getSystemStatus().catch(() => null),
        api.getUpcomingEvents(24).catch(() => null),
        api.listChatSessions().catch(() => []),
      ]);

      if (sysStatus) setStatus(sysStatus);
      if (upcoming) setUpcomingData(upcoming);
      setSessions(sessList);

      // Restore active session from localStorage or use latest
      const savedSessionId = localStorage.getItem("local_assistant_active_session_id");
      if (savedSessionId && sessList.some((s: ChatSessionSummary) => s.id === savedSessionId)) {
        setActiveSessionId(savedSessionId);
        loadSessionMessages(savedSessionId);
      } else if (sessList.length > 0) {
        setActiveSessionId(sessList[0].id);
        loadSessionMessages(sessList[0].id);
      }
    } catch (e) {
      console.warn("Lỗi nạp dữ liệu ban đầu:", e);
    }
  }, []);

  useEffect(() => {
    loadInitialData();

    // Polling upcoming events and system health
    const intervalId = setInterval(async () => {
      try {
        const upcoming = await api.getUpcomingEvents(24);
        setUpcomingData(upcoming);
        if (upcoming.imminent_count > 0) {
          playChime("notification");
        }
      } catch {}
    }, 30000);

    return () => clearInterval(intervalId);
  }, [loadInitialData]);

  // 2. Load Messages for a specific session
  const loadSessionMessages = async (sessionId: string) => {
    try {
      const detail = await api.getChatSessionDetail(sessionId);
      setMessages(detail.messages || []);
    } catch (e: any) {
      console.warn("Lỗi nạp tin nhắn session:", e);
    }
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    localStorage.setItem("local_assistant_active_session_id", id);
    loadSessionMessages(id);
  };

  const handleNewSession = async () => {
    try {
      const newSess = await api.createChatSession("Cuộc trò chuyện mới");
      setSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(newSess.id);
      localStorage.setItem("local_assistant_active_session_id", newSess.id);
      setMessages([]);
      setCurrentView("chat");
      toast.success("Đã tạo phiên trò chuyện mới!");
    } catch (e: any) {
      toast.error(e.message || "Lỗi tạo phiên");
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa phiên trò chuyện này không?")) return;
    try {
      await api.deleteChatSession(id);
      const updated = sessions.filter((s) => s.id !== id);
      setSessions(updated);
      toast.info("Đã xóa phiên trò chuyện");

      if (activeSessionId === id) {
        if (updated.length > 0) {
          handleSelectSession(updated[0].id);
        } else {
          setActiveSessionId(null);
          localStorage.removeItem("local_assistant_active_session_id");
          setMessages([]);
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Lỗi xóa phiên");
    }
  };

  // 3. Send Message Action
  const handleSendMessage = async (msg: string, file?: File, agent?: string) => {
    setIsLoading(true);

    // Optimistic UI for user message
    const tempUserMsg: ChatMessageItem = {
      id: "temp-" + Date.now(),
      session_id: activeSessionId || "",
      role: "user",
      content: msg + (file ? ` [Tài liệu: ${file.name}]` : ""),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      let resp;
      if (file) {
        resp = await api.sendMessageWithFile(msg, file, activeSessionId || undefined);
      } else {
        resp = await api.sendMessage({
          message: msg,
          session_id: activeSessionId || undefined,
        });
      }

      if (resp.session_id) {
        setActiveSessionId(resp.session_id);
        localStorage.setItem("local_assistant_active_session_id", resp.session_id);
        // Refresh session list to show updated title
        api.listChatSessions().then(setSessions);
      }

      const aiMsg: ChatMessageItem = {
        id: "ai-" + Date.now(),
        session_id: resp.session_id || activeSessionId || "",
        role: "ai",
        content: resp.response,
        thinking_process: resp.thinking_process,
        agents_invoked: resp.agents_invoked,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      playChime("success");
    } catch (e: any) {
      toast.error(e.message || "Lỗi giao tiếp với AI");
      const errorMsg: ChatMessageItem = {
        id: "err-" + Date.now(),
        session_id: activeSessionId || "",
        role: "ai",
        content: `❌ Lỗi máy chủ: ${e.message}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (promptText: string) => {
    setCurrentView("chat");
    handleSendMessage(promptText);
  };

  // 4. Keyboard Shortcuts (Ctrl+1..6, Ctrl+B, Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenCommand((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && ["1", "2", "3", "4", "5", "6"].includes(e.key)) {
        e.preventDefault();
        const views = ["chat", "docs", "inbox", "calendar", "tasks", "training"];
        setCurrentView(views[parseInt(e.key) - 1]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="h-screen h-[100dvh] flex flex-col overflow-hidden bg-background">
      {/* VÙNG 1: TOPBAR */}
      <Topbar
        status={status}
        upcomingData={upcomingData}
        onRefreshNotifications={() => api.getUpcomingEvents(24).then(setUpcomingData)}
        onNavigateToCalendar={() => setCurrentView("calendar")}
        onOpenModelModal={() => setOpenModel(true)}
        onOpenCommandPalette={() => setOpenCommand(true)}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* BODY (SIDEBAR + WORKSPACE) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* VÙNG 2: SIDEBAR */}
        <Sidebar
          currentView={currentView}
          onSelectView={setCurrentView}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          pendingTasksCount={pendingTasksCount}
          readyTrain={false}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onQuickSelectAgent={(agent) => {
            setSelectedAgent(agent);
            setCurrentView("chat");
            toast.info(`Đã chọn ${agent.toUpperCase()} Agent`);
          }}
        />

        {/* VÙNG 3: CONTEXTUAL WORKSPACE ROUTER */}
        <main className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden relative">
          <div className={currentView === "chat" ? "flex-1 min-h-0 flex flex-col min-w-0" : "hidden"}>
            <ChatView
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              onQuickPrompt={handleQuickPrompt}
              onOpenCritique={(p, r) =>
                setCritiqueState({ open: true, prompt: p, response: r })
              }
              selectedAgent={selectedAgent}
              onSelectAgent={setSelectedAgent}
              attachedFile={attachedFile}
              onAttachFile={setAttachedFile}
            />
          </div>

          <div className={currentView === "docs" ? "flex-1 min-h-0 flex flex-col min-w-0" : "hidden"}>
            <DocsView onQuickPrompt={handleQuickPrompt} />
          </div>

          <div className={currentView === "inbox" ? "flex-1 min-h-0 flex flex-col min-w-0" : "hidden"}>
            <InboxView
              onQuickPrompt={handleQuickPrompt}
              onOpenSendModal={() => setOpenSendEmail(true)}
              onOpenFolderRulesModal={() => setOpenFolderRules(true)}
              onOpenDailyDigestModal={() => setOpenDailyDigest(true)}
            />
          </div>

          <div className={currentView === "calendar" ? "flex-1 min-h-0 flex flex-col min-w-0" : "hidden"}>
            <CalendarView
              upcomingData={upcomingData}
              onRefreshUpcoming={() => api.getUpcomingEvents(24).then(setUpcomingData)}
              onOpenCreateModal={() => setOpenCreateEvent(true)}
            />
          </div>

          <div className={currentView === "tasks" ? "flex-1 min-h-0 flex flex-col min-w-0" : "hidden"}>
            <TasksView
              onOpenAddModal={() => setOpenAddTask(true)}
              onTasksCountChange={setPendingTasksCount}
            />
          </div>

          <div className={currentView === "training" ? "flex-1 min-h-0 flex flex-col min-w-0" : "hidden"}>
            <TrainingView />
          </div>
        </main>
      </div>

      {/* MODALS */}
      <CommandPalette
        open={openCommand}
        onOpenChange={setOpenCommand}
        onSelectAction={(action) => setCurrentView(action)}
      />

      <ModelModal
        open={openModel}
        onOpenChange={setOpenModel}
        status={status}
        onReloadSuccess={() => api.getSystemStatus().then(setStatus)}
      />

      <AddTaskModal
        open={openAddTask}
        onOpenChange={setOpenAddTask}
        onSuccess={() => {
          // If in tasks view, will be handled by reload
        }}
      />

      <CreateEventModal
        open={openCreateEvent}
        onOpenChange={setOpenCreateEvent}
        onSuccess={() => {
          api.getUpcomingEvents(24).then(setUpcomingData);
        }}
      />

      <SendEmailModal
        open={openSendEmail}
        onOpenChange={setOpenSendEmail}
      />

      <FolderRulesModal
        open={openFolderRules}
        onOpenChange={setOpenFolderRules}
      />

      <DailyDigestModal
        open={openDailyDigest}
        onOpenChange={setOpenDailyDigest}
      />

      <CritiqueModal
        open={critiqueState.open}
        onOpenChange={(op) => setCritiqueState((prev) => ({ ...prev, open: op }))}
        prompt={critiqueState.prompt}
        initialResponse={critiqueState.response}
      />
    </div>
  );
}
