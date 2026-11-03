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

## Sửa in nhãn theo số cây và tương thích iPhone (03/11/2026)

- Không mở cửa sổ/tab mới (`window.open`) và không dùng iframe. Cả phiếu kiện và phiếu cây được dựng trong trang hiện tại rồi gọi `window.print()` trực tiếp từ thao tác bấm của người dùng, tránh lỗi popup bị Safari trên iPhone chặn.
- Sau khi bấm in, website hiển thị bản xem phiếu ngay trong trang; nếu hộp thoại in không tự hiện, người dùng có thể bấm nút **IN PHIẾU** ngay trên màn hình đó. Có nút **ĐÓNG** để quay lại danh sách đơn.
- Phiếu cây tạo **một nhãn cho mỗi cây thực tế**, lặp theo số lượng `qty` / `quantity` / `soLuong` / `count` của từng dòng sản phẩm. Ví dụ 2 dòng có số lượng 2 và 3 sẽ sinh 5 nhãn, đánh số CÂY 1/5 đến CÂY 5/5.
- Phiếu kiện vẫn giữ nguyên logic: đơn có `parcelAmounts` hợp lệ thì in một phiếu cho mỗi kiện và hiển thị tiền riêng của kiện đó; đơn cũ chưa có dữ liệu phân bổ tiếp tục in một phiếu tổng, không tự suy đoán cách chia tiền.
- Giữ kích thước trang CSS `@page{size:75mm 100mm;margin:0}`. Trình điều khiển/máy in vẫn cần chọn đúng khổ giấy 75×100 mm khi hệ điều hành có yêu cầu.
- Không thay đổi Firestore schema, danh mục, đơn hàng, phân bổ tiền theo kiện hay dữ liệu app ROLL CÂY CẢNH.

Đã kiểm tra cú pháp JavaScript bằng `node --check`; mã in không còn `window.open()`; hàm tạo nhãn lặp theo số lượng từng dòng và tạo trang riêng 75×100 mm. Đã kiểm tra bằng trình duyệt Chromium headless với đơn thử có tổng 5 cây để xác nhận số trang PDF. Chưa thể kiểm thử trực tiếp trên iPhone hoặc máy in vật lý trong môi trường này.


## Quy tắc tách riêng phiếu kiện và phiếu cây (03/11/2026)

- **Phiếu kiện**: số phiếu chỉ căn cứ vào số kiện (`parcelCount`); mỗi kiện một phiếu. Tiền trên phiếu kiện lấy theo `parcelAmounts` đã lưu.
- **Phiếu cây**: số phiếu chỉ căn cứ vào tổng số lượng cây của toàn bộ dòng sản phẩm trong đơn (`qty` / `quantity` / `soLuong` / `count`). Mỗi cây thực tế một phiếu; không chia, lọc hoặc nhân theo số kiện (`parcelCount` / `parcelAmounts`).
- Ví dụ: đơn có tổng 6 cây, gồm 2 loại (2 cây + 4 cây), đóng thành 2 kiện: in phiếu kiện được 2 phiếu; chọn in phiếu cây được 6 phiếu. Nếu 6 cây cùng loại cũng vẫn được 6 phiếu cây.
- Hai nút **In phiếu kiện** và **In phiếu cây** thực hiện độc lập; bấm nút nào chỉ tạo loại phiếu đó.
- In trực tiếp trong trang hiện tại, không mở popup hoặc tab mới; bố cục từng trang vẫn khai báo 75×100 mm.

### Kiểm tra logic phiếu cây
Đã chạy kiểm tra tự động với các mẫu: 2 loại cây số lượng 2+4 (2 kiện), cùng loại ở hai dòng số lượng 1+5 (3 kiện), và dữ liệu legacy dùng trường `quantity` / `soLuong` / `count`. Cả ba đều sinh đúng 6 trang nhãn. Kiểm tra cú pháp JavaScript bằng `node --check` thành công. Chưa kiểm thử trực tiếp trên iPhone hoặc máy in vật lý.
