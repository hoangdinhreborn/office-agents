import pytest
from unittest.mock import patch, MagicMock
import pymupdf

from app.agents.summary_agent import summary_agent, parse_summary_sections, SummaryResult
from app.agents.solution_agent import solution_agent, parse_solution_markdown, SolutionResult
from app.llm.ollama import chat_with_llm_safe, LLMResponse


SAMPLE_SUMMARY_MD = """<think>
Phân tích tài liệu và cấu trúc 4 phần.
</think>
# BÁO CÁO TÓM TẮT DỰ ÁN

## 1. TỔNG QUAN ĐIỀU HÀNH
Dự án nâng cấp hệ thống thanh toán cốt lõi nhằm giải quyết tình trạng nghẽn cổ chai giao dịch trong giờ cao điểm. Thời gian triển khai dự kiến 3 tháng với ngân sách tối ưu.

## 2. CÁC LUẬN ĐIỂM CHÍNH
- Hệ thống hiện tại quá tải khi lưu lượng vượt quá 5,000 TPS.
- Cần chuyển đổi sang kiến trúc Microservices và Redis Caching.
- Đội ngũ kỹ thuật cần bổ sung thêm 2 kỹ sư DevOps.

## 3. QUYẾT ĐỊNH & CAM KẾT
- Ban giám đốc duyệt giải pháp nâng cấp hạ tầng.
- Phòng Kỹ thuật cam kết hoàn thành giai đoạn thử nghiệm trước 15/11/2026.

## 4. CÁC MỐC THỜI GIAN & HẠN CHÓT
- Họp bàn giao yêu cầu kỹ thuật vào 09:00 ngày 20/10/2026.
- Nghiệm thu giai đoạn 1 vào 14:00 ngày 15/11/2026.
"""

SAMPLE_SOLUTION_MD = """<think>
Phân tích 5 Whys và xây dựng ma trận giải pháp 3 cấp độ.
</think>
# BÁO CÁO ĐỀ XUẤT GIẢI PHÁP KHẮC PHỤC SỰ CỐ

## 1. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ
Nguyên nhân gốc rễ là do kết nối cơ sở dữ liệu bị cạn kiệt (Connection Pool Exhaustion) khi lượng truy vấn đột biến, dẫn đến nghẽn chuỗi xử lý thanh toán.

## 2. MA TRẬN GIẢI PHÁP 3 CẤP ĐỘ
### Cấp 1 - Ngắn hạn / Khắc phục nhanh:
- Tăng giới hạn connection pool của PostgreSQL từ 100 lên 300.
- Khởi động lại service định tuyến thanh toán.

### Cấp 2 - Trung hạn / Khắc phục triệt để:
- Bổ sung cụm Redis cluster để lưu đệm dữ liệu truy vấn thường xuyên.
- Tối ưu hóa các truy vấn SQL chậm vượt ngưỡng 200ms.

### Cấp 3 - Dài hạn / Phòng ngừa chiến lược:
- Triển khai kiến trúc sharding database theo khu vực.
- Thiết lập hệ thống cảnh báo sớm Prometheus + Grafana.

## 3. ĐÁNG GIÁ TÍNH KHẢ THI & RỦI RO
Tính khả thi cao, rủi ro gián đoạn dịch vụ dưới 5 phút trong thời gian cập nhật cấu hình.

## 4. KẾ HOẠCH HÀNH ĐỘNG
- Task 1: Tăng connection pool database trong đêm nay
- Task 2: Cài đặt Redis Cache trong tuần tới
- Task 3: Bàn giao tài liệu vận hành
"""


def test_parse_summary_sections():
    parsed = parse_summary_sections(SAMPLE_SUMMARY_MD)
    assert "nghẽn cổ chai giao dịch" in parsed["executive_summary"]
    assert len(parsed["key_points"]) == 3
    assert any("Microservices" in p for p in parsed["key_points"])
    assert len(parsed["commitments"]) == 2
    assert len(parsed["deadlines"]) == 2
    assert any("20/10/2026" in d for d in parsed["deadlines"])


def test_parse_solution_markdown():
    parsed = parse_solution_markdown(SAMPLE_SOLUTION_MD)
    assert "Connection Pool Exhaustion" in parsed["root_cause"]
    assert len(parsed["immediate"]) >= 2
    assert len(parsed["mid_term"]) >= 2
    assert len(parsed["long_term"]) >= 2
    assert "Tính khả thi cao" in parsed["risks"]
    assert len(parsed["action_items"]) >= 2


def test_summary_agent_short_text():
    mock_resp = LLMResponse(
        raw=SAMPLE_SUMMARY_MD,
        thought="Phân tích tài liệu",
        content=SAMPLE_SUMMARY_MD,
        elapsed_seconds=1.5,
    )
    with patch("app.agents.summary_agent.chat_with_llm_safe", return_value=mock_resp):
        res = summary_agent.summarize_text("Văn bản thử nghiệm ngắn về dự án thanh toán.")
        assert isinstance(res, SummaryResult)
        assert len(res.key_points) == 3
        assert len(res.deadlines) == 2
        assert res.execution_time_seconds > 0


def test_summary_agent_map_reduce():
    # Long text with > 3500 tokens
    long_text = ("Đây là đoạn văn bản nội dung rất dài của hợp đồng kinh tế. " * 30 + "\n\n") * 60

    mock_map_resp = LLMResponse(
        raw="### Điểm chính phần\n- Điểm 1\n- Điểm 2",
        thought="Suy nghĩ map",
        content="Điểm 1\nĐiểm 2",
        elapsed_seconds=1.0,
    )
    mock_reduce_resp = LLMResponse(
        raw=SAMPLE_SUMMARY_MD,
        thought="Suy nghĩ reduce",
        content=SAMPLE_SUMMARY_MD,
        elapsed_seconds=2.0,
    )

    def mock_llm_response(message, system_prompt=None, **kwargs):
        if "tổng hợp lại" in message or "TỔNG QUAN ĐIỀU HÀNH" in message:
            return mock_reduce_resp
        return mock_map_resp

    with patch("app.agents.summary_agent.chat_with_llm_safe", side_effect=mock_llm_response):
        res = summary_agent.summarize_text(long_text, document_title="Hop_dong_dai.pdf")
        assert isinstance(res, SummaryResult)
        assert res.source_filename == "Hop_dong_dai.pdf"
        assert len(res.key_points) > 0


def test_summary_agent_scanned_pdf(tmp_path):
    # PDF with no text layer
    pdf_path = tmp_path / "scanned_doc.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0.5, 0.5, 0.5))
    doc.save(str(pdf_path))
    doc.close()

    res = summary_agent.summarize_pdf(pdf_path)
    assert res.total_pages == 1
    assert "scan" in res.executive_summary.lower()


def test_solution_agent_propose():
    mock_resp = LLMResponse(
        raw=SAMPLE_SOLUTION_MD,
        thought="Suy nghĩ đề xuất",
        content=SAMPLE_SOLUTION_MD,
        elapsed_seconds=1.8,
    )
    with patch("app.agents.solution_agent.chat_with_llm_safe", return_value=mock_resp):
        res = solution_agent.propose_solution(
            problem_description="Hệ thống thanh toán bị chậm vào giờ cao điểm",
            context="Cơ sở dữ liệu PostgreSQL 15 trên Linux",
            constraints="Ngân sách nâng cấp dưới 5,000 USD",
        )
        assert isinstance(res, SolutionResult)
        assert "Connection Pool Exhaustion" in res.root_cause_analysis
        assert len(res.immediate_solutions) >= 2
        assert len(res.action_items) >= 2
        assert res.execution_time_seconds > 0


def test_llm_safe_timeout_and_retry_fallback():
    # Verify chat_with_llm_safe returns graceful fallback without crashing
    with patch("app.llm.ollama.client.chat", side_effect=Exception("Connection refused")):
        res = chat_with_llm_safe(
            message="Hello",
            timeout_secs=0.5,
            max_retries=1,
        )
        assert isinstance(res, LLMResponse)
        assert "Lỗi" in res.content
