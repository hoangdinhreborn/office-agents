import type { PdfPage, PdfResource } from '../types/workspace';

/**
 * Rich mock multi-page PDF documents for testing PDF View Mode and exact citation focusing.
 * Each page & section aligns 1-to-1 with citations such as [tr. 14], [tr. 3–5], [tr. 12], [tr. 19], etc.
 */

export const MOCK_PDF_MINH_KHOI_Q4: PdfPage[] = [
  {
    pageNumber: 1,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK',
    sections: [
      {
        id: 'mk-p1-title',
        heading: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM — Độc lập - Tự do - Hạnh phúc',
        paragraphs: [
          'PHỤ LỤC HỢP ĐỒNG TRIỂN KHAI HỆ THỐNG SỐ HÓA VĂN PHÒNG QUÝ 4/2026',
          'Số: 04/2026/PLHĐ-MK · Kèm theo Hợp đồng Nguyên tắc số 12/2026/HĐNT ngày 15/01/2026.',
        ],
      },
      {
        id: 'mk-p1-parties',
        heading: 'THÔNG TIN CÁC BÊN KÝ KẾT',
        paragraphs: [
          'BÊN A (BÊN SỬ DỤNG DỊCH VỤ): TẬP ĐOÀN MINH KHÔI — Đại diện: Ông Trần Đức Hải, Giám đốc Mua hàng & Vận hành. Mã số thuế: 0108245912.',
          'BÊN B (BÊN TRIỂN KHAI): CÔNG TY CỔ PHẦN CÔNG NGHỆ SỔ VIỆC — Đại diện: Ông Nguyễn Minh Tuấn, Trưởng nhóm Vận hành Triển khai. Mã số thuế: 0109451120.',
          'Căn cứ biên bản khảo sát hiện trường ký nháy ngày 18/10/2026, hai bên thống nhất điều chỉnh phạm vi, giá trị gói triển khai và tiêu chuẩn SLA trong Quý 4/2026.',
        ],
      },
    ],
  },
  {
    pageNumber: 3,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 2',
    sections: [
      {
        id: 'mk-p3-value',
        heading: 'ĐIỀU 2. ĐIỀU CHỈNH GIÁ TRỊ GÓI TRIỂN KHAI',
        citationTag: 'Giá trị hợp đồng 1,45 tỷ VNĐ',
        paragraphs: [
          '2.1. Tổng giá trị điều chỉnh của gói triển khai hệ thống trợ lý xử lý tài liệu nội bộ cho 03 chi nhánh là 1.450.000.000 VNĐ (Bằng chữ: Một tỷ bốn trăm năm mươi triệu đồng chẵn), đã bao gồm thuế GTGT 10%.',
          '2.2. Giá trị trên bao gồm chi phí cài đặt cụm máy chủ suy luận cục bộ, chuẩn hóa quy trình đồng bộ email IMAP, đào tạo vận hành cho 45 nhân sự và gói bảo trì 12 tháng.',
        ],
        table: {
          headers: ['STT', 'Hạng mục công việc', 'Đơn vị', 'Thành tiền (VNĐ)'],
          rows: [
            ['01', 'Triển khai lõi xử lý tài liệu & OCR cục bộ', 'Gói', '680.000.000'],
            ['02', 'Tích hợp đồng bộ Email IMAP & phân quyền', 'Gói', '420.000.000'],
            ['03', 'Đào tạo vận hành tại 03 chi nhánh & bảo trì 12 tháng', 'Gói', '350.000.000'],
            ['', 'TỔNG CỘNG (ĐÃ GỒM VAT 10%)', '', '1.450.000.000'],
          ],
        },
      },
    ],
  },
  {
    pageNumber: 4,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 3.1',
    sections: [
      {
        id: 'mk-p4-pay1',
        heading: 'ĐIỀU 3. PHƯƠNG THỨC VÀ TIẾN ĐỘ THANH TOÁN (ĐỢT 1)',
        citationTag: 'Thanh toán Đợt 1 (30%)',
        paragraphs: [
          '3.1. Thanh toán Đợt 1 — Tỷ lệ 30% tổng giá trị Phụ lục, tương ứng 435.000.000 VNĐ (Bốn trăm ba mươi lăm triệu đồng).',
          'Điều kiện giải ngân: Trong vòng 10 (mười) ngày làm việc kể từ ngày hai bên ký xác nhận Phụ lục Hợp đồng này và Bên B cung cấp hóa đơn GTGT điện tử hợp lệ cùng đề nghị thanh toán.',
        ],
      },
    ],
  },
  {
    pageNumber: 5,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 3.2 – 3.3',
    sections: [
      {
        id: 'mk-p5-pay23',
        heading: 'ĐIỀU 3.2 & 3.3. TIẾN ĐỘ THANH TOÁN ĐỢT 2 VÀ ĐỢT 3',
        citationTag: 'Thanh toán Đợt 2 (40%) & Đợt 3 (30%)',
        paragraphs: [
          '3.2. Thanh toán Đợt 2 — Tỷ lệ 40% tổng giá trị Phụ lục, tương ứng 580.000.000 VNĐ, thực hiện trong vòng 10 ngày làm việc sau khi ký Biên bản nghiệm thu hạ tầng Giai đoạn 1 dự kiến ngày 10/12/2026.',
          '3.3. Thanh toán Đợt 3 — Tỷ lệ 30% giá trị còn lại, tương ứng 435.000.000 VNĐ, thực hiện trong vòng 10 ngày làm việc sau khi hai bên ký Biên bản nghiệm thu bàn giao chính thức toàn bộ hệ thống ngày 25/12/2026.',
        ],
        table: {
          headers: ['Đợt', 'Tỷ lệ', 'Số tiền (VNĐ)', 'Mốc điều kiện'],
          rows: [
            ['Đợt 1', '30%', '435.000.000', 'Ngay sau ký Phụ lục (hạn 28-11-2026)'],
            ['Đợt 2', '40%', '580.000.000', 'Sau nghiệm thu hạ tầng (10-12-2026)'],
            ['Đợt 3', '30%', '435.000.000', 'Sau bàn giao chính thức (25-12-2026)'],
          ],
        },
      },
    ],
  },
  {
    pageNumber: 12,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 6',
    sections: [
      {
        id: 'mk-p12-sla',
        heading: 'ĐIỀU 6. CAM KẾT CHẤT LƯỢNG DỊCH VỤ (SLA) & CHẾ TÀI PHẠT',
        citationTag: 'SLA phản hồi 2 giờ · Phạt 0,05%/ngày · Trần 8%',
        paragraphs: [
          '6.1. Thời gian phản hồi sự cố nghiêm trọng (Mức 1 — gián đoạn toàn bộ luồng xử lý tài liệu) không vượt quá 02 (hai) giờ làm việc kể từ thời điểm Bên A gửi yêu cầu qua cổng hỗ trợ hoặc email kỹ thuật.',
          '6.2. Trường hợp Bên B chậm bàn giao các mốc quy định tại Điều 10 mà không có văn bản gia hạn được Bên A chấp thuận, Bên B chịu phạt vi phạm tiến độ ở mức 0,05% (không phẩy không năm phần trăm) giá trị phần nghĩa vụ chậm thực hiện cho mỗi ngày chậm.',
          '6.3. Tổng mức phạt vi phạm tiến độ theo Phụ lục này không vượt quá mức trần 8% (tám phần trăm) giá trị phần nghĩa vụ bị vi phạm theo quy định của Luật Thương mại.',
        ],
      },
    ],
  },
  {
    pageNumber: 14,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 7.2',
    sections: [
      {
        id: 'mk-p14-intro',
        heading: 'ĐIỀU 7. GIỚI HẠN TRÁCH NHIỆM VÀ NGOẠI LỆ SLA',
        paragraphs: [
          '7.1. Hai bên có nghĩa vụ bảo mật tuyệt đối toàn bộ dữ liệu tài liệu nội bộ, cấu hình máy chủ và lịch làm việc trích xuất trong suốt thời gian thực hiện Phụ lục và 36 tháng sau khi thanh lý.',
        ],
      },
      {
        id: 'mk-p14-clause72',
        heading: 'Điều 7.2. Ngoại lệ SLA và Sự kiện Bất khả kháng (Điểm cần rà soát)',
        citationTag: 'Điều 7.2 — Ngoại lệ SLA & Bất khả kháng',
        paragraphs: [
          '7.2. Bên B chỉ được miễn trừ nghĩa vụ bồi thường và phạt chậm tiến độ khi xảy ra sự kiện bất khả kháng do thiên tai, hỏa hoạn hoặc yêu cầu dừng hệ thống bằng văn bản của cơ quan nhà nước có thẩm quyền.',
          'Ghi chú rà soát: Khoản 7.2 hiện chưa quy định rõ trường hợp gián đoạn do hạ tầng điện/mạng của nhà cung cấp bên thứ ba hoặc khoảng thời gian Bên B phải chờ Bên A cấp quyền truy cập máy chủ, bàn giao tài khoản IMAP và xác nhận biên bản nghiệm thu.',
          'Kiến nghị bổ sung trước khi ký ngày 28/11/2026: "Thời gian gián đoạn do hạ tầng bên thứ ba hoặc thời gian chờ phản hồi, cấp quyền từ Bên A vượt quá 48 giờ làm việc không tính vào thời gian chậm tiến độ của Bên B."',
        ],
      },
    ],
  },
  {
    pageNumber: 18,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 9',
    sections: [
      {
        id: 'mk-p18-maintenance',
        heading: 'ĐIỀU 9. CHÍNH SÁCH BẢO HÀNH & BẢO TRÌ 12 THÁNG',
        citationTag: 'Bảo trì hệ thống 12 tháng',
        paragraphs: [
          '9.1. Bên B cung cấp dịch vụ bảo hành, cập nhật vá lỗi bảo mật và tối ưu mô hình cục bộ miễn phí trong thời hạn 12 (mười hai) tháng kể từ ngày ký Biên bản nghiệm thu bàn giao chính thức.',
          '9.2. Trong thời gian bảo trì, Bên B thực hiện kiểm tra định kỳ hiệu năng mỗi tháng 01 lần và gửi báo cáo tình trạng vận hành cho đầu mối CNTT của Bên A.',
        ],
      },
    ],
  },
  {
    pageNumber: 19,
    headerTitle: 'PHỤ LỤC HỢP ĐỒNG SỐ 04/2026/PLHĐ-MK · ĐIỀU 10',
    sections: [
      {
        id: 'mk-p19-milestones',
        heading: 'ĐIỀU 10. MỐC BÀN GIAO, NGHIỆM THU & HIỆU LỰC KÝ KẾT',
        citationTag: 'Mốc nghiệm thu 10-12 & 25-12-2026',
        paragraphs: [
          '10.1. Nghiệm thu Giai đoạn 1 (Hạ tầng máy chủ & đồng bộ email): Hoàn thành trước 17:00 ngày 10/12/2026.',
          '10.2. Nghiệm thu bàn giao toàn bộ (Đào tạo vận hành & vận hành chính thức tại 03 chi nhánh): Hoàn thành vào ngày 25/12/2026.',
          '10.3. Phụ lục này có hiệu lực kể từ ngày đại diện có thẩm quyền của hai bên ký xác nhận, chậm nhất trước 17:00 ngày 28/11/2026 để giữ lịch triển khai Quý 4.',
        ],
        table: {
          headers: ['Mốc', 'Nội dung nghiệm thu', 'Hạn hoàn tất', 'Trách nhiệm chính'],
          rows: [
            ['M0', 'Ký Phụ lục Hợp đồng Q4', '28-11-2026', 'Bên A & Bên B'],
            ['M1', 'Nghiệm thu hạ tầng Giai đoạn 1', '10-12-2026', 'Bên B (Kỹ thuật)'],
            ['M2', 'Bàn giao toàn bộ & kích hoạt bảo trì', '25-12-2026', 'Bên A & Bên B'],
          ],
        },
      },
    ],
  },
];

export const MOCK_PDF_BIEN_BAN_OCR: PdfPage[] = [
  {
    pageNumber: 2,
    headerTitle: 'BIÊN BẢN KHẢO SÁT HIỆN TRƯỜNG (BẢN SCAN OCR) · TRANG 2–6',
    sections: [
      {
        id: 'bb-p2-scope',
        heading: 'PHẦN I. DANH MỤC 14 HẠNG MỤC TRIỂN KHAI TẠI 03 CHI NHÁNH',
        citationTag: 'Phạm vi 14 hạng mục tại 3 chi nhánh',
        paragraphs: [
          '[OCR cục bộ · Độ tin cậy 98,4%] Hai bên tiến hành khảo sát hạ tầng tại Trụ sở Hà Nội, Chi nhánh Đà Nẵng và Chi nhánh TP.HCM từ ngày 14/10 đến 18/10/2026.',
          'Thống nhất 14 đầu việc triển khai gồm: cài đặt 03 nút suy luận nội bộ, cấu hình lọc thư mục IMAP theo dự án, thiết lập bộ mẫu tóm tắt 3 cấp độ và đào tạo 45 nhân sự văn phòng.',
        ],
      },
    ],
  },
  {
    pageNumber: 7,
    headerTitle: 'BIÊN BẢN KHẢO SÁT HIỆN TRƯỜNG (BẢN SCAN OCR) · TRANG 7',
    sections: [
      {
        id: 'bb-p7-handwritten',
        heading: 'PHẦN II. GHI CHÚ BỔ SUNG TẠI HIỆN TRƯỜNG',
        citationTag: 'Ghi chú viết tay cần đối chiếu',
        paragraphs: [
          '[OCR ghi nhận 02 dòng viết tay bổ sung]: (1) Bổ sung tài khoản dự phòng cho bộ phận Pháp chế khi đồng bộ thư mục Hợp đồng; (2) Yêu cầu lưu nhật ký kiểm thử trước khi đóng gói bàn giao.',
        ],
      },
    ],
  },
  {
    pageNumber: 9,
    headerTitle: 'BIÊN BẢN KHẢO SÁT HIỆN TRƯỜNG (BẢN SCAN OCR) · TRANG 9',
    sections: [
      {
        id: 'bb-p9-sign',
        heading: 'XÁC NHẬN KÝ NHÁY CỦA ĐẠI DIỆN HAI BÊN',
        citationTag: 'Chữ ký nháy ngày 18-10-2026',
        paragraphs: [
          'Biên bản được lập thành 02 bản gốc có giá trị pháp lý như nhau, được đại diện kỹ thuật Tập đoàn Minh Khôi và Công ty Sổ Việc ký nháy xác nhận vào hồi 16:45 ngày 18/10/2026.',
        ],
      },
    ],
  },
];

export const MOCK_PDF_LAUNCH_V2: PdfPage[] = [
  {
    pageNumber: 2,
    headerTitle: 'KẾ HOẠCH TRUYỀN THÔNG RA MẮT SẢN PHẨM V2 · TRANG 2',
    sections: [
      {
        id: 'launch-p2-date',
        heading: '1. THỜI GIAN & ĐỊA ĐIỂM TỔ CHỨC SỰ KIỆN',
        citationTag: 'Ngày ra mắt 12-12-2026 tại Hà Nội',
        paragraphs: [
          'Sự kiện ra mắt phiên bản doanh nghiệp diễn ra vào thứ Bảy, ngày 12/12/2026 (08:30 – 12:00) tại Trung tâm Hội nghị Hà Nội, kết hợp phát sóng trực tiếp (livestream) tới khách hàng toàn quốc.',
        ],
      },
    ],
  },
  {
    pageNumber: 4,
    headerTitle: 'KẾ HOẠCH TRUYỀN THÔNG RA MẮT SẢN PHẨM V2 · TRANG 4',
    sections: [
      {
        id: 'launch-p4-kpi',
        heading: '2. MỤC TIÊU KHÁCH MỜI & CHUYỂN ĐỔI',
        citationTag: '150 khách mời · 40 lịch demo',
        paragraphs: [
          'Mục tiêu tiếp đón tối thiểu 150 khách mời đại diện khối doanh nghiệp (Giám đốc Vận hành, Pháp chế, CNTT) và ghi nhận 40 lịch demo triển khai riêng ngay trong 02 tuần sau sự kiện.',
        ],
      },
    ],
  },
  {
    pageNumber: 6,
    headerTitle: 'KẾ HOẠCH TRUYỀN THÔNG RA MẮT SẢN PHẨM V2 · TRANG 6',
    sections: [
      {
        id: 'launch-p6-guest',
        heading: '3. TIẾN ĐỘ KHÓA DANH SÁCH KHÁCH MỜI',
        citationTag: 'Hạn khóa danh sách 03-12-2026',
        paragraphs: [
          'Toàn bộ thư mời chính thức phải được xác nhận phản hồi và khóa danh sách trước 17:00 ngày 03/12/2026 để hoàn tất in ấn tài liệu và phân bổ khu vực trải nghiệm demo trực tiếp.',
        ],
      },
    ],
  },
  {
    pageNumber: 9,
    headerTitle: 'KẾ HOẠCH TRUYỀN THÔNG RA MẮT SẢN PHẨM V2 · TRANG 9',
    sections: [
      {
        id: 'launch-p9-budget',
        heading: '4. PHÂN BỔ NGÂN SÁCH TỔNG THỂ (320 TRIỆU VNĐ)',
        citationTag: 'Ngân sách 320 triệu · Trần sự kiện 55% (176 triệu)',
        paragraphs: [
          'Tổng ngân sách dự kiến cho chiến dịch ra mắt là 320.000.000 VNĐ. Trong đó hạng mục thuê hội trường, sân khấu và livestream chiếm tối đa 55% tương ứng trần 176.000.000 VNĐ.',
        ],
        table: {
          headers: ['Hạng mục', 'Tỷ trọng', 'Hạn mức (VNĐ)'],
          rows: [
            ['Sân khấu, hội trường & livestream', '55%', '176.000.000'],
            ['Nội dung kỹ thuật & ấn phẩm demo', '30%', '96.000.000'],
            ['Dự phòng phát sinh', '15%', '48.000.000'],
          ],
        },
      },
    ],
  },
];

export const MOCK_PDF_AUDIT_2026: PdfPage[] = [
  {
    pageNumber: 2,
    headerTitle: 'DANH MỤC HỒ SƠ KIỂM TOÁN NỘI BỘ 2026 · TRANG 1–4',
    sections: [
      {
        id: 'audit-p2-list',
        heading: 'I. TỔNG QUAN 27 NHÓM CHỨNG TỪ & HẠN NỘP',
        citationTag: '27 nhóm chứng từ · Hạn cuối 05-12-2026',
        paragraphs: [
          'Ba phòng ban Tài chính, Nhân sự và CNTT chịu trách nhiệm chuẩn bị đầy đủ 27 nhóm chứng từ đối chiếu năm tài chính 2026.',
          'Hạn cuối bàn giao trọn bộ hồ sơ điện tử cho đoàn kiểm toán là 17:00 ngày 05/12/2026.',
        ],
      },
    ],
  },
  {
    pageNumber: 24,
    headerTitle: 'DANH MỤC HỒ SƠ KIỂM TOÁN NỘI BỘ 2026 · TRANG 22–28',
    sections: [
      {
        id: 'audit-p24-it',
        heading: 'IV. KIỂM TRA THỰC ĐỊA & PHÂN QUYỀN TRUY CẬP CNTT',
        citationTag: 'Thực địa 09-12 đến 11-12-2026 · Nhật ký phân quyền',
        paragraphs: [
          'Đoàn kiểm toán tiến hành kiểm tra thực địa từ ngày 09/12 đến ngày 11/12/2026, tập trung vào nhật ký phân quyền truy cập dữ liệu nội bộ, chính sách không gửi dữ liệu ra đám mây ngoài và biên bản sao lưu định kỳ.',
        ],
      },
    ],
  },
];

export const MOCK_PDF_FINANCE_T10: PdfPage[] = [
  {
    pageNumber: 2,
    headerTitle: 'BÁO CÁO DÒNG TIỀN THÁNG 10/2026 · TRANG 2',
    sections: [
      {
        id: 'fin-p2-cashflow',
        heading: '1. KẾT QUẢ DÒNG TIỀN THUẦN THÁNG 10',
        citationTag: 'Dòng tiền thuần +2,1 tỷ VNĐ',
        paragraphs: [
          'Dòng tiền thuần tháng 10/2026 đạt dương +2,10 tỷ VNĐ, vượt 12% so với kế hoạch tài chính Quý 4 nhờ thu hồi đúng hạn các hợp đồng bảo trì doanh nghiệp.',
        ],
      },
    ],
  },
  {
    pageNumber: 7,
    headerTitle: 'BÁO CÁO DÒNG TIỀN THÁNG 10/2026 · TRANG 7',
    sections: [
      {
        id: 'fin-p7-saving',
        heading: '2. HIỆU QUẢ TỐI ƯU CHI PHÍ HẠ TẦNG AI',
        citationTag: 'Giảm 18% chi phí vận hành API',
        paragraphs: [
          'Chi phí thuê API mô hình bên ngoài giảm 18% so với tháng 9/2026 sau khi chuyển toàn bộ luồng tóm tắt PDF và phân loại email sang cụm Local LLM nội bộ.',
        ],
      },
    ],
  },
  {
    pageNumber: 10,
    headerTitle: 'BÁO CÁO DÒNG TIỀN THÁNG 10/2026 · TRANG 10',
    sections: [
      {
        id: 'fin-p10-ar',
        heading: '3. DANH MỤC CÔNG NỢ PHẢI THU QUÁ HẠN',
        citationTag: '2 khoản công nợ >15 ngày cần nhắc thu trước 30-11',
        paragraphs: [
          'Hiện còn 02 khoản công nợ phải thu quá hạn trên 15 ngày với tổng giá trị 340 triệu VNĐ. Phòng Kế toán kiến nghị gửi thư đối chiếu và nhắc thu dứt điểm trước ngày 30/11/2026.',
        ],
      },
    ],
  },
];

export const MOCK_PDF_SAMPLE_OCR: PdfPage[] = [
  {
    pageNumber: 2,
    headerTitle: 'CÔNG VĂN PHÊ DUYỆT NGÂN SÁCH (OCR) · TRANG 2',
    sections: [
      {
        id: 'ocr-p2-budget',
        heading: 'QUYẾT ĐỊNH PHÊ DUYỆT NGÂN SÁCH BỔ SUNG',
        citationTag: 'Phê duyệt 180 triệu VNĐ hạ tầng nội bộ',
        paragraphs: [
          '[OCR cục bộ] Ban Giám đốc phê duyệt bổ sung 180.000.000 VNĐ cho hạng mục nâng cấp bộ nhớ GPU và RAM máy chủ chạy mô hình ngôn ngữ cục bộ phục vụ xử lý tài liệu văn phòng.',
        ],
      },
    ],
  },
  {
    pageNumber: 8,
    headerTitle: 'CÔNG VĂN PHÊ DUYỆT NGÂN SÁCH (OCR) · TRANG 8',
    sections: [
      {
        id: 'ocr-p8-deadline',
        heading: 'ĐIỀU KIỆN VÀ THỜI HẠN GIẢI NGÂN',
        citationTag: 'Hạn hoàn tất giải ngân 15-12-2026',
        paragraphs: [
          'Phòng CNTT phối hợp Phòng Kế toán hoàn thiện hồ sơ báo giá 3 nhà cung cấp và biên bản kiểm thử an toàn thông tin trước ngày 15/12/2026 để thực hiện giải ngân.',
        ],
      },
    ],
  },
];

export function buildGeneratedPdfPages(fileName: string, pageCount: number): PdfPage[] {
  const cleanTitle = fileName.replace(/\.pdf$/i, '').toUpperCase();
  const midPage = Math.max(2, Math.min(pageCount, Math.ceil(pageCount / 2)));
  return [
    {
      pageNumber: 1,
      headerTitle: `${cleanTitle} · TRANG 1 / ${pageCount}`,
      sections: [
        {
          id: `gen-p1-${Date.now()}`,
          heading: '1. TỔNG QUAN PHẠM VI TÀI LIỆU',
          citationTag: 'Phạm vi & mục tiêu chính',
          paragraphs: [
            `Tài liệu "${fileName}" (${pageCount} trang) đã được lập chỉ mục hoàn tất tại máy cục bộ, sẵn sàng cho chế độ xem PDF và đối chiếu trích dẫn theo từng trang.`,
            'Nội dung trọng tâm bao gồm chuẩn hóa yêu cầu nghiệp vụ, bảng phân công đầu mối phối hợp và các tiêu chí nghiệm thu đầu ra của dự án.',
          ],
        },
      ],
    },
    {
      pageNumber: midPage,
      headerTitle: `${cleanTitle} · TRANG ${midPage} / ${pageCount}`,
      sections: [
        {
          id: `gen-pmid-${Date.now()}`,
          heading: '2. TIẾN ĐỘ VÀ ĐIỀU KIỆN NGHIỆM THU',
          citationTag: `Điều kiện kiểm định tại trang ${midPage}`,
          paragraphs: [
            'Các hạng mục ưu tiên cần được xác nhận mốc bàn giao trước phiên rà soát định kỳ, kèm biên bản đối chiếu giữa các thành viên nội bộ và đối tác liên quan.',
          ],
        },
      ],
    },
  ];
}

/**
 * Resolve the closest matching page and highlighted section inside a PDF resource
 * for a given citation page number (e.g. 14 from "[tr. 14]" or 3 from "[tr. 3–5]").
 */
export function resolvePdfCitationTarget(
  pdf: PdfResource,
  requestedPage: number
): { pageNumber: number; sectionId?: string } {
  const pages = pdf.pages ?? [];
  if (pages.length === 0) {
    return { pageNumber: requestedPage };
  }

  // Exact page match first
  const exact = pages.find((p) => p.pageNumber === requestedPage);
  if (exact) {
    const taggedSection =
      exact.sections.find((s) => Boolean(s.citationTag)) ?? exact.sections[0];
    return { pageNumber: exact.pageNumber, sectionId: taggedSection?.id };
  }

  // Closest page fallback
  let closest = pages[0];
  let bestDist = Math.abs(pages[0].pageNumber - requestedPage);
  for (const p of pages) {
    const dist = Math.abs(p.pageNumber - requestedPage);
    if (dist < bestDist) {
      bestDist = dist;
      closest = p;
    }
  }
  const section = closest.sections.find((s) => Boolean(s.citationTag)) ?? closest.sections[0];
  return { pageNumber: closest.pageNumber, sectionId: section?.id };
}

/**
 * Generates a real valid minimal PDF binary Blob on the client so users can also
 * download a sample fake .pdf file to test the upload & PDF viewer flow end-to-end.
 */
export function buildDownloadableSamplePdfBlob(pdf: PdfResource): Blob {
  const asciiLines = [
    `SO VIEC - TAI LIEU PDF MAU: ${pdf.fileName}`,
    `Ma tai lieu: ${pdf.documentCode ?? 'DOC-2026-LOCAL'} | Tong so trang: ${pdf.pageCount}`,
    '----------------------------------------------------------------',
    'Trang 3: Gia tri goi trien khai 1,45 ty VND (da gom VAT 10%).',
    'Trang 4-5: Tien do thanh toan 3 dot: 30% / 40% / 30%.',
    'Trang 12: SLA phan hoi 2 gio, phat cham 0,05%/ngay, tran 8%.',
    'Trang 14: Dieu 7.2 - Ngoai le SLA va Su kien Bat kha khang.',
    'Trang 19: Moc nghiem thu 10-12-2026 va ban giao 25-12-2026.',
  ];

  const escapedTextOps = asciiLines
    .map((line, i) => {
      const safe = line
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[()\\]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ');
      const y = 760 - i * 24;
      return `BT /F1 11 Tf 48 ${y} Td (${safe}) Tj ET`;
    })
    .join('\n');

  const streamLength = escapedTextOps.length;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${escapedTextOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([body], { type: 'application/pdf' });
}
