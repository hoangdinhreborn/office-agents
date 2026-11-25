import { IconArrowRight, IconCalendar, IconDeviceDesktop, IconLoader2, IconMail, IconMoon, IconRefresh, IconShieldCheck, IconSun } from '@tabler/icons-react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ThemeMode } from '../types/workspace';
import { Button } from './ui/button';
import { AuthLightning } from './AuthLightning';
import './GoogleAuthPage.css';

export interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  gmail_connected: boolean;
  calendar_connected: boolean;
}

interface GoogleAuthPageProps {
  status: GoogleAuthStatus | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onLogin: () => void;
}

const AUTH_THEMES: Array<{ value: ThemeMode; label: string; Icon: typeof IconSun }> = [
  { value: 'light', label: 'Sáng', Icon: IconSun },
  { value: 'dark', label: 'Tối', Icon: IconMoon },
  { value: 'system', label: 'Theo hệ thống', Icon: IconDeviceDesktop },
];

function GoogleMark() {
  return (
    <svg className="sov-auth-google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59c.79-2.36 3-4.12 5.6-4.12Z" />
    </svg>
  );
}

export function GoogleAuthPage({ status, loading, error, onRetry, onLogin }: GoogleAuthPageProps) {
  const themeMode = useWorkspaceStore((state) => state.themeMode);
  const setThemeMode = useWorkspaceStore((state) => state.setThemeMode);
  const needsReconnect = Boolean(status?.authenticated);
  const canLogin = Boolean(status?.configured) && !loading;

  return (
    <main className="sov-auth-shell" aria-busy={loading}>
      <section className="sov-auth-brand" aria-label="deskhive-harness">
        <AuthLightning />
        <div className="sov-auth-brand-center">
          <img className="sov-auth-logo" src="/assets/mesoffice-logo.png" alt="" width="280" height="280" />
          <h1>deskhive-harness</h1>
          <p>Gọn việc hôm nay, <br />chủ động ngày mai.</p>
        </div>
      </section>

      <section className="sov-auth-panel" aria-labelledby="sov-auth-title">
        <div className="sov-auth-panel-top">
          <div className="sov-auth-themes" role="group" aria-label="Chế độ giao diện">
            {AUTH_THEMES.map(({ value, label, Icon }) => (
              <button key={value} type="button" aria-pressed={themeMode === value} aria-label={label} title={label} onClick={() => setThemeMode(value)}><Icon size={15} stroke={1.75} aria-hidden="true" /></button>
            ))}
          </div>
        </div>
        <div className="sov-auth-content">
          <h2 id="sov-auth-title"><span className="sov-auth-title-accent">{needsReconnect ? 'Kết nối lại,' : 'Chào bạn,'}</span><br />{needsReconnect ? 'tiếp tục công việc.' : 'vào việc thôi.'}</h2>
          <p className="sov-auth-intro">Kết nối tài khoản Google để đưa email, tài liệu và lịch hẹn về cùng một nơi.</p>

          <div className="sov-auth-services" aria-label="Các dịch vụ được kết nối">
            <div><IconMail size={20} aria-hidden="true" /><span>Gmail</span>{status?.gmail_connected && <span className="sov-auth-connected">Đã kết nối</span>}</div>
            <div><IconCalendar size={20} aria-hidden="true" /><span>Google Calendar</span>{status?.calendar_connected && <span className="sov-auth-connected">Đã kết nối</span>}</div>
          </div>

          <Button type="button" className="sov-auth-login" disabled={!canLogin} onClick={onLogin}>
            {loading ? <IconLoader2 className="sov-auth-spinner" size={20} aria-hidden="true" /> : <GoogleMark />}
            <span>{loading ? 'Đang kiểm tra kết nối…' : needsReconnect ? 'Kết nối lại với Google' : 'Tiếp tục với Google'}</span>
            {!loading && <IconArrowRight className="sov-auth-login-arrow" size={19} aria-hidden="true" />}
          </Button>

          <div className="sov-auth-feedback" aria-live="polite" aria-atomic="true">
            {error && <p className="sov-auth-error" role="alert">{error}</p>}
            {!error && status?.configured === false && <p className="sov-auth-error" role="alert">Kết nối Google chưa được cấu hình trên máy chủ. Hãy thiết lập thông tin OAuth rồi thử lại.</p>}
            {loading && <p role="status">Đang kiểm tra trạng thái kết nối Google.</p>}
            {!loading && (error || !status || status.configured === false) && (
              <Button type="button" variant="ghost" size="sm" className="sov-auth-retry" onClick={onRetry}><IconRefresh size={16} aria-hidden="true" />Kiểm tra lại</Button>
            )}
          </div>

          <p className="sov-auth-assurance"><IconShieldCheck size={19} aria-hidden="true" /><span>Bạn xác nhận quyền truy cập trực tiếp trên Google. deskhive-harness không yêu cầu mật khẩu của bạn.</span></p>
        </div>
      </section>
    </main>
  );
}
