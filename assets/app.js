(() => {
"use strict";
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("vi-VN").format(Number(n)||0) + " ₫";
const today = () => new Date().toLocaleDateString("en-CA");
let db, auth, user=null, userProfile={}, isAdmin=false;
let appCatalog=[], externalDocs=[], catalog=[], plantGroups=[], items=[], orders=[];
let unsubscribeAppCatalog=null, unsubscribeExternalCatalog=null, unsubscribeOrders=null, editingCatalogId=null;

function message(id,text,ok=false){const el=$(id);if(!el)return;el.textContent=text;el.className="message"+(ok?" ok":"");}
function toast(s){const el=$("toast");el.textContent=s;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"d").trim().toLocaleLowerCase("vi").replace(/\s+/g," ");}
function getName(d){return String(d.name||d.plantName||d.title||d.productName||d.tenCay||d.ten||"Cây chưa đặt tên").trim();}
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
  $("priceInput").value=row?getPrice(row,s.value):"";
}
function totals(){
  const subtotal=items.reduce((a,x)=>a+x.qty*x.price,0),ship=Number($("shippingFee").value)||0;
  $("subtotal").textContent=money(subtotal);$("shippingTotal").textContent=money(ship);$("grandTotal").textContent=money(subtotal+ship);
}
function renderItems(){
  const body=$("itemsBody");
  if(!items.length){body.innerHTML='<tr><td colspan="6" class="empty">Chưa có sản phẩm</td></tr>';totals();return;}
  body.innerHTML=items.map((x,i)=>`<tr><td>${safe(x.plantName)}</td><td>${safe(x.size||"—")}</td><td>${x.qty}</td><td>${money(x.price)}</td><td>${money(x.qty*x.price)}</td><td><button type="button" class="remove" data-remove="${i}">Xóa</button></td></tr>`).join("");
  body.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.remove),1);renderItems();});totals();
}
function addItem(){
  const g=selectedGroup(),size=$("sizeSelect").value,row=selectedRow(g,size)||g?.rows[0];
  const qty=Number($("qtyInput").value),price=Number($("priceInput").value);
  if(!g)return message("formMessage","Hãy chọn cây trong danh mục.");
  if(!Number.isInteger(qty)||qty<1)return message("formMessage","Số lượng phải là số nguyên lớn hơn 0.");
  if(!Number.isFinite(price)||price<0)return message("formMessage","Đơn giá không hợp lệ.");
  items.push({catalogId:row?.catalogId||g.key,plantName:g.name,size:size||"",qty,price,lineTotal:qty*price});
  renderItems();message("formMessage","",true);
}
function resetForm(){
  $("orderForm").reset();$("orderDate").value=today();$("parcelCount").value=1;$("shippingFee").value=0;
  items=[];renderItems();renderPlantOptions($("plantSearch").value||"");message("formMessage","");
}
async function saveOrder(e){
  e.preventDefault();
  if(!items.length)return message("formMessage","Đơn hàng cần ít nhất một sản phẩm.");
  const buyerName=$("buyerName").value.trim(),buyerPhone=$("buyerPhone").value.trim(),buyerAddress=$("buyerAddress").value.trim(),packerName=$("packerName").value.trim();
  const parcelCount=Number($("parcelCount").value),shippingFee=Number($("shippingFee").value)||0;
  if(!buyerName||!buyerPhone||!buyerAddress||!packerName)return message("formMessage","Vui lòng nhập đủ thông tin người mua và nhân viên đóng hàng.");
  if(!Number.isInteger(parcelCount)||parcelCount<1||parcelCount>99)return message("formMessage","Số kiện phải từ 1 đến 99.");
  const subtotal=items.reduce((a,x)=>a+x.qty*x.price,0),now=Date.now();
  const orderNo=$("orderNo").value.trim()||("DN"+today().replaceAll("-","")+"-"+String(now).slice(-6));
  const payload={orderNo,buyerName,buyerPhone,buyerAddress,orderDate:$("orderDate").value,items:items.map(x=>({...x})),subtotal,shippingFee,total:subtotal+shippingFee,parcelCount,packerName,note:$("note").value.trim(),status:"created",createdAtMs:now,createdByUid:user.uid,createdByEmail:user.email||"",updatedAtMs:now,source:"ROLL_DON_NGOAI",catalogPath:"apps/roll-cay-canh.data.catalog + externalCatalog"};
  $("saveBtn").disabled=true;$("saveBtn").textContent="Đang lưu…";
  try{await db.collection(window.ROLL_COLLECTIONS.orders).add(payload);toast("Đã lưu đơn "+orderNo);resetForm();openTab("orders");}
  catch(err){message("formMessage","Không lưu được đơn: "+friendly(err));}
  finally{$("saveBtn").disabled=false;$("saveBtn").textContent="Lưu đơn hàng";}
}
function productSummary(o){return (o.items||[]).map(x=>`${x.plantName||x.name||x.productName||"Chưa có tên cây"}${x.size||x.quyCach?" · "+(x.size||x.quyCach):""} × ${x.qty||x.quantity||1}`).join("; ");}
function renderOrders(){
  const q=norm($("orderSearch").value),date=$("dateFilter").value;
  const list=orders.filter(o=>(!date||o.orderDate===date)&&(!q||norm([o.orderNo,o.buyerName,o.buyerPhone,productSummary(o)].join(" ")).includes(q)));
  $("ordersBody").innerHTML=list.length?list.map(o=>`<tr><td><b>${safe(o.orderNo)}</b></td><td>${safe(o.orderDate)}</td><td>${safe(o.buyerName)}</td><td>${safe(o.buyerPhone)}</td><td>${safe(productSummary(o)||"—")}</td><td>${o.parcelCount||1}</td><td>${money(o.total)}</td><td>${safe(o.packerName)}</td><td><button class="secondary" data-print="${safe(o.id)}">In phiếu</button></td></tr>`).join(""):'<tr><td colspan="9" class="empty">Không có đơn phù hợp</td></tr>';
  $("ordersBody").querySelectorAll("[data-print]").forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.dataset.print);if(o)printOrder(o);});
}
function itemName(x){return x.plantName||x.name||x.productName||x.title||x.tenCay||"Chưa có tên cây";}
function printOrder(o){
  const pages=Array.from({length:Math.max(1,Math.min(99,Number(o.parcelCount)||1))},(_,i)=>`
  <article class="ticket">
    <header><strong>ROLL CÂY CẢNH</strong><span>ĐƠN NGOÀI</span></header>
    <div class="order-code">${safe(o.orderNo)}</div>
    <div class="line"><b>Người mua:</b> ${safe(o.buyerName)}</div>
    <div class="line"><b>Điện thoại:</b> ${safe(o.buyerPhone)}</div>
    <div class="line address"><b>Địa chỉ:</b> ${safe(o.buyerAddress)}</div>
    <div class="parcel">KIỆN ${i+1}/${o.parcelCount||1}</div>
    <div class="items">${(Array.isArray(o.items)?o.items:[]).map(x=>{const qty=Number(x.qty??x.quantity??x.soLuong??1),price=Number(x.price??x.unitPrice??x.donGia??0),lineTotal=Number(x.lineTotal??x.total??qty*price);return `<div class="item"><span><b>${safe(itemName(x))}</b>${x.size||x.quyCach?" · "+safe(x.size||x.quyCach):""} × ${qty}</span><b>${money(lineTotal)}</b></div>`;}).join("")}</div>
    <div class="sum"><span>Tiền hàng</span><b>${money(o.subtotal)}</b></div>
    <div class="sum"><span>Vận chuyển</span><b>${money(o.shippingFee)}</b></div>
    <div class="total"><span>TỔNG BILL</span><b>${money(o.total)}</b></div>
    <div class="line"><b>Số kiện:</b> ${o.parcelCount||1}</div>
    <div class="line"><b>NV đóng hàng:</b> ${safe(o.packerName)}</div>
    ${o.note?`<div class="note"><b>Ghi chú:</b> ${safe(o.note)}</div>`:""}
    <footer>Ngày ${safe(o.orderDate)} · Phiếu ${i+1}/${o.parcelCount||1}</footer>
  </article>`).join("");
  const w=window.open("","_blank","width=520,height=720");
  if(!w){toast("Trình duyệt chặn cửa sổ in. Cho phép pop-up rồi thử lại.");return;}
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${safe(o.orderNo)} - Phiếu kiện</title><style>
  @page{size:75mm 100mm;margin:0}*{box-sizing:border-box}body{margin:0;font:9pt Arial,sans-serif;color:#111}
  .ticket{width:75mm;min-height:100mm;padding:4mm;page-break-after:always;overflow:visible;display:flex;flex-direction:column}
  .ticket:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;border-bottom:1px solid #222;padding-bottom:2mm;font-size:10pt}
  .order-code{text-align:center;font-size:13pt;font-weight:bold;margin:2mm 0}.line{margin:1mm 0;line-height:1.25}.address{max-height:12mm;overflow:hidden}
  .parcel{text-align:center;font-size:15pt;font-weight:bold;border:1.5px solid #111;padding:1.5mm;margin:2mm 0}
  .items{border-top:1px dashed #777;border-bottom:1px dashed #777;padding:1.5mm 0;margin:1mm 0;flex:0 0 auto;min-height:8mm}
  .item{display:flex;align-items:flex-start;justify-content:space-between;gap:2mm;font-size:8pt;line-height:1.25;padding:1mm 0}
  .item span{flex:1;min-width:0;overflow-wrap:anywhere}.item b{white-space:nowrap;flex:0 0 auto}
  .sum,.total{display:flex;justify-content:space-between;margin:1mm 0}.total{font-size:12pt;font-weight:bold;border-top:1px solid #111;padding-top:1.5mm}
  .note{font-size:8pt;margin-top:1mm}footer{border-top:1px solid #aaa;padding-top:1mm;margin-top:2mm;text-align:center;font-size:7pt}
  @media screen{body{background:#ddd}.ticket{background:white;margin:8px auto;box-shadow:0 2px 12px #0003}}
  </style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`);
  w.document.close();
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
$("sizeSelect").onchange=()=>{const g=selectedGroup(),r=selectedRow(g,$("sizeSelect").value);$("priceInput").value=r?getPrice(r,$("sizeSelect").value):0;};
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
$("addItemBtn").onclick=addItem;$("shippingFee").oninput=totals;$("orderForm").onsubmit=saveOrder;$("resetBtn").onclick=resetForm;
$("orderSearch").oninput=renderOrders;$("dateFilter").onchange=renderOrders;$("clearFilter").onclick=()=>{$("dateFilter").value="";$("orderSearch").value="";renderOrders();};
$("newOrderBtn").onclick=()=>openTab("create");
$("catalogForm").onsubmit=saveExternalCatalog;$("cancelCatalogEdit").onclick=resetCatalogForm;$("externalCatalogSearch").oninput=renderExternalCatalog;
$("orderDate").value=today();
try{initFirebase();}catch(e){message("loginMessage",e.message);}
})();