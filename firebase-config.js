/*
 * DÁN firebaseConfig của dự án ROLL CÂY CẢNH vào đây.
 * Lấy tại Firebase Console > Project settings > Your apps > Web app.
 * Không đưa service-account/private key vào website.
 */
window.ROLL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB6qZX3FZAnWX0wagxSBbnr-TG7ZK3ASTU",
  authDomain: "roll-cay-canh.firebaseapp.com",
  projectId: "roll-cay-canh",
  storageBucket: "roll-cay-canh.firebasestorage.app",
  messagingSenderId: "311724804563",
  appId: "1:311724804563:web:ae8331367750f508860726",
  measurementId: "G-BZ90BLW5EV"
};

/*
 * Đọc đúng catalog đang được app ROLL CÂY CẢNH sử dụng:
 * /apps/roll-cay-canh.data.catalog
 * Mỗi phần tử là một dòng cây/quy cách; giá bán lấy từ sellPrice.
 * Website chỉ đọc document này, tuyệt đối không ghi ngược vào app.
 */
window.ROLL_COLLECTIONS = {
  catalogDoc: ["apps", "roll-cay-canh"],
  orders: "externalOrders",
  users: "users"
};
