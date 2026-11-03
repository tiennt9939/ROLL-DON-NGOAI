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

## Hệ thống in PDF đồng nhất đa nền tảng (03/11/2026)

- Đã bỏ việc in HTML qua `window.print()` và CSS `@page`, vì Chrome/Safari và hộp thoại in trên các hệ điều hành có thể tự co giãn khổ giấy khác nhau.
- Khi nhấn **In phiếu kiện** hoặc **In phiếu cây**, website tự dựng PDF trực tiếp trên thiết bị và mở PDF trong chính tab hiện tại. Không mở popup/tab mới, không dùng iframe; tương thích luồng mở PDF của Safari iPhone/iPad và Chrome Android/desktop.
- Mỗi trang PDF có `MediaBox` và `CropBox` chính xác **75 × 100 mm**, ở độ phân giải dựng ảnh khoảng 305 DPI; PDF yêu cầu trình xem không tự co bằng `PrintScaling / None`.
- Phiếu cây độc lập với phiếu kiện: tổng số trang bằng tổng số lượng cây của mọi dòng trong toàn bộ đơn, không chia theo kiện. Một cây là một trang PDF; ví dụ 6 cây chia 2 kiện vẫn là 6 trang phiếu cây.
- Phiếu kiện độc lập: nếu đơn có phân bổ `parcelAmounts` hợp lệ thì một trang PDF cho mỗi kiện và hiển thị tiền riêng kiện đó; đơn cũ chưa có dữ liệu phân bổ vẫn in một phiếu tổng, không tự suy đoán chia tiền.
- Hình ảnh nhãn được dựng ở 900 × 1200 px, sau đó đóng gói vào PDF theo đúng kích thước vật lý; nội dung phiếu cây gồm tên cây, quy cách/kích thước, mã đơn, khách hàng, số điện thoại và số thứ tự cây. Phiếu kiện gồm thông tin người mua, địa chỉ, cây, số kiện, tiền và nhân viên đóng hàng.
- Không thay đổi Firestore schema, danh mục, đơn hàng, phân bổ tiền theo kiện hay dữ liệu app ROLL CÂY CẢNH.

### Khi in từ PDF
Mở PDF trong tab hiện tại rồi chọn **In/Print** trên trình xem PDF. Với máy in nhãn, chọn khổ giấy 75 × 100 mm (hoặc khổ tương ứng máy hỗ trợ) và tỷ lệ **Actual size / 100%** nếu hộp thoại có lựa chọn. File PDF đã cố định kích thước; trình duyệt không còn tự tính khổ từ HTML. Nếu máy in/driver không hỗ trợ khổ 75 × 100 mm thì phần cứng vẫn cần được cấu hình khổ giấy tương ứng.

### Kiểm tra kỹ thuật
- `node --check` thành công với `assets/app.js`.
- PDF mẫu tạo bằng cùng hàm đóng gói có 2 trang; `pdfinfo` xác nhận kích thước mỗi trang là `212.598 × 283.465 pt`, tương đương chính xác `75 × 100 mm`.
- Đã kiểm tra PDF cấu trúc/xref và đọc được bằng công cụ PDF hệ thống. Chưa thể kiểm thử thao tác in thực tế trên từng thiết bị iPhone, Android, iPad hoặc từng model máy in.


## Quy tắc tách riêng phiếu kiện và phiếu cây (03/11/2026)

- **Phiếu kiện**: số phiếu chỉ căn cứ vào số kiện (`parcelCount`); mỗi kiện một phiếu. Tiền trên phiếu kiện lấy theo `parcelAmounts` đã lưu.
- **Phiếu cây**: số phiếu chỉ căn cứ vào tổng số lượng cây của toàn bộ dòng sản phẩm trong đơn (`qty` / `quantity` / `soLuong` / `count`). Mỗi cây thực tế một phiếu; không chia, lọc hoặc nhân theo số kiện (`parcelCount` / `parcelAmounts`).
- Ví dụ: đơn có tổng 6 cây, gồm 2 loại (2 cây + 4 cây), đóng thành 2 kiện: in phiếu kiện được 2 phiếu; chọn in phiếu cây được 6 phiếu. Nếu 6 cây cùng loại cũng vẫn được 6 phiếu cây.
- Hai nút **In phiếu kiện** và **In phiếu cây** thực hiện độc lập; bấm nút nào chỉ tạo loại phiếu đó.
- In trực tiếp trong trang hiện tại, không mở popup hoặc tab mới; bố cục từng trang vẫn khai báo 75×100 mm.

### Kiểm tra logic phiếu cây
Đã chạy kiểm tra tự động với các mẫu: 2 loại cây số lượng 2+4 (2 kiện), cùng loại ở hai dòng số lượng 1+5 (3 kiện), và dữ liệu legacy dùng trường `quantity` / `soLuong` / `count`. Cả ba đều sinh đúng 6 trang nhãn. Kiểm tra cú pháp JavaScript bằng `node --check` thành công. Chưa kiểm thử trực tiếp trên iPhone hoặc máy in vật lý.
