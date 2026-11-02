# ROLL ĐƠN NGOÀI — bản website khởi tạo

## Đã có trong source
- Đăng nhập Firebase Authentication (email/mật khẩu).
- Đọc realtime danh mục từ đúng document app đang dùng: `/apps/roll-cay-canh` → `data.catalog` (chỉ đọc).
- Tìm cây, chọn quy cách, lấy giá theo các trường catalog phổ biến, nhập số lượng và thêm nhiều dòng sản phẩm.
- Tạo đơn ngoài với người mua, điện thoại, địa chỉ, ngày, mã đơn, phí ship, tổng bill, số kiện, nhân viên đóng hàng và ghi chú.
- Lưu đơn vào collection riêng `externalOrders`; không ghi `packingOrders`, tồn kho, tiền công hay document app hiện hành.
- Danh sách đơn và tìm kiếm.
- In nhiều phiếu: đúng một kiện = một trang PDF/phiếu 75 × 100 mm, tự đánh số kiện 1/N.

## Cấu hình bắt buộc
1. Firebase Web App config của project `roll-cay-canh` đã được điền sẵn trong `firebase-config.js`.
2. Bật Email/Password trong Firebase Authentication nếu chưa bật; dùng tài khoản đã có hồ sơ `/users/{uid}` và role `admin` hoặc `manager`.
3. Chèn `firestore-rules-addition.txt` vào Rules hiện hành trước `match /{document=**}`, sau đó kiểm tra cú pháp và Publish. Không thay toàn bộ Rules.
4. Thêm domain website vào Firebase Authentication → Settings → Authorized domains sau khi hosting có domain.
5. Deploy thư mục này lên HTTPS hosting (Firebase Hosting được khuyến nghị).

## Đường dẫn dữ liệu
- Đọc catalog: `/apps/roll-cay-canh` → trường `data.catalog` (realtime, chỉ đọc).
- Giá bán ưu tiên trường `sellPrice`; không tự lấy `price` vì đó là giá nhập/giá vốn trong app.
- Ghi đơn ngoài: `/externalOrders/{autoId}`.
- Không đọc/ghi `/apps/roll-cay-canh`, `/packingOrders`, `/inventory`, payroll hoặc các dữ liệu vận hành khác.

## Lưu ý quan trọng trước production
- Source đã được cấu hình với Firebase Web App config tìm thấy trong repository và đã sửa adapter theo cấu trúc app đang dùng: `/apps/roll-cay-canh.data.catalog`.
- Workflow GitHub Pages đã được chuẩn bị, nhưng chưa thể chạy cho tới khi source được đưa vào một repository GitHub riêng và Pages được bật.
- Chưa Publish Rules và chưa kiểm tra đăng nhập/đọc/ghi với Firebase production.
- Website chỉ đọc catalog; không ghi thay đổi vào document `/apps/roll-cay-canh`.
- Giá bán lấy từ `sellPrice`/bản đồ giá bán; không fallback sang `price` (giá nhập/giá vốn). Nếu cây chưa có giá bán, người tạo đơn nhập đơn giá thủ công.
- Phiếu kiện hiện in thông tin tổng đơn trên mỗi kiện và số kiện `1/N`. Nếu cần chia từng mặt hàng vào từng kiện, phải bổ sung màn hình phân bổ sản phẩm theo kiện; hiện chưa tự đoán cây nào thuộc kiện nào.
- Dùng trình duyệt Chrome/Edge, chọn máy in hoặc "Save as PDF"; kiểm tra khổ giấy tùy chỉnh 75 × 100 mm trong hộp thoại máy in.
- Không đưa Firebase service-account/private key vào website.
