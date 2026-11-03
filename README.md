# ROLL ĐƠN NGOÀI — Danh mục cây độc lập

## Bản cập nhật này làm gì
- Website tiếp tục đọc danh mục hiện có từ `apps/roll-cay-canh` → `data.catalog`.
- Bổ sung collection riêng `externalCatalog` cho cây chỉ dùng trên website.
- Danh mục tạo trên website không ghi ngược vào app ROLL CÂY CẢNH.
- Cây trùng tên sẽ được gom thành một lựa chọn; quy cách riêng trên website được ưu tiên nếu trùng quy cách với danh mục app.
- Admin có tab **Danh mục cây** để thêm, sửa, xóa cây và các quy cách.
- Mỗi quy cách có thể có giá bán riêng; có thể để giá 0 và nhập giá khi tạo đơn.
- Khi tạo đơn, quy cách là tùy chọn; tên cây/quy cách/số lượng được lưu vào từng item.
- Danh sách đơn hiển thị tên cây, quy cách và số lượng; tìm kiếm cũng tìm theo sản phẩm.
- Phiếu kiện in tên cây và quy cách từ dữ liệu đã lưu trong đơn.

## Dữ liệu
- Danh mục app cũ: `apps/roll-cay-canh.data.catalog` (chỉ đọc).
- Danh mục website: `externalCatalog` (đọc cho user đang hoạt động, ghi chỉ admin).
- Đơn ngoài: `externalOrders`.
- Không ghi vào tồn kho, payroll, packingOrders hoặc schema app cũ.

## Triển khai
1. Sao lưu/giữ lại bản source hiện tại của repository `ROLL-DON-NGOAI`.
2. Upload toàn bộ nội dung thư mục `ROLL_DON_NGOAI` trong ZIP lên root repository `ROLL-DON-NGOAI`, ghi đè đúng các file cùng đường dẫn.
3. Commit lên branch `main`, chờ GitHub Actions deploy Pages hoàn tất.
4. Trong Firebase Console → Firestore Database → Rules, chèn nội dung `firestore-rules-addition.txt` bên trong match `/databases/{database}/documents` và trước `match /{document=**}`. Không thay toàn bộ Rules.
5. Chỉ thêm block `match /externalCatalog/{plantId}` trong file này. Giữ nguyên block `externalOrders` đang có và tất cả Rules khác; tuyệt đối không thay toàn bộ Rules.
6. Mở website, đăng nhập bằng tài khoản admin có `role: "admin"` (hoặc `isAdmin: true` trong `users/{uid}`), nhấn Ctrl+Shift+R.
7. Tab **Danh mục cây** sẽ xuất hiện với tài khoản admin. Thêm cây, nhập quy cách phân cách bằng dấu phẩy, ví dụ `C6, C7, C9, C11`. Giá theo thứ tự tương ứng, ví dụ `12000, 15000, 20000, 25000`.

## Kiểm thử trước khi vận hành
- Kiểm tra tài khoản admin nhìn thấy tab Danh mục cây.
- Tạo thử một cây mới, ví dụ `Cẩm tú mai website test`, với các size `C6, C7, C9, C11`.
- Mở tab Tạo đơn, tìm cây vừa tạo và kiểm tra các size.
- Tạo một đơn thử và xác nhận tên cây/quy cách xuất hiện trong danh sách đơn và phiếu in.
- Kiểm tra app ROLL CÂY CẢNH không bị thay đổi danh mục.

## Phân bổ tiền theo từng kiện (bản 03/11/2026)
- Khi nhập số kiện, website tự tạo đúng số ô nhập tiền cho từng kiện.
- Tổng phân bổ được cập nhật trực tiếp; không cho lưu nếu tổng tiền các kiện khác tổng bill (tiền hàng + phí vận chuyển).
- Mỗi đơn mới lưu thêm mảng `parcelAmounts` trong chính document `externalOrders`; không thay đổi collection hay schema của app ROLL CÂY CẢNH.
- Danh sách đơn vẫn hiển thị tổng bill và đồng thời hiển thị số tiền của từng kiện để đối soát.
- Nút **In phiếu kiện** in một phiếu 75×100mm cho mỗi kiện. Mỗi phiếu chỉ hiển thị tiền của kiện tương ứng, không in tổng bill hoặc tiền các kiện khác.
- Đơn cũ chưa có `parcelAmounts` vẫn có thể in theo mẫu cũ; không tự suy đoán cách chia tiền cho đơn cũ.


### Cập nhật đơn giá
Ô đơn giá nhập theo nghìn đồng: nhập `100` tương ứng `100.000 đ`. Giá được lưu trong Firestore theo đơn vị đồng (VND); khi chọn giá từ danh mục, giao diện hiển thị theo nghìn đồng.
