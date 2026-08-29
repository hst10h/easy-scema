# StructFlow / Easy Scema

Biến PDF, ảnh, CSV và Excel không đồng nhất thành bảng dữ liệu theo đúng schema người dùng cung cấp.

## Tính năng hiện có

- Đọc schema từ dòng header của `.xlsx`, `.xls` hoặc `.csv`.
- Upload nhiều PDF, ảnh hoặc spreadsheet.
- Dùng Gemini để trích xuất PDF/ảnh thành JSON có cấu trúc.
- Không tự đoán field bị thiếu.
- Review và sửa dữ liệu trực tiếp.
- Hiển thị confidence, trang và đoạn text nguồn.
- Lưu template, extraction job và nội dung review trên trình duyệt.
- Mở lại hoặc xóa job/template sau khi reload trang.
- Export kết quả thành `.xlsx`.

## Yêu cầu

- Node.js `>=22.13.0`
- npm
- Gemini API key từ [Google AI Studio](https://aistudio.google.com/app/apikey)

## Chạy localhost

```bash
git clone https://github.com/hst10h/easy-scema.git
cd easy-scema
npm install
npm run dev
```

Sau đó mở địa chỉ được in trong terminal, thường là `http://localhost:5173`.

Trong ứng dụng:

1. Mở `Settings`.
2. Nhập Gemini API key.
3. Chọn `Test connection`.
4. Chọn `Save for this session`.
5. Quay lại `New extraction` để xử lý tài liệu.

Key nhập trong UI chỉ được lưu bằng `sessionStorage` của tab hiện tại. Có thể cấu hình key phía server bằng file `.env.local`:

```env
GEMINI_API_KEY=your_key_here
```

Không commit `.env.local` hoặc API key thật lên Git.

Template và kết quả extraction được lưu bằng `localStorage` trên trình duyệt đang dùng. StructFlow chỉ lưu tên file và dữ liệu đã trích xuất; file nguồn không được lưu trong trình duyệt. Có thể xóa toàn bộ dữ liệu này trong `Settings`.

## Scripts

```bash
npm run dev      # development server
npm run lint     # ESLint
npm run build    # production build
npm run start    # run production build
```

## Cấu trúc chính

```text
app/page.tsx                    UI và workflow
app/api/extract/route.ts        Gemini extraction endpoint
app/api/gemini/test/route.ts    kiểm tra API key
components/ui/                  UI primitives
```

## Trạng thái

Đây là technical prototype. Job và template đã có persistence cục bộ trên trình duyệt; chưa có database phía server, object storage, queue, authentication hoặc billing.
