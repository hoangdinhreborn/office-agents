import { z } from 'zod';
import { apiRequest, baseUrl } from './api-client';

const statusSchema = z.object({
  configured: z.boolean(), authenticated: z.boolean(), gmail_connected: z.boolean(), calendar_connected: z.boolean(),
  configuration_error: z.string().nullable(),
});
export const loadGoogleAuthStatus = async () => statusSchema.parse(await apiRequest('/api/auth/google/status', { signal: AbortSignal.timeout(15000) }));
export const startGoogleLogin = () => window.location.assign(`${baseUrl}/api/auth/google/start`);

const oauthErrors: Record<string, string> = {
  configuration: 'Cấu hình Google OAuth chưa hợp lệ. Kiểm tra credentials và địa chỉ callback ở backend.',
  invalid_state: 'Phiên đăng nhập không khớp trình duyệt này. Hãy bấm đăng nhập lại.',
  expired: 'Phiên đăng nhập đã hết hạn hoặc backend vừa khởi động lại. Hãy thử lại.',
  denied: 'Bạn chưa cấp quyền Google. Có thể đăng nhập lại khi sẵn sàng.',
  missing_scopes: 'Cần cấp đủ quyền Gmail và Calendar để kết nối deskhive-harness. Hãy đăng nhập lại và chọn các quyền cần thiết.',
  identity: 'Chưa xác minh được tài khoản Google. Hãy đăng nhập lại.',
  wrong_account: 'Tài khoản này không khớp email chủ máy đã cấu hình.',
  storage: 'Backend chưa lưu được token Google. Kiểm tra quyền ghi thư mục token rồi đăng nhập lại.',
  busy: 'Đang có quá nhiều phiên đăng nhập chờ xử lý. Hãy thử lại sau.',
  exchange: 'Chưa hoàn tất trao đổi mã đăng nhập với Google. Hãy thử đăng nhập lại.',
};
export const oauthErrorMessage = (code: string) => oauthErrors[code] || 'Chưa kết nối được Google. Hãy đăng nhập lại.';
