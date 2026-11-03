(() => {
"use strict";
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("vi-VN").format(Number(n)||0) + " ₫";
const today = () => new Date().toLocaleDateString("en-CA");
let db, auth, user=null, userProfile={}, isAdmin=false;
let appCatalog=[], externalDocs=[], catalog=[], plantGroups=[], items=[], orders=[];
let unsubscribeAppCatalog=null, unsubscribeExternalCatalog=null, unsubscribeOrders=null, editingCatalogId=null, editingOrderId=null;

function message(id,text,ok=false){const el=$(id);if(!el)return;el.textContent=text;el.className="message"+(ok?" ok":"");}
function toast(s){const el=$("toast");el.textContent=s;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"d").trim().toLocaleLowerCase("vi").replace(/\s+/g," ");}
function getName(d){return String(d.name||d.plantName||d.title||d.productName||d.tenCay||d.ten||"Cây chưa đặt tên").trim();}
function itemName(item){
  if(!item || typeof item !== "object") return "Cây chưa đặt tên";
  return String(
    item.plantName || item.name || item.productName || item.title ||
    item.tenCay || item.ten || item.product_name || item.product ||
    "Cây chưa đặt tên"
  ).trim();
}
function getSizes(d){
  const raw=d.sizes||d.sizeOptions||d.quyCachList||d.kichThuocList||d.quyCach||d.kichThuoc||d.size;
  let values=[];
  if(Array.isArray(raw))values=raw.map(x=>typeof x==="string"||typeof x==="number"?String(x):(x?.name||x?.size||x?.label||x?.value||"")).filter(Boolean);
  else if(typeof raw==="string")values=raw.split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
  else if(raw&&typeof raw==="object")values=Object.keys(raw);
  return [...new Set(values)];
}
function getPrice(d,size){
  const maps=[d.sellPrices,d.sellPriceBySize,d.pricesBySize];
  for(const m of maps)if(m&&typeof m==="object"&&m[size]!=null)return Number(m[size])||0;
  if(Array.isArray(d.sizes)){const x=d.sizes.find(v=>typeof v==="object"&&(v.name===size||v.size===size));if(x?.sellPrice!=null)return Number(x.sellPrice)||0;}
  return Number(d.sellPrice??d.giaBan??0)||0;
}
function setStatus(s){$("syncStatus").textContent="● "+s;}
function friendly(e){
  if(e.code==="permission-denied")return "Firestore từ chối quyền. Kiểm tra quyền đọc apps/roll-cay-canh, externalCatalog và externalOrders theo hướng dẫn Rules.";
  if(e.code==="unavailable")return "Không kết nối được Firebase. Kiểm tra mạng rồi thử lại.";
  return e.message||"Có lỗi xảy ra.";
}
function isAdminProfile(p){
  const role=String(p.role||p.userRole||"").toLowerCase();
  return p.isAdmin===true||p.admin===true||["admin","owner","superadmin","super_admin"].includes(role);
}
function initFirebase(){
  const cfg=window.ROLL_FIREBASE_CONFIG;
  if(!cfg||!cfg.apiKey||cfg.apiKey==="YOUR_API_KEY")throw new Error("Chưa cấu hình Firebase trong firebase-config.js.");
  if(!firebase.apps.length)firebase.initializeApp(cfg);
  auth=firebase.auth();db=firebase.firestore();
  auth.onAuthStateChanged(async u=>{
    user=u;
    if(!u){showLogin();return;}
    try{
      const profile=await db.collection(window.ROLL_COLLECTIONS.users||"users").doc(u.uid).get();
      userProfile=profile.exists?profile.data()||{}:{};
      if(userProfile.active===false){await auth.signOut();message("loginMessage","Tài khoản đã bị khóa.");return;}
      isAdmin=isAdminProfile(userProfile);
      $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
      $("userEmail").textContent=u.email||"Đã đăng nhập";
      document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!isAdmin));
      subscribeAppCatalog();subscribeExternalCatalog();subscribeOrders();
    }catch(e){showLogin();message("loginMessage",friendly(e));}
  });
}
function showLogin(){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");setStatus("Chưa kết nối");}
function normalizeRows(value){
  if(Array.isArray(value))return value.filter(x=>x&&typeof x==="object");
  if(value&&typeof value==="object")return Object.entries(value).map(([key,x])=>x&&typeof x==="object"?({...x,catalogId:x.catalogId||key}):null).filter(Boolean);
  return [];
}
function normalizeExternalDoc(doc){
  const d=doc.data(), name=getName(d);
  const sizes=Array.isArray(d.sizes)?d.sizes:[];
  if(!sizes.length)return [{...d,id:doc.id,catalogId:"external:"+doc.id,source:"external",name,size:"",sellPrice:Number(d.sellPrice)||0}];
  return sizes.map((s,i)=>({
    id:doc.id+"_"+i,catalogId:"external:"+doc.id+":"+i,source:"external",name,
    size:String(typeof s==="string"?s:(s.name||s.size||s.label||"")).trim(),
    sellPrice:Number(typeof s==="object"?(s.sellPrice??s.price??0):0)||0
  })).filter(x=>x.size);
}
function rebuildCatalog(){
  const rows=[...appCatalog,...externalDocs.flatMap(normalizeExternalDoc)];
  const groups=new Map();
  rows.forEach((row,i)=>{
    const name=getName(row);if(!name||name==="Cây chưa đặt tên")return;
    const key=norm(name);
    if(!groups.has(key))groups.set(key,{key,name,bySize:new Map(),rows:[]});
    const g=groups.get(key), sizes=getSizes(row), size=sizes[0]||"";
    const entry={...row,id:String(row.catalogId||row.id||(`${key}-${size||i}`)),name,size};
    const sizeKey=norm(size);
    const old=g.bySize.get(sizeKey);
    // Website-specific entry wins over the imported app catalog for the same size.
    if(!old||(entry.source==="external"&&old.source!=="external"))g.bySize.set(sizeKey,entry);
  });
  plantGroups=[...groups.values()].map(g=>({...g,rows:[...g.bySize.values()].sort((a,b)=>a.size.localeCompare(b.size,"vi"))})).sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  catalog=rows;
  renderPlantOptions($("plantSearch").value||"");
  $("catalogCount").textContent=`${appCatalog.length+externalDocs.length} dòng danh mục · ${plantGroups.length} loại cây`;
  $("externalCatalogCount").textContent=externalDocs.length+" cây riêng";
  renderExternalCatalog();
}
function subscribeAppCatalog(){
  setStatus("Đang đồng bộ danh mục");
  const path=window.ROLL_COLLECTIONS.catalogDoc;
  unsubscribeAppCatalog=db.collection(path[0]).doc(path[1]).onSnapshot(snap=>{
    const data=snap.exists?snap.data()||{}:{};
    appCatalog=normalizeRows(data.data?.catalog).filter(x=>x.deleted!==true);
    rebuildCatalog();setStatus("Danh mục đã đồng bộ");
  },e=>{setStatus("Lỗi danh mục app");message("formMessage","Không đọc được danh mục app: "+friendly(e));});
}
function subscribeExternalCatalog(){
  unsubscribeExternalCatalog=db.collection(window.ROLL_COLLECTIONS.externalCatalog||"externalCatalog").onSnapshot(s=>{
    externalDocs=s.docs.filter(d=>d.data().deleted!==true);
    rebuildCatalog();
  },e=>{
    message("catalogMessage","Không đọc được danh mục riêng: "+friendly(e));
    message("formMessage","Không tải được danh mục riêng. Cần bổ sung quyền đọc externalCatalog trong Firestore Rules.");
  });
}
function subscribeOrders(){
  unsubscribeOrders=db.collection(window.ROLL_COLLECTIONS.orders).orderBy("createdAtMs","desc").limit(300).onSnapshot(s=>{
    orders=s.docs.map(d=>({id:d.id,...d.data()}));renderOrders();
  },e=>message("formMessage","Không tải được danh sách đơn: "+friendly(e)));
}
function hidePlantSuggestions(){
  const box=$("plantSuggestions");box.classList.add("hidden");$("plantSearch").setAttribute("aria-expanded","false");
}
function choosePlant(key){
  const g=plantGroups.find(x=>x.key===key);if(!g)return;
  $("plantSelect").value=g.key;$("plantSearch").value=g.name;hidePlantSuggestions();updateSizeOptions();
}
function renderPlantOptions(filter=""){
  const sel=$("plantSelect"),old=sel.value,q=norm(filter);
  const list=plantGroups.filter(g=>{
    if(!q)return true;
    const name=norm(g.name);
    // Match the typed phrase anywhere, and also match individual words.
    return name.includes(q)||q.split(/\\s+/).every(part=>name.includes(part));
  });
  sel.innerHTML='<option value="">-- Chọn cây --</option>'+plantGroups.map(g=>`<option value="${safe(g.key)}">${safe(g.name)}</option>`).join("");
  if(plantGroups.some(g=>g.key===old))sel.value=old;
  const box=$("plantSuggestions");
  if(q){
    const matches=list.slice(0,30);
    box.innerHTML=matches.length?matches.map(g=>`<button type="button" class="plant-suggestion" role="option" data-plant-key="${safe(g.key)}"><span>${safe(g.name)}</span><small>${g.rows.filter(r=>r.size).length} quy cách</small></button>`).join(""):'<div class="plant-no-results">Không tìm thấy cây phù hợp</div>';
    box.classList.remove("hidden");$("plantSearch").setAttribute("aria-expanded","true");
    box.querySelectorAll("[data-plant-key]").forEach(b=>b.onclick=()=>choosePlant(b.dataset.plantKey));
  }else hidePlantSuggestions();
  updateSizeOptions();
}
function selectedGroup(){return plantGroups.find(g=>g.key===$("plantSelect").value);}
function selectedRow(group,size){return group?.rows.find(r=>norm(r.size)===norm(size))||null;}
function updateSizeOptions(){
  const g=selectedGroup(),s=$("sizeSelect");
  if(!g){s.innerHTML='<option value="">Không chọn quy cách</option>';$("priceInput").value="";return;}
  const old=s.value, sizes=[...new Set(g.rows.map(r=>r.size).filter(Boolean))];
  s.innerHTML='<option value="">Không chọn quy cách</option>'+sizes.map(x=>`<option value="${safe(x)}">${safe(x)}</option>`).join("");
  if(sizes.includes(old))s.value=old;
  const row=selectedRow(g,s.value)||g.rows[0];
  $("priceInput").value=row?Math.round(getPrice(row,s.value)/1000):"";
}
function orderTotal(){
  return items.reduce((a,x)=>a+x.qty*x.price,0)+(Number($("shippingFee").value)||0);
}
function renderParcelAmountInputs(preserve=true){
  const count=Number($("parcelCount").value);
  const old=preserve?[...document.querySelectorAll("[data-parcel-amount]")].map(x=>Number(x.value)||0):[];
  const safeCount=Number.isInteger(count)&&count>=1&&count<=99?count:1;
  if(safeCount===1){
    $("parcelAmountsInputs").innerHTML='<div class="single-parcel-note">Đơn chỉ có 1 kiện: tự động lấy toàn bộ tổng bill, không cần nhập thêm.</div>';
    updateParcelAllocation();return;
  }
  $("parcelAmountsInputs").innerHTML=Array.from({length:safeCount},(_,i)=>`<label>Kiện ${i+1} (nghìn đồng)<div class="thousand-input"><input type="number" min="0" step="1" inputmode="numeric" data-parcel-amount="${i}" value="${old[i]??0}" placeholder="100"><span>.000 ₫</span></div></label>`).join("");
  $("parcelAmountsInputs").querySelectorAll("[data-parcel-amount]").forEach(input=>input.addEventListener("input",updateParcelAllocation));
  updateParcelAllocation();
}
function parcelAmounts(){
  const count=Number($("parcelCount").value);
  if(count===1)return [orderTotal()];
  return [...document.querySelectorAll("[data-parcel-amount]")].map(x=>(Number(x.value)||0)*1000);
}
function updateParcelAllocation(){
  if(!$("parcelAmountsInputs"))return;
  const values=parcelAmounts(),allocated=values.reduce((a,b)=>a+b,0),total=orderTotal(),delta=total-allocated;
  $("parcelAllocatedTotal").textContent=money(allocated);
  const status=$("parcelAllocationStatus");
  status.textContent=delta===0?"Đã khớp tổng bill":delta>0?`Còn thiếu: ${money(delta)}`:`Đang vượt: ${money(-delta)}`;
  status.className=delta===0?"allocation-ok":"allocation-error";
}
function totals(){
  const subtotal=items.reduce((a,x)=>a+x.qty*x.price,0),ship=Number($("shippingFee").value)||0;
  $("subtotal").textContent=money(subtotal);$("shippingTotal").textContent=money(ship);$("grandTotal").textContent=money(subtotal+ship);
  updateParcelAllocation();
}
function renderItems(){
  const body=$("itemsBody");
  if(!items.length){body.innerHTML='<tr><td colspan="6" class="empty">Chưa có sản phẩm</td></tr>';totals();return;}
  body.innerHTML=items.map((x,i)=>`<tr><td>${safe(x.plantName)}</td><td>${safe(x.size||"—")}</td><td>${x.qty}</td><td>${money(x.price)}</td><td>${money(x.qty*x.price)}</td><td><button type="button" class="remove" data-remove="${i}">Xóa</button></td></tr>`).join("");
  body.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.remove),1);renderItems();});totals();
}
function addItem(){
  const g=selectedGroup(),size=$("sizeSelect").value,row=selectedRow(g,size)||g?.rows[0];
  const qty=Number($("qtyInput").value),price=Number($("priceInput").value)*1000;
  if(!g)return message("formMessage","Hãy chọn cây trong danh mục.");
  if(!Number.isInteger(qty)||qty<1)return message("formMessage","Số lượng phải là số nguyên lớn hơn 0.");
  if(!Number.isFinite(price)||price<0)return message("formMessage","Đơn giá không hợp lệ.");
  items.push({catalogId:row?.catalogId||g.key,plantName:g.name,size:size||"",qty,price,lineTotal:qty*price});
  renderItems();message("formMessage","",true);
}
function resetForm(){
  editingOrderId=null;$("saveBtn").textContent="Lưu đơn hàng";$("orderForm").reset();$("orderDate").value=today();$("parcelCount").value=1;$("shippingFee").value=0;
  items=[];renderItems();renderParcelAmountInputs(false);renderPlantOptions($("plantSearch").value||"");message("formMessage","");
}
async function saveOrder(e){
  e.preventDefault();
  if(!items.length)return message("formMessage","Đơn hàng cần ít nhất một sản phẩm.");
  const buyerName=$("buyerName").value.trim(),buyerPhone=$("buyerPhone").value.trim(),buyerAddress=$("buyerAddress").value.trim(),packerName=$("packerName").value.trim();
  const parcelCount=Number($("parcelCount").value),shippingFee=Number($("shippingFee").value)||0;
  if(!buyerName||!buyerPhone||!buyerAddress||!packerName)return message("formMessage","Vui lòng nhập đủ thông tin người mua và nhân viên đóng hàng.");
  if(!Number.isInteger(parcelCount)||parcelCount<1||parcelCount>99)return message("formMessage","Số kiện phải từ 1 đến 99.");
  const subtotal=items.reduce((a,x)=>a+x.qty*x.price,0),total=subtotal+shippingFee,allocations=parcelAmounts();
  if(allocations.length!==parcelCount||allocations.some(x=>!Number.isSafeInteger(x)||x<0))return message("formMessage","Vui lòng nhập số tiền hợp lệ cho từng kiện (đơn vị nghìn đồng).");
  if(allocations.reduce((a,b)=>a+b,0)!==total)return message("formMessage",`Tổng tiền các kiện phải khớp tổng bill ${money(total)}. Hiện đã phân bổ ${money(allocations.reduce((a,b)=>a+b,0))}.`);
  const now=Date.now();
  const orderNo=$("orderNo").value.trim()||("DN"+today().replaceAll("-","")+"-"+String(now).slice(-6));
  const oldOrder=editingOrderId?orders.find(x=>x.id===editingOrderId):null;
  const payload={orderNo,buyerName,buyerPhone,buyerAddress,orderDate:$("orderDate").value,items:items.map(x=>({...x})),subtotal,shippingFee,total,parcelCount,parcelAmounts:allocations,packerName,note:$("note").value.trim(),status:oldOrder?.status||"created",packagingCompleted:oldOrder?.packagingCompleted===true,packagingCompletedAtMs:oldOrder?.packagingCompletedAtMs||null,createdAtMs:oldOrder?.createdAtMs||now,createdByUid:oldOrder?.createdByUid||user.uid,createdByEmail:oldOrder?.createdByEmail||user.email||"",updatedAtMs:now,source:"ROLL_DON_NGOAI",catalogPath:"apps/roll-cay-canh.data.catalog + externalCatalog"};
  $("saveBtn").disabled=true;$("saveBtn").textContent=editingOrderId?"Đang cập nhật…":"Đang lưu…";
  try{if(editingOrderId){await db.collection(window.ROLL_COLLECTIONS.orders).doc(editingOrderId).update(payload);toast("Đã cập nhật đơn "+orderNo);resetForm();}else{await db.collection(window.ROLL_COLLECTIONS.orders).add(payload);toast("Đã lưu đơn "+orderNo);resetForm();}openTab("orders");}
  catch(err){message("formMessage","Không lưu được đơn: "+friendly(err));}
  finally{$("saveBtn").disabled=false;$("saveBtn").textContent=editingOrderId?"Cập nhật đơn hàng":"Lưu đơn hàng";}
}
function productSummary(o){return (o.items||[]).map(x=>`${x.plantName||x.name||x.productName||"Chưa có tên cây"}${x.size||x.quyCach?" · "+(x.size||x.quyCach):""} × ${x.qty||x.quantity||1}`).join("; ");}
function renderOrders(){
  const q=norm($("orderSearch").value),date=$("dateFilter").value;
  const list=orders.filter(o=>(!date||o.orderDate===date)&&(!q||norm([o.orderNo,o.buyerName,o.buyerPhone,productSummary(o)].join(" ")).includes(q)));
  $("ordersBody").innerHTML=list.length?list.map(o=>{const done=o.packagingCompleted===true;return `<tr class="${done?'order-done':'order-pending'}"><td><b>${safe(o.orderNo)}</b><small class="packing-state ${done?'done':'pending'}">${done?'● Đã đóng gói':'● Chưa hoàn thành'}</small></td><td>${safe(o.orderDate)}</td><td>${safe(o.buyerName)}</td><td>${safe(o.buyerPhone)}</td><td>${safe(productSummary(o)||"—")}</td><td>${o.parcelCount||1}</td><td>${money(o.total)}${Array.isArray(o.parcelAmounts)?`<small class="saved-parcel-amounts">${o.parcelAmounts.map((v,i)=>`Kiện ${i+1}: ${money(v)}`).join(" · ")}</small>`:""}</td><td>${safe(o.packerName)}</td><td><div class="order-print-actions"><button type="button" class="secondary" data-print="${safe(o.id)}">In phiếu kiện</button><button type="button" class="secondary" data-plant-print="${safe(o.id)}">In phiếu cây</button><button class="${done?'secondary':'primary'}" data-toggle-done="${safe(o.id)}">${done?'Bỏ hoàn thành':'Đánh dấu xong'}</button><button class="secondary" data-edit-order="${safe(o.id)}">Sửa đơn</button><button class="danger" data-delete-order="${safe(o.id)}">Xóa đơn</button></div></td></tr>`;}).join(""):'<tr><td colspan="9" class="empty">Không có đơn phù hợp</td></tr>';
  // Delegated print handlers: remain active when the order table is re-rendered.
  $("ordersBody").onclick=e=>{
    const parcelBtn=e.target.closest("[data-print]");
    const plantBtn=e.target.closest("[data-plant-print]");
    if(!parcelBtn&&!plantBtn)return;
    e.preventDefault();e.stopPropagation();
    const btn=parcelBtn||plantBtn;
    const id=parcelBtn?parcelBtn.getAttribute("data-print"):plantBtn.getAttribute("data-plant-print");
    const o=orders.find(x=>String(x.id)===String(id));
    if(!o){toast("Không tìm thấy dữ liệu đơn hàng để in.");return;}
    toast(parcelBtn?"Đang chuẩn bị phiếu kiện…":"Đang chuẩn bị phiếu cây…");
    if(parcelBtn)printOrder(o);else printPlantLabels(o);
  };
  $("ordersBody").querySelectorAll("[data-toggle-done]").forEach(b=>b.onclick=()=>toggleOrderDone(b.dataset.toggleDone));
  $("ordersBody").querySelectorAll("[data-edit-order]").forEach(b=>b.onclick=()=>editOrder(b.dataset.editOrder));
  $("ordersBody").querySelectorAll("[data-delete-order]").forEach(b=>b.onclick=()=>deleteOrder(b.dataset.deleteOrder));
}
async function toggleOrderDone(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  const done=o.packagingCompleted!==true;
  try{await db.collection(window.ROLL_COLLECTIONS.orders).doc(id).update({packagingCompleted:done,packagingCompletedAtMs:done?Date.now():null,packagingCompletedByUid:done?user.uid:null,updatedAtMs:Date.now()});toast(done?"Đã đánh dấu đơn hoàn thành đóng gói":"Đã chuyển đơn về chưa hoàn thành");}
  catch(e){toast("Không cập nhật được trạng thái: "+friendly(e));}
}
function editOrder(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  editingOrderId=id;items=(o.items||[]).map(x=>({catalogId:x.catalogId||"",plantName:x.plantName||x.name||x.productName||"",size:x.size||x.quyCach||"",qty:Number(x.qty||x.quantity)||1,price:Number(x.price||x.unitPrice)||0,lineTotal:Number(x.lineTotal)||((Number(x.qty||x.quantity)||1)*(Number(x.price||x.unitPrice)||0))}));
  $("buyerName").value=o.buyerName||"";$("buyerPhone").value=o.buyerPhone||"";$("buyerAddress").value=o.buyerAddress||"";$("orderDate").value=o.orderDate||today();$("orderNo").value=o.orderNo||"";$("shippingFee").value=Number(o.shippingFee)||0;$("parcelCount").value=Number(o.parcelCount)||1;$("packerName").value=o.packerName||"";$("note").value=o.note||"";
  renderItems();renderParcelAmountInputs(false);
  if(Number(o.parcelCount||1)>1){const vals=Array.isArray(o.parcelAmounts)?o.parcelAmounts:[];document.querySelectorAll("[data-parcel-amount]").forEach((el,i)=>el.value=Math.round((Number(vals[i])||0)/1000));updateParcelAllocation();}
  $("saveBtn").textContent="Cập nhật đơn hàng";openTab("create");window.scrollTo({top:0,behavior:"smooth"});
}
async function deleteOrder(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  if(!confirm(`Bạn chắc chắn muốn xóa đơn ${o.orderNo||id}? Thao tác này không thể hoàn tác.`))return;
  try{await db.collection(window.ROLL_COLLECTIONS.orders).doc(id).delete();toast("Đã xóa đơn "+(o.orderNo||""));}
  catch(e){toast("Không xóa được đơn: "+friendly(e));}
}

function openInPagePrint(title, pagesHtml, pageStyles=""){
  // In trang ngay trong tài liệu hiện tại: không mở popup/tab mới, tương thích Safari iPhone.
  const oldRoot=document.getElementById("rollPrintRoot");
  const oldStyle=document.getElementById("rollPrintStyle");
  if(oldRoot)oldRoot.remove();
  if(oldStyle)oldStyle.remove();

  const style=document.createElement("style");
  style.id="rollPrintStyle";
  style.textContent=`
    @page{size:75mm 100mm;margin:0}
    @media screen{
      body.roll-printing> :not(#rollPrintRoot){display:none!important}
      #rollPrintRoot{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#e9eeeb;padding:10px 8px 24px;-webkit-overflow-scrolling:touch}
      #rollPrintRoot .print-toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;background:#173f32;color:#fff;padding:10px;border-radius:10px;margin:0 auto 12px;max-width:600px;font:14px Arial,sans-serif}
      #rollPrintRoot .print-toolbar button{background:#fff;color:#173f32;border:0;border-radius:7px;padding:10px 15px;font-weight:700;min-height:40px}
      #rollPrintRoot .print-toolbar .close-print{background:#e8eee9;color:#25382e}
      #rollPrintRoot .print-document{width:75mm;margin:0 auto}
      #rollPrintRoot .print-page{background:#fff;box-shadow:0 2px 12px #0002;margin:0 auto 10px}
    }
    @media print{
      html,body{width:75mm!important;min-width:75mm!important;margin:0!important;padding:0!important;background:#fff!important}
      body.roll-printing> :not(#rollPrintRoot){display:none!important}
      #rollPrintRoot{display:block!important;position:static!important;inset:auto!important;z-index:auto!important;width:75mm!important;height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:0!important;background:#fff!important}
      #rollPrintRoot .print-toolbar{display:none!important}
      #rollPrintRoot .print-document{display:block!important;width:75mm!important;margin:0!important;padding:0!important}
      #rollPrintRoot .print-page{display:block!important;width:75mm!important;height:100mm!important;min-height:100mm!important;max-height:100mm!important;margin:0!important;box-shadow:none!important;overflow:hidden!important;break-after:page;page-break-after:always}
      #rollPrintRoot .print-page:last-child{break-after:auto!important;page-break-after:auto!important}
    }
    ${pageStyles}
  `;
  document.head.appendChild(style);

  const root=document.createElement("section");
  root.id="rollPrintRoot";
  root.setAttribute("aria-label",title);
  root.innerHTML=`<div class="print-toolbar"><b>${safe(title)}</b><button type="button" data-print-now>IN PHIẾU</button><button type="button" class="close-print" data-close-print>ĐÓNG</button><span>Đã tạo ${pagesHtml ? "đầy đủ nhãn" : "phiếu"}. Bấm IN PHIẾU nếu hộp in chưa tự hiện.</span></div><div class="print-document">${pagesHtml}</div>`;
  document.body.appendChild(root);
  document.body.classList.add("roll-printing");

  root.querySelector("[data-print-now]").addEventListener("click",()=>{
    // Gọi đồng bộ từ thao tác chạm của người dùng; Safari iOS không cần popup.
    try{window.print();}catch(err){toast("Không gọi được chức năng in. Hãy thử nút IN PHIẾU lần nữa.");}
  });
  root.querySelector("[data-close-print]").addEventListener("click",()=>{
    document.body.classList.remove("roll-printing");
    root.remove();style.remove();
  });

  // Không dùng window.open(), iframe, popup hoặc setTimeout vì iPhone/Safari chặn popup.
  try{window.print();}catch(err){toast("Không gọi được chức năng in. Hãy bấm IN PHIẾU ở thanh phía trên.");}
}

function printOrder(o){
  const count=Math.max(1,Math.min(99,Number(o.parcelCount)||1));
  const allocations=Array.isArray(o.parcelAmounts)&&o.parcelAmounts.length===count
    ?o.parcelAmounts.map(x=>Number(x)||0):null;
  const rows=(Array.isArray(o.items)?o.items:[]).map(x=>{
    const qty=Number(x.qty??x.quantity??x.soLuong??1);
    const price=Number(x.price??x.unitPrice??x.donGia??0);
    const lineTotal=Number(x.lineTotal??x.total??qty*price);
    const size=x.size||x.quyCach||x.specification||"";
    return `<div class="item"><span><b>${safe(itemName(x))}</b>${size?` · ${safe(size)}`:""} × ${qty}</span><b>${money(lineTotal)}</b></div>`;
  }).join("");
  // Mỗi phiếu kiện là một trang riêng; dữ liệu phân bổ tiền theo kiện được giữ nguyên.
  const tickets=(allocations?Array.from({length:count},(_,i)=>i):[null]).map(index=>{
    const hasAllocation=index!==null;
    const amount=hasAllocation?allocations[index]:null;
    return `<article class="ticket print-page">
      <header><strong>ROLL CÂY CẢNH</strong><span>ĐƠN NGOÀI</span></header>
      <div class="order-code">${safe(o.orderNo)}</div>
      <div class="line"><b>Người mua:</b> ${safe(o.buyerName)}</div>
      <div class="line"><b>Điện thoại:</b> ${safe(o.buyerPhone)}</div>
      <div class="line address"><b>Địa chỉ:</b> ${safe(o.buyerAddress)}</div>
      <div class="parcel">${hasAllocation?`KIỆN ${index+1}/${count}`:`SỐ KIỆN: ${count}`}</div>
      <div class="items"><div class="items-heading">DANH SÁCH CÂY (${(o.items||[]).length} loại)</div>${rows||'<div>Không có thông tin sản phẩm</div>'}</div>
      ${hasAllocation?`<div class="parcel-money"><span>TIỀN KIỆN NÀY</span><b>${money(amount)}</b></div>`:`<div class="sum"><span>Tiền hàng</span><b>${money(o.subtotal)}</b></div><div class="sum"><span>Vận chuyển</span><b>${money(o.shippingFee)}</b></div><div class="total"><span>TỔNG BILL</span><b>${money(o.total)}</b></div>`}
      <div class="line"><b>NV đóng hàng:</b> ${safe(o.packerName)}</div>
      ${o.note?`<div class="note"><b>Ghi chú:</b> ${safe(o.note)}</div>`:""}
      <footer>Ngày ${safe(o.orderDate)} · ${safe(o.orderNo)}</footer>
    </article>`;
  }).join("");
  const css=`
    #rollPrintRoot .ticket{padding:4mm;display:flex;flex-direction:column;font:9pt Arial,sans-serif;color:#111;box-sizing:border-box}
    #rollPrintRoot .ticket *{box-sizing:border-box}
    #rollPrintRoot .ticket header{display:flex;justify-content:space-between;border-bottom:1px solid #222;padding-bottom:2mm;font-size:10pt}
    #rollPrintRoot .ticket .order-code{text-align:center;font-size:13pt;font-weight:bold;margin:2mm 0}
    #rollPrintRoot .ticket .line{margin:1mm 0;line-height:1.25;overflow-wrap:anywhere}
    #rollPrintRoot .ticket .address{max-height:12mm;overflow:hidden}
    #rollPrintRoot .ticket .parcel{text-align:center;font-size:15pt;font-weight:bold;border:1.5px solid #111;padding:1.5mm;margin:2mm 0}
    #rollPrintRoot .ticket .items{border-top:1px dashed #777;border-bottom:1px dashed #777;padding:1mm 0;margin:1mm 0;flex:1;overflow:hidden}
    #rollPrintRoot .ticket .items-heading{font-weight:bold;font-size:8pt;margin-bottom:1mm}
    #rollPrintRoot .ticket .item{display:flex;justify-content:space-between;gap:2mm;font-size:8pt;padding:.7mm 0;line-height:1.15;break-inside:avoid}
    #rollPrintRoot .ticket .item span{max-width:48mm;overflow-wrap:anywhere}
    #rollPrintRoot .ticket .sum,#rollPrintRoot .ticket .total{display:flex;justify-content:space-between;margin:1mm 0;gap:2mm}
    #rollPrintRoot .ticket .total{font-size:12pt;font-weight:bold;border-top:1px solid #111;padding-top:1.5mm}
    #rollPrintRoot .ticket .parcel-money{border-top:1px solid #111;border-bottom:1px solid #111;padding:2mm 0;margin:2mm 0;display:flex;flex-direction:column;gap:1mm;text-align:center}
    #rollPrintRoot .ticket .parcel-money span{font-size:8pt;font-weight:bold}
    #rollPrintRoot .ticket .parcel-money b{font-size:15pt}
    #rollPrintRoot .ticket .note{font-size:8pt;margin-top:1mm;overflow-wrap:anywhere}
    #rollPrintRoot .ticket footer{border-top:1px solid #aaa;padding-top:1mm;margin-top:2mm;text-align:center;font-size:7pt}
  `;
  openInPagePrint("Phiếu kiện · "+(o.orderNo||""),tickets,css);
}

function printPlantLabels(o){
  // PHIẾU CÂY LÀ PHIẾU RIÊNG CỦA TOÀN ĐƠN:
  // - Không đọc parcelCount / parcelAmounts.
  // - Tổng số nhãn = tổng số lượng cây của tất cả dòng sản phẩm trong đơn.
  // - Mỗi cây thực tế tạo đúng một nhãn, bất kể đơn được chia thành bao nhiêu kiện.
  const sourceItems=Array.isArray(o.items)?o.items:[];
  const getPlantQty=x=>{
    const candidates=[x.qty,x.quantity,x.soLuong,x.count];
    const raw=candidates.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
    const value=raw===undefined?1:Number(String(raw).trim().replace(',','.'));
    return Number.isFinite(value)&&value>0?Math.floor(value):0;
  };
  const plantRows=sourceItems.map(x=>({
    name:itemName(x),
    size:x.size||x.quyCach||x.specification||x.kichThuoc||'',
    qty:getPlantQty(x)
  })).filter(x=>x.qty>0);
  const totalPlants=plantRows.reduce((sum,x)=>sum+x.qty,0);
  if(!totalPlants){toast("Đơn hàng chưa có số lượng cây hợp lệ để in.");return;}
  if(totalPlants>500){toast("Đơn có quá 500 cây. Vui lòng kiểm tra lại số lượng trước khi in.");return;}

  const labels=[];
  plantRows.forEach(row=>{
    for(let i=0;i<row.qty;i++)labels.push({name:row.name,size:row.size});
  });
  const pages=labels.map((x,index)=>`<article class="label print-page">
    <div class="brand">ROLL CÂY CẢNH · THÔNG TIN CÂY</div>
    <div class="plant-name">${safe(x.name)}</div>
    <div class="plant-size"><span>QUY CÁCH / KÍCH THƯỚC</span><b>${safe(x.size||"Chưa có thông tin")}</b></div>
    <div class="order-no"><span>MÃ ĐƠN</span><b>${safe(o.orderNo||"")}</b></div>
    <div class="customer"><span>KHÁCH HÀNG</span><b>${safe(o.buyerName||"")}</b></div>
    <div class="phone"><span>SỐ ĐIỆN THOẠI</span><b>${safe(o.buyerPhone||"Chưa có số điện thoại")}</b></div>
    <div class="sequence">CÂY ${index+1} / ${totalPlants}</div>
  </article>`).join("");
  const css=`
    #rollPrintRoot .label{padding:5mm;display:flex;flex-direction:column;color:#111;font-family:Arial,sans-serif}
    #rollPrintRoot .label *{box-sizing:border-box}
    #rollPrintRoot .label .brand{text-align:center;font-size:9pt;font-weight:bold;border-bottom:1px solid #222;padding-bottom:2mm}
    #rollPrintRoot .label .plant-name{text-align:center;font-size:19pt;font-weight:800;line-height:1.15;overflow-wrap:anywhere;margin:3mm 0}
    #rollPrintRoot .label .plant-size{border:1.5px solid #111;padding:3mm;text-align:center;display:flex;flex-direction:column;gap:2mm;margin:1mm 0}
    #rollPrintRoot .label .plant-size span,#rollPrintRoot .label .order-no span,#rollPrintRoot .label .customer span,#rollPrintRoot .label .phone span{font-size:8pt;font-weight:bold}
    #rollPrintRoot .label .plant-size b{font-size:16pt;overflow-wrap:anywhere}
    #rollPrintRoot .label .order-no,#rollPrintRoot .label .customer,#rollPrintRoot .label .phone{display:flex;flex-direction:column;gap:1mm;border-bottom:1px dashed #777;padding:2mm 0}
    #rollPrintRoot .label .order-no b{font-size:16pt;overflow-wrap:anywhere}
    #rollPrintRoot .label .customer b,#rollPrintRoot .label .phone b{font-size:12pt;overflow-wrap:anywhere;word-break:break-word}
    #rollPrintRoot .label .sequence{margin-top:auto;text-align:center;font-size:9pt;font-weight:bold;border-top:1px solid #222;padding-top:2mm}
  `;
  openInPagePrint("Phiếu cây · "+(o.orderNo||"")+` · ${totalPlants} cây / ${totalPlants} nhãn`,pages,css);
}

function resetCatalogForm(){
  editingCatalogId=null;$("catalogForm").reset();$("catalogFormTitle").textContent="Thêm cây mới";
  $("saveCatalogBtn").textContent="Lưu cây vào danh mục riêng";$("cancelCatalogEdit").classList.add("hidden");
}
function renderExternalCatalog(){
  if(!$("externalCatalogBody"))return;
  const q=norm($("externalCatalogSearch").value);
  const docs=externalDocs.filter(d=>!q||norm(getName(d.data())).includes(q));
  $("externalCatalogBody").innerHTML=docs.length?docs.map(doc=>{
    const d=doc.data(),sizes=Array.isArray(d.sizes)?d.sizes:[];
    return `<tr><td><b>${safe(getName(d))}</b></td><td>${sizes.map(s=>safe(typeof s==="string"?s:(s.name||s.size||""))).join(", ")||"—"}</td><td>${sizes.map(s=>money(typeof s==="object"?(s.sellPrice??s.price??0):0)).join("<br>")||"—"}</td><td><button class="secondary" data-edit-catalog="${safe(doc.id)}">Sửa</button> <button class="remove" data-delete-catalog="${safe(doc.id)}">Xóa</button></td></tr>`;
  }).join(""):'<tr><td colspan="4" class="empty">Chưa có cây riêng trên website</td></tr>';
  $("externalCatalogBody").querySelectorAll("[data-edit-catalog]").forEach(b=>b.onclick=()=>editExternalCatalog(b.dataset.editCatalog));
  $("externalCatalogBody").querySelectorAll("[data-delete-catalog]").forEach(b=>b.onclick=()=>deleteExternalCatalog(b.dataset.deleteCatalog));
}
function editExternalCatalog(id){
  if(!isAdmin)return;
  const doc=externalDocs.find(d=>d.id===id);if(!doc)return;
  const d=doc.data(),sizes=Array.isArray(d.sizes)?d.sizes:[];
  editingCatalogId=id;$("externalPlantName").value=getName(d);
  $("externalPlantSizes").value=sizes.map(s=>typeof s==="string"?s:(s.name||s.size||"")).join(", ");
  $("externalPlantPrices").value=sizes.map(s=>typeof s==="object"?(s.sellPrice??s.price??""):"").join(", ");
  $("catalogFormTitle").textContent="Sửa cây trong danh mục riêng";
  $("saveCatalogBtn").textContent="Cập nhật cây";$("cancelCatalogEdit").classList.remove("hidden");
  openTab("catalog");window.scrollTo({top:0,behavior:"smooth"});
}
async function deleteExternalCatalog(id){
  if(!isAdmin)return toast("Chỉ quản trị viên được xóa danh mục.");
  if(!confirm("Xóa cây này khỏi danh mục riêng của website? Các đơn đã tạo không bị thay đổi."))return;
  try{await db.collection(window.ROLL_COLLECTIONS.externalCatalog||"externalCatalog").doc(id).delete();toast("Đã xóa cây khỏi danh mục riêng.");}
  catch(e){message("catalogMessage","Không xóa được: "+friendly(e));}
}
async function saveExternalCatalog(e){
  e.preventDefault();
  if(!isAdmin)return message("catalogMessage","Tài khoản hiện tại không có quyền quản trị danh mục riêng.");
  const name=$("externalPlantName").value.trim();
  const sizes=$("externalPlantSizes").value.split(/[,;|]/).map(s=>s.trim()).filter(Boolean);
  const prices=$("externalPlantPrices").value.split(/[,;|]/).map(s=>s.trim());
  if(!name||!sizes.length)return message("catalogMessage","Vui lòng nhập tên cây và ít nhất một quy cách.");
  if(new Set(sizes.map(norm)).size!==sizes.length)return message("catalogMessage","Có quy cách bị trùng. Hãy kiểm tra lại.");
  const parsed=sizes.map((s,i)=>{
    const raw=prices[i]||"",price=raw===""?0:Number(raw.replace(/[^\d.-]/g,""));
    if(!Number.isFinite(price)||price<0)throw new Error("Giá bán không hợp lệ ở quy cách "+s);
    return {name:s,sellPrice:price};
  });
  const duplicate=externalDocs.find(d=>d.id!==editingCatalogId&&norm(getName(d.data()))===norm(name));
  if(duplicate)return message("catalogMessage","Tên cây này đã có trong danh mục riêng. Hãy sửa cây hiện có thay vì tạo trùng.");
  const payload={name,sizes:parsed,source:"ROLL_DON_NGOAI",updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:user.uid,updatedByEmail:user.email||""};
  try{
    const ref=db.collection(window.ROLL_COLLECTIONS.externalCatalog||"externalCatalog");
    if(editingCatalogId)await ref.doc(editingCatalogId).set(payload,{merge:true});
    else await ref.add({...payload,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:user.uid});
    message("catalogMessage","Đã lưu danh mục cây riêng.",true);resetCatalogForm();toast("Danh mục cây đã cập nhật.");
  }catch(err){message("catalogMessage","Không lưu được danh mục: "+friendly(err));}
}
function openTab(tab){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  ["create","orders","catalog"].forEach(x=>$(x+"Tab").classList.toggle("hidden",x!==tab));
}
$("loginBtn").onclick=async()=>{try{await auth.signInWithEmailAndPassword($("email").value.trim(),$("password").value);message("loginMessage","");}catch(e){message("loginMessage",friendly(e));}};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click();});
$("logoutBtn").onclick=()=>auth.signOut();
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
$("plantSelect").onchange=()=>{const g=selectedGroup();if(g)$("plantSearch").value=g.name;updateSizeOptions();};
$("sizeSelect").onchange=()=>{const g=selectedGroup(),r=selectedRow(g,$("sizeSelect").value);$("priceInput").value=r?Math.round(getPrice(r,$("sizeSelect").value)/1000):0;};
$("plantSearch").addEventListener("input",e=>{
  const current=selectedGroup();
  if(current&&norm(current.name)!==norm(e.target.value)){
    $("plantSelect").value="";
    updateSizeOptions();
  }
  renderPlantOptions(e.target.value);
});
$("plantSearch").addEventListener("focus",()=>{
  renderPlantOptions($("plantSearch").value||"");
});
$("plantSearch").addEventListener("keydown",e=>{
  if(e.key==="Escape")hidePlantSuggestions();
  else if(e.key==="Enter"){
    const first=$("plantSuggestions").querySelector("[data-plant-key]");
    if(first){e.preventDefault();choosePlant(first.dataset.plantKey);}
  }
});
document.addEventListener("click",e=>{if(!e.target.closest(".plant-picker"))hidePlantSuggestions();});
$("addItemBtn").onclick=addItem;$("shippingFee").oninput=totals;$("parcelCount").addEventListener("input",()=>renderParcelAmountInputs(true));$("orderForm").onsubmit=saveOrder;$("resetBtn").onclick=resetForm;
$("orderSearch").oninput=renderOrders;$("dateFilter").onchange=renderOrders;$("clearFilter").onclick=()=>{$("dateFilter").value="";$("orderSearch").value="";renderOrders();};
$("newOrderBtn").onclick=()=>openTab("create");
$("catalogForm").onsubmit=saveExternalCatalog;$("cancelCatalogEdit").onclick=resetCatalogForm;$("externalCatalogSearch").oninput=renderExternalCatalog;
$("orderDate").value=today();renderParcelAmountInputs(false);
try{initFirebase();}catch(e){message("loginMessage",e.message);}
})();