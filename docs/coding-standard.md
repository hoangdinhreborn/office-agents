# Coding standard — Office Agents

> Làm đúng nghiệp vụ, dùng đúng phiên bản, chứng minh bằng hành vi chạy được. Chọn cách đơn giản nhất đáp ứng đủ yêu cầu.

Áp dụng cho người và agent khi sửa dự án. Đây là quy tắc triển khai; [business-check.md](../business-check.md), cột **Chốt phạm vi**, quyết định nghiệp vụ. Các quy tắc dưới đây là yêu cầu cho thay đổi mới, không khẳng định code hiện tại đã đáp ứng.

## 1. Đọc đúng trước khi code

1. Đọc yêu cầu, dòng nghiệp vụ liên quan trong `business-check.md`, rồi lần theo UI → store → API → service/agent → DB/provider và test hiện có.
2. Nêu ngắn gọn: hành vi cần đạt, dữ liệu phải lưu, điều kiện bị từ chối, tác động bên ngoài và cách kiểm chứng. Không bắt người dùng duyệt lại những việc đã giao.
3. Khi tài liệu cũ khác code: dùng code/manifest để xác định **hiện trạng kỹ thuật**, dùng **Chốt phạm vi** để xác định **đích nghiệp vụ**. Không giữ hành vi sai chỉ vì test cũ đang mong đợi nó.
4. Nếu thiếu quyết định làm đổi nghiệp vụ, chỉ hỏi phần đó và tiếp tục phần độc lập. Không tự chốt quy tắc xóa dữ liệu, xử lý một người gửi thuộc nhiều dự án, giới hạn file 18 hay 20 MB, hoặc ngưỡng mẫu train chưa được định nghĩa rõ.

**Hiện trạng cần nhớ khi bắt đầu** (phải kiểm tra lại nếu repo thay đổi):

| Thành phần | Nguồn kiểm tra | Lưu ý |
|---|---|---|
| Frontend | `frontend/package.json`, `pnpm-lock.yaml`, `vite.config.ts` | React 19, TypeScript, Vite, Zustand, Tailwind 4; README còn ghi Next.js. `lint` hiện chỉ chạy `tsc --noEmit`. |
| Backend | `backend/requirements.txt`, `app/config.py`, `app/database/` | FastAPI, Pydantic 2, SQLAlchemy 2; requirements dùng giới hạn dưới `>=`, chưa khóa bộ phiên bản chính xác. DB mặc định SQLite; kiểm tra cấu hình thực tế. |
| Tích hợp | `backend/app/integrations/`, `app/llm/` | Gmail, Google Calendar và adapter LLM đa giao thức đã có code; đọc contract hiện tại trước khi mở rộng. |
| Dữ liệu mô phỏng | `frontend/src/data/`, `useWorkspaceStore.ts`, `backend/app/api/feedback.py` | FE còn nhiều luồng giả lập; endpoint train hiện có loss/log mô phỏng. UI hoặc HTTP 200 chưa chứng minh tính năng thật. |

## 2. Đúng phiên bản, không thêm thừa

- Kiểm tra phiên bản **đã cài** và lockfile trước khi dùng API thư viện. Manifest `>=`/`^` không phải phiên bản runtime; ghi phiên bản liên quan khi bàn giao.
- Dùng `pnpm` với lockfile hiện có; không sinh thêm npm/yarn lockfile. Khi thay dependency Python, ghi/pin bộ phiên bản đã kiểm chứng bằng cơ chế đơn giản phù hợp repo; không đóng băng toàn bộ môi trường cá nhân.
- Với API chưa chắc chắn: xem signature/source đã cài hoặc tài liệu chính thức đúng phiên bản, rồi chạy một ví dụ nhỏ. Không lấy snippet phiên bản cũ hoặc đoán tên hàm, endpoint, tham số.
- Trước khi thêm thư viện, binary hoặc dịch vụ, trả lời được: **thiếu khả năng gì, code/thư viện sẵn có có làm được không, chi phí cài đặt/chạy là gì?** Nếu chưa có nhu cầu thực thì không thêm.
- Phân biệt dependency Python/JS với binary hệ thống; kiểm tra đường xử lý thực tế. Không mặc định cài công cụ vì ví dụ trên mạng dùng, cũng không khẳng định không cần nếu chưa kiểm chứng.
- Không nâng major version, đổi framework, đổi DB, thêm queue/vector DB hoặc bật dịch vụ Docker chỉ vì chúng có sẵn hay nghe “chuẩn”. Chỉ thay khi yêu cầu hiện tại cần và có kiểm chứng tương thích.

## 3. Kiến trúc vừa đủ

Giữ một ứng dụng backend chia module như hiện tại. Tách trách nhiệm ở phần đang sửa, không tái cấu trúc toàn repo để đạt một sơ đồ kiến trúc.

| Chỗ đặt code | Trách nhiệm |
|---|---|
| `backend/app/api/`, `schemas/` | Nhận request, kiểm tra schema, gọi nghiệp vụ, trả response/lỗi có kiểu rõ ràng. |
| `services/` | Điều phối một luồng hoàn chỉnh: ingest email, xử lý tài nguyên, duyệt gửi mail/lịch. Là nơi dùng chung cho API, poller và chat. |
| `agents/`, `llm/`, `rag/` | Sinh nội dung, trích xuất, xử lý tài liệu và gọi LLM. Kết quả AI là dữ liệu đề xuất, không có quyền tự thực hiện hành động cần duyệt. |
| `integrations/`, `database/` | Giao tiếp provider; lưu trữ và ràng buộc dữ liệu. Không chứa quyết định hiển thị UI. |
| FE components, store, lớp gọi API | Component hiển thị/tương tác; store giữ trạng thái; lớp gọi API gom URL, mapping và xử lý lỗi. Không rải `fetch` và quy tắc nghiệp vụ khắp component. |

**Chỉ chọn pattern có công dụng cụ thể:**

- **Service Layer:** gom các pipeline rời thành luồng nghiệp vụ tái sử dụng. Bắt đầu bằng hàm hoặc class nhỏ; không tạo class chỉ để bọc một lời gọi.
- **Adapter + Strategy cho LLM:** một interface nhỏ theo thao tác thực sự dùng; adapter theo giao thức `openai-chat`, `openai-responses`, `anthropic-messages`, `ollama-native`. Chọn adapter bằng mapping/registry đơn giản; Ollama/vLLM/LM Studio là cấu hình máy chủ, không mặc định mỗi tên cần một class. Khả năng chưa hỗ trợ phải báo rõ; không âm thầm bỏ tham số.
- **Dependency Injection sẵn có:** dùng `Depends` hoặc truyền dependency để thay DB/provider khi test. Tận dụng `CalendarProvider` hiện có nếu phù hợp; không thêm DI framework hay abstract factory nhiều tầng.

Không mặc định thêm Generic Repository/Unit of Work bọc lại SQLAlchemy, CQRS, event bus, microservice hoặc framework plugin. Một hàm dùng một nơi chưa cần interface. Khi thêm abstraction, giải thích bằng một câu nó loại bỏ lặp ở đâu hoặc cô lập khác biệt đang có nào.

## 4. API, dữ liệu và trạng thái phải khớp nhau

- Đọc router, schema và OpenAPI thực tế trước khi nối FE. Endpoint mới phải có contract cụ thể: method/path, request, response, lỗi, `project_id`, ID nguồn và trạng thái xử lý. Không tự đặt đường dẫn chỉ ở một phía.
- Dùng Pydantic cho biên BE và TypeScript cho FE; kiểm tra dữ liệu runtime ở nơi nhận dữ liệu ngoài. Không dùng `any`, ép kiểu hoặc `@ts-ignore` để che contract sai. Mapping `snake_case` ↔ `camelCase` tại biên API, không sửa tên rải rác.
- BE là nguồn dữ liệu bền vững; Zustand giữ trạng thái giao diện/cache. Luồng thật không rơi về seed/mock khi API lỗi. Hiển thị rõ loading, empty, error; chỉ báo thành công sau khi có kết quả phù hợp. Nếu cập nhật lạc quan thì phải phục hồi được khi lỗi.
- Kiểm tra ở BE cả sự tồn tại lẫn quan hệ `project_id` của tài nguyên/session/giải pháp trước khi đọc hoặc sửa. Lọc ở UI không đảm bảo cô lập dữ liệu. Đây là ràng buộc dữ liệu dự án, không phải lý do dựng thêm hệ thống tài khoản.
- Cùng một thao tác DB phải commit/rollback nhất quán; dùng foreign key/unique constraint thích hợp và kiểm chứng chúng có hiệu lực. Chống trùng khi gọi đồng thời bằng ràng buộc bền vững, không chỉ `if exists` hoặc khóa nút trên FE.
- DB và Gmail/Calendar không nằm trong cùng transaction. Lưu dấu vết thao tác/provider ID để đối soát khi một phía thành công, phía kia lỗi. Timeout không có nghĩa là chưa gửi/chưa tạo; không retry mù hành động có tác dụng phụ.
- Đổi schema phải có cách nâng dữ liệu cũ, backfill và kiểm tra lại khi chạy lần hai. Không xóa DB để “sửa migration”, không nuốt lỗi migration. Khi xóa/hoàn tác dự án, định nghĩa rõ xử lý file, tài nguyên, chat và dữ liệu bên Google trước khi thực hiện.

## 5. Các bất biến nghiệp vụ phải giữ

Không chép lại toàn bộ bảng nghiệp vụ ở đây. Khi sửa từng nhóm, đối chiếu đầy đủ dòng tương ứng trong `business-check.md`; các điểm sau đặc biệt dễ làm sai:

| Nhóm | Quy tắc bắt buộc |
|---|---|
| Phạm vi demo | Một chủ máy với OAuth Google cố định; vai trò thành viên dùng gán nhãn nghiệp vụ. Không thêm auth/multi-user/RBAC; Tasks/To-do đang treo. Không thêm trang Training hoặc Notification riêng. |
| Cấu hình dự án | Cấu hình nghiệp vụ theo dự án, cấu hình hạ tầng ở BE. Một dự án gắn một nhãn Gmail; định tuyến theo email thành viên, không dựng lại luật keyword/wildcard. |
| PDF/tóm tắt | Một bản tóm tắt 4 phần của BE; bỏ các kiểu tóm tắt FE đã loại khỏi phạm vi. OCR/Map-Reduce phải phản ánh xử lý thật của BE, không suy đoán từ số trang. Lưu file gốc và dữ liệu trang để mở viewer/trích dẫn. |
| Email/ngữ cảnh | Một `MailResource` chứa `(title, content, pdf nullable)`; PDF đính kèm thuộc email, không sinh thẻ PDF rời. Persist text/chunks để chat hỏi lại không parse PDF lại. Dùng `sender_role`, `urgency` và hai cờ hành động; bỏ `category`, thống nhất cả digest/PDF xuất báo cáo. |
| Giải pháp/chat | Nhiều `SolutionOption` kèm ưu/nhược điểm, lưu lịch sử ràng buộc theo tài nguyên. Chat nhận `project_id` + các `resource_ids` đã chọn; không lén thêm nguồn khác. Bỏ luồng upload trực tiếp `/api/chat/with-file`. |
| Gửi mail | AI/chat chỉ tạo nháp; user duyệt trong `ReplyMailDialog` mới gửi. File từ Tài nguyên chỉ là PDF upload tay; kiểm tra tổng byte ở cả FE/BE theo một giới hạn đã chốt. Giữ thread/header reply; chỉ cập nhật `SentMailRecord`, phương án đã gửi và thời điểm phản hồi theo kết quả gửi thật. |
| Lịch | AI chỉ tạo `ScheduleDraft`; thiếu giờ hoặc confidence dưới `0.7` phải yêu cầu bổ sung trên nháp. User duyệt mới ghi Google Calendar, có hoàn tác xóa. Dùng Calendar API v3, giữ all-day, RRULE, deadline và reminder; không đổi sang Google Tasks. |
| Trùng lịch | Giao nhau giờ là cảnh báo cho phép user vẫn duyệt; tạo đúp cùng thao tác phải bị chặn. So giao nhau trên lịch thật xuyên dự án và Google, không chỉ dữ liệu FE. Ngày/giờ có timezone `Asia/Ho_Chi_Minh`; phân biệt ngày thuần và datetime, kiểm tra `end > start`. |
| RL/provider | `collectRlFeedback` phải được thực thi cả ở BE. Cặp DPO giữ nháp gốc là `rejected`, bản user sửa duyệt là `chosen`; không biến thumbs-up đơn lẻ thành cặp sửa giả. Train/reload/rollback cần tiến trình, artifact và phiên bản thật; fallback model theo cấu hình/khả năng và trả model thực đã dùng. |

Nội dung PDF/email và đầu ra LLM là dữ liệu không tin cậy. Validate schema, ID nguồn, trang trích dẫn, thời gian, model capability và đường dẫn file trước khi dùng. Không bịa trang/section highlight khi thiếu metadata; chỉ hiển thị mức định vị có căn cứ. Chỉ dẫn trong tài liệu không được vượt bước user duyệt gửi mail/tạo lịch.

## 6. Code dễ đọc, lỗi nhìn thấy được

- Python: 4 spaces, `snake_case`, class `PascalCase`, type hint ở hàm biên. TypeScript: 2 spaces, biến/hàm `camelCase`, component/type `PascalCase`. Theo style của file; không format hàng loạt ngoài phạm vi.
- Đặt tên theo ý nghĩa nghiệp vụ; giữ ID, tên người dùng và giá trị enum theo contract. Chuẩn hóa tìm kiếm/so khớp ở một nơi, không tự đổi tên hiển thị hoặc mất dấu tiếng Việt.
- Một hàm làm một việc dễ gọi tên. Tách khi có trách nhiệm khác nhau, không theo một quota số dòng. Comment giải thích lý do/ràng buộc; tránh nhắc lại code và lời khẳng định chưa kiểm chứng.
- Không `except: pass`, trả chuỗi lỗi như câu trả lời AI thành công, hoặc dùng giá trị mặc định để che dữ liệu bắt buộc bị thiếu. Phân biệt lỗi validation, provider không sẵn sàng và lỗi nội bộ; UI cho biết bước nào thất bại.
- Ghi log đủ truy vết qua request/thao tác, `project_id`, resource/provider ID và thời lượng. Không log token, API key hoặc toàn bộ nội dung thư/tài liệu theo mặc định; không đưa secret vào `VITE_*`, response hay git.
- Giới hạn timeout/retry; chỉ retry lỗi tạm thời khi biết thao tác an toàn. SDK đồng bộ hoặc OCR nặng không được chặn event loop; dùng cơ chế thread/task sẵn có phù hợp, chưa cần thêm hệ thống queue.
- Đường dẫn DB/file không phụ thuộc thư mục chạy lệnh; lưu dữ liệu runtime ngoài cây source FE. Chặn đường dẫn thoát thư mục lưu trữ; kiểm tra PDF bằng nội dung, kích thước và giới hạn trang, không chỉ đuôi file.
- Với chớp trắng/reload: tái hiện, xem Console/Network, log Vite HMR/backend reload và file vừa bị ghi. Chỉ chỉnh watch/ignore khi có bằng chứng; không tắt HMR hoặc reload trang để che lỗi state/API. [Vite có cấu hình watcher riêng](https://vite.dev/config/server-options.html#server-watch).

## 7. Test bảo vệ yêu cầu, không chiều code lỗi

Chốt kết quả mong đợi từ nghiệp vụ **trước khi** sửa code. Với bug, thêm test tái hiện thất bại rồi sửa để test qua. Chỉ đổi kỳ vọng test cũ khi yêu cầu đã đổi, nêu rõ căn cứ; không xóa assertion, skip test hay sửa expected để làm xanh.

Chọn test có ích theo phần chạm tới; không viết test cho sửa câu chữ hoặc test chỉ lặp lại implementation. Các ca trọng yếu:

| Khi sửa | Phải kiểm chứng |
|---|---|
| Phạm vi dự án | Dùng resource/session dự án B trong request dự án A bị từ chối; tải lại trang vẫn có dữ liệu đúng. |
| Ingest email | Đồng bộ lại và gọi đồng thời không tạo trùng trong cùng dự án; mail có/không PDF đều xử lý; hỏi lại dùng dữ liệu đã lưu; sender/label theo quy tắc đã chốt. |
| Gửi mail/lịch | Tạo nháp không gọi provider ghi; duyệt mới gọi; double-click/timeout không tạo tác dụng phụ lặp; provider lỗi không đánh dấu thành công; kiểm tra cả trường hợp provider thành công nhưng lưu DB thất bại. |
| Upload/trích dẫn | PDF hợp lệ, scan, quá dung lượng/trang, file giả PDF; citation trỏ đúng tài nguyên/trang; nguồn không hợp lệ không được dùng. |
| Lịch | All-day, lặp, thiếu giờ, giờ kết thúc sai, giao nhau, hai lịch sát nhau không giao, lịch Google ngoài dự án, reminder và hoàn tác. |
| LLM/RL | Adapter đúng endpoint/payload và parse phản hồi/lỗi/stream nếu có dùng; model thiếu capability; cấu hình tắt feedback; DPO không đảo chosen/rejected; train lỗi không đổi adapter đang chạy, rollback khôi phục phiên bản có thật. |

- Unit test mock **biên ngoài** (Google/LLM/clock); không mock chính logic đang kiểm. Integration test dùng API và DB tạm để bắt lỗi contract, quan hệ và transaction. FE cần kiểm tra một luồng thật qua Network và tải lại trang, không chỉ `build`.
- Test tự động không dùng DB/token thật, không khởi động poller đọc/gửi thư hay ghi lịch thật. Thiết lập fixture cô lập **trước khi import app**: dùng `APP_ENV=test`, DB/file/token tạm và tắt poller; `backend/tests/conftest.py` hiện chuẩn bị môi trường này trước khi import app. Không chạy suite với dữ liệu chủ máy rồi dọn hậu quả.
- Khi đổi UI hoặc PDF báo cáo, mở/render đầu ra để xem bố cục, font tiếng Việt, bảng và citation. Kiểm tra text không chứng minh giao diện đúng. Chỉ nói đã xem khi thực sự đã xem.

## 8. Điều kiện bàn giao

Làm từng luồng dùng được từ UI đến dữ liệu/provider; không đánh dấu xong bằng màn hình giả lập hoặc endpoint trả `success` cứng. Đồ án demo vẫn phải phân biệt **thật / mô phỏng / chưa làm**.

Các lệnh hiện có, chạy từ thư mục tương ứng sau khi chuẩn bị môi trường:

```bash
# frontend/ — lint hiện là typecheck, không phải ESLint
pnpm lint
pnpm build

# backend/ — dùng Python trong môi trường dự án, đã cô lập DB/provider/poller
python -m pytest tests/<test_lien_quan>.py -q
# Chạy cả suite khi đổi schema, contract chung hoặc luồng dùng chung:
python -m pytest tests/ -q
```

Không có công cụ/dependency hoặc không thể kiểm chứng tích hợp thật thì ghi rõ phần chưa chạy và lý do; test mock qua không tương đương Gmail/Calendar/LLM thật đã chạy.

Trước khi kết thúc, rà diff để bỏ code chết, import/dependency mới không dùng và file sinh ngoài ý muốn. Không xóa module còn caller chỉ vì nó ngoài phạm vi mới. Báo ngắn gọn:

- Đã đổi hành vi gì, tương ứng dòng nghiệp vụ nào.
- Đã chạy lệnh/kịch bản nào, kết quả thực tế; phần dùng mock hay provider thật.
- Phần còn thiếu, quyết định còn chờ, yêu cầu migration/cấu hình/dependency nếu có.

## Nguồn và cách áp dụng

- [Business check của dự án](../business-check.md): nguồn quyết định phạm vi; khi thay đổi phải cập nhật các invariant/test liên quan.
- [Codacy — Coding Standards](https://blog.codacy.com/coding-standards): tham khảo nguyên tắc quy chuẩn phù hợp dự án, tên rõ nghĩa và code nhất quán. Các lựa chọn kiến trúc/nghiệp vụ trong file này được suy ra từ repo, không phải yêu cầu của Codacy.
- [FastAPI — Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/): tổ chức module bằng `APIRouter` và dependencies sẵn có; không cần đưa thêm framework để chia module.

Khi giao việc cho agent, đính kèm: **“Đọc `docs/coding-standard.md` và `business-check.md` trước khi sửa. Triển khai phần được giao, giữ đúng Chốt phạm vi, kiểm chứng luồng thật và báo rõ phần chưa kiểm chứng.”** File nằm trong `docs/` không bảo đảm mọi agent tự đọc; cần dẫn rõ trong lời giao việc hoặc hướng dẫn repo đang dùng.
