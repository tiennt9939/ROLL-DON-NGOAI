(() => {
"use strict";
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("vi-VN").format(Number(n)||0) + " ₫";
const today = () => new Date().toLocaleDateString("en-CA");
let db, auth, user=null, catalog=[], plantGroups=[], items=[], orders=[], unsubscribeCatalog=null, unsubscribeOrders=null;

function message(id, text, ok=false){const el=$(id);el.textContent=text;el.className="message"+(ok?" ok":"");}
function toast(s){const el=$("toast");el.textContent=s;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function getName(d){return String(d.name||d.plantName||d.title||d.productName||d.tenCay||d.ten||"Cây chưa đặt tên").trim();}
function norm(s){return String(s||"").trim().toLocaleLowerCase("vi").replace(/\s+/g," ");}
function getRowSize(d){
  const v=d.size??d.quyCach??d.specification??d.kichThuoc??"";
  if(Array.isArray(v))return v.map(x=>String(x)).filter(Boolean);
  if(v&&typeof v==="object")return [v.name||v.size||v.label||v.value].filter(Boolean).map(String);
  return String(v).trim()?[String(v).trim()]:[];
}
function getSizes(d){
  const fields=[d.sizes,d.sizeOptions,d.quyCachList,d.kichThuocList];
  for(const raw of fields){
    let result=[];
    if(Array.isArray(raw)) result=raw.map(x=>typeof x==="string"||typeof x==="number"?String(x):(x?.name||x?.size||x?.label||x?.value||"")).filter(Boolean);
    else if(typeof raw==="string") result=raw.split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
    else if(raw&&typeof raw==="object") result=Object.keys(raw);
    if(result.length)return [...new Set(result)];
  }
  const direct=getRowSize(d);
  if(direct.length)return direct;
  const m=getName(d).match(/\bC\s*[-_]?\s*\d+\b/i);
  return m?[m[0].replace(/\s+/g,"").replace("-","").toUpperCase()]:[];
}
function getPrice(d,size){
  const maps=[d.sellPrices,d.sellPriceBySize,d.pricesBySize];
  for(const m of maps)if(m&&typeof m==="object"&&m[size]!=null)return Number(m[size])||0;
  const sizeObj=Array.isArray(d.sizes)?d.sizes.find(x=>typeof x==="object"&&(x.name===size||x.size===size)):null;
  if(sizeObj&&sizeObj.sellPrice!=null)return Number(sizeObj.sellPrice)||0;
  return Number(d.sellPrice??d.giaBan??0)||0;
}
function setStatus(s){$("syncStatus").textContent="● "+s;}
function initFirebase(){
  const cfg=window.ROLL_FIREBASE_CONFIG;
  if(!cfg||!cfg.apiKey||cfg.apiKey==="YOUR_API_KEY")throw new Error("Chưa cấu hình Firebase. Mở firebase-config.js và điền Web App config.");
  if(!firebase.apps.length)firebase.initializeApp(cfg);
  auth=firebase.auth();db=firebase.firestore();
  auth.onAuthStateChanged(async u=>{
    user=u;if(!u){showLogin();return;}
    try{
      const profile=await db.collection("users").doc(u.uid).get();
      if(profile.exists&&profile.data().active===false){await auth.signOut();message("loginMessage","Tài khoản đã bị khóa.");return;}
      $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
      $("userEmail").textContent=u.email||"Đã đăng nhập";subscribeCatalog();subscribeOrders();
    }catch(e){showLogin();message("loginMessage",friendly(e));}
  });
}
function friendly(e){
  if(e.code==="permission-denied")return "Tài khoản chưa được cấp quyền đọc danh mục hoặc ghi đơn ngoài. Cần bổ sung Firestore Rules.";
  if(e.code==="unavailable")return "Không kết nối được Firebase. Kiểm tra mạng rồi thử lại.";
  return e.message||"Có lỗi xảy ra.";
}
function showLogin(){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");setStatus("Chưa kết nối");}
function buildPlantGroups(rows){
  const map=new Map();
  rows.forEach((row,i)=>{
    const name=getName(row), key=norm(name);
    if(!map.has(key))map.set(key,{id:"plant-"+key,name,variants:[],base:row});
    const g=map.get(key);g.variants.push({...row,_rowIndex:i});
    if(!g.base.sellPrice&&row.sellPrice)g.base=row;
  });
  return [...map.values()].map(g=>{
    const seen=new Set();
    g.variants=g.variants.filter(v=>{
      const sizes=getSizes(v), k=(v.catalogId||v.id||"")+"|"+sizes.join(",");
      if(seen.has(k))return false;seen.add(k);return true;
    });
    g.sizes=[...new Set(g.variants.flatMap(getSizes))];
    return g;
  }).sort((a,b)=>a.name.localeCompare(b.name,"vi"));
}
function subscribeCatalog(){
  setStatus("Đang đồng bộ danh mục");
  const path=window.ROLL_COLLECTIONS.catalogDoc;
  unsubscribeCatalog=db.collection(path[0]).doc(path[1]).onSnapshot(snap=>{
    if(!snap.exists){message("formMessage","Chưa tìm thấy document apps/roll-cay-canh.");return;}
    const shared=snap.data()||{}, appData=shared.data||{};
    const rows=Array.isArray(appData.catalog)?appData.catalog:[];
    catalog=rows.filter(x=>x&&x.deleted!==true&&x.active!==false&&x.hidden!==true);
    plantGroups=buildPlantGroups(catalog);
    renderPlantOptions($("plantSearch").value||"");
    $("catalogCount").textContent=plantGroups.length+" loại cây · "+catalog.length+" dòng quy cách đồng bộ";
    setStatus("Danh mục đã đồng bộ");
  },e=>{setStatus("Lỗi danh mục");message("formMessage","Không đọc được danh mục: "+friendly(e));});
}
function subscribeOrders(){
  unsubscribeOrders=db.collection(window.ROLL_COLLECTIONS.orders).orderBy("createdAtMs","desc").limit(300).onSnapshot(s=>{
    orders=s.docs.map(d=>({id:d.id,...d.data()}));renderOrders();
  },e=>{message("formMessage","Không tải được danh sách đơn: "+friendly(e));});
}
function renderPlantOptions(filter=""){
  const sel=$("plantSelect"),old=sel.value,q=norm(filter);
  const list=plantGroups.filter(p=>!q||norm(p.name).includes(q));
  sel.innerHTML='<option value="">-- Chọn cây --</option>'+list.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join("");
  if(list.some(p=>p.id===old))sel.value=old;
  updateSizeOptions();
}
function selectedPlant(){return plantGroups.find(x=>x.id===$("plantSelect").value);}
function selectedVariant(p,size){
  if(!p)return null;
  return p.variants.find(v=>getSizes(v).includes(size))||null;
}
function updateSizeOptions(){
  const p=selectedPlant(),s=$("sizeSelect");
  if(!p){s.innerHTML='<option value="">Không chọn quy cách</option>';$("priceInput").value="";return;}
  const sizes=p.sizes||[];
  s.innerHTML='<option value="">Không chọn quy cách</option>'+sizes.map(x=>`<option value="${safe(x)}">${safe(x)}</option>`).join("");
  const v=selectedVariant(p,s.value);
  $("priceInput").value=getPrice(v||p.base,s.value);
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
  const p=selectedPlant(),size=$("sizeSelect").value,qty=Number($("qtyInput").value),price=Number($("priceInput").value);
  if(!p)return message("formMessage","Hãy chọn cây trong danh mục.");
  if(!Number.isInteger(qty)||qty<1)return message("formMessage","Số lượng phải là số nguyên lớn hơn 0.");
  if(!Number.isFinite(price)||price<0)return message("formMessage","Đơn giá không hợp lệ.");
  const v=size?selectedVariant(p,size):null;
  items.push({catalogId:v?.catalogId||v?.id||p.base.catalogId||p.base.id||p.id,plantName:p.name,size:size||"",qty,price,lineTotal:qty*price});
  renderItems();message("formMessage","",true);
}
function resetForm(){
  $("orderForm").reset();$("orderDate").value=today();$("parcelCount").value=1;$("shippingFee").value=0;
  items=[];renderItems();renderPlantOptions("");message("formMessage","");
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
  const payload={orderNo,buyerName,buyerPhone,buyerAddress,orderDate:$("orderDate").value,items:items.map(x=>({...x})),subtotal,shippingFee,total:subtotal+shippingFee,parcelCount,packerName,note:$("note").value.trim(),status:"created",createdAtMs:now,createdByUid:user.uid,createdByEmail:user.email||"",updatedAtMs:now,source:"ROLL_DON_NGOAI",catalogPath:"apps/roll-cay-canh.data.catalog"};
  $("saveBtn").disabled=true;$("saveBtn").textContent="Đang lưu…";
  try{await db.collection(window.ROLL_COLLECTIONS.orders).add(payload);toast("Đã lưu đơn "+orderNo);resetForm();openTab("orders");}
  catch(err){message("formMessage","Không lưu được đơn: "+friendly(err));}
  finally{$("saveBtn").disabled=false;$("saveBtn").textContent="Lưu đơn hàng";}
}
function itemName(x){
  if(x.plantName||x.name||x.productName||x.title||x.tenCay||x.ten)return x.plantName||x.name||x.productName||x.title||x.tenCay||x.ten;
  const found=catalog.find(p=>String(p.catalogId||p.id||"")===String(x.catalogId||""));
  return found?getName(found):"Chưa có tên cây";
}
function itemDescription(o){
  return (o.items||[]).map(x=>`${itemName(x)}${x.size||x.quyCach?" · "+(x.size||x.quyCach):""} × ${x.qty||1}`).join("; ");
}
function ensureOrderProductHeader(){
  const table=$("ordersBody").closest("table"),head=table?.querySelector("thead tr");
  if(head&&!head.querySelector('[data-products-heading]')){
    const th=document.createElement("th");th.dataset.productsHeading="1";th.textContent="Sản phẩm";
    head.insertBefore(th,head.children[4]||null);
  }
}
function renderOrders(){
  ensureOrderProductHeader();
  const q=$("orderSearch").value.trim().toLocaleLowerCase("vi"),date=$("dateFilter").value;
  const list=orders.filter(o=>{
    const hay=[o.orderNo,o.buyerName,o.buyerPhone,itemDescription(o)].join(" ").toLocaleLowerCase("vi");
    return (!date||o.orderDate===date)&&(!q||hay.includes(q));
  });
  $("ordersBody").innerHTML=list.length?list.map(o=>`<tr><td><b>${safe(o.orderNo)}</b></td><td>${safe(o.orderDate)}</td><td>${safe(o.buyerName)}</td><td>${safe(o.buyerPhone)}</td><td>${safe(itemDescription(o)||"—")}</td><td>${o.parcelCount||1}</td><td>${money(o.total)}</td><td>${safe(o.packerName)}</td><td><button class="secondary" data-print="${safe(o.id)}">In phiếu</button></td></tr>`).join(""):'<tr><td colspan="9" class="empty">Không có đơn phù hợp</td></tr>';
  $("ordersBody").querySelectorAll("[data-print]").forEach(b=>b.onclick=()=>{const o=orders.find(x=>x.id===b.dataset.print);if(o)printOrder(o);});
}
function printOrder(o){
  const pages=Array.from({length:Math.max(1,Math.min(99,Number(o.parcelCount)||1))},(_,i)=>`
  <article class="ticket">
    <header><strong>ROLL CÂY CẢNH</strong><span>ĐƠN NGOÀI</span></header>
    <div class="order-code">${safe(o.orderNo)}</div>
    <div class="line"><b>Người mua:</b> ${safe(o.buyerName)}</div>
    <div class="line"><b>Điện thoại:</b> ${safe(o.buyerPhone)}</div>
    <div class="line address"><b>Địa chỉ:</b> ${safe(o.buyerAddress)}</div>
    <div class="parcel">KIỆN ${i+1}/${o.parcelCount||1}</div>
    <div class="items">${(o.items||[]).map(x=>`<div class="item"><span><b>${safe(itemName(x))}</b>${x.size||x.quyCach?" · "+safe(x.size||x.quyCach):""} × ${x.qty||1}</span><b>${money(x.lineTotal??(Number(x.qty||1)*Number(x.price||0)))}</b></div>`).join("")}</div>
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
  .items{border-top:1px dashed #777;border-bottom:1px dashed #777;padding:1.5mm 0;margin:1mm 0;flex:0 0 auto;min-height:8mm;overflow:visible}
  .item{display:flex;align-items:flex-start;justify-content:space-between;gap:2mm;font-size:8pt;line-height:1.25;padding:1mm 0}
  .item span{flex:1;min-width:0;overflow-wrap:anywhere}.item b{white-space:nowrap;flex:0 0 auto}
  .sum,.total{display:flex;justify-content:space-between;margin:1mm 0}.total{font-size:12pt;font-weight:bold;border-top:1px solid #111;padding-top:1.5mm}
  .note{font-size:8pt;margin-top:1mm}footer{border-top:1px solid #aaa;padding-top:1mm;margin-top:2mm;text-align:center;font-size:7pt}
  @media screen{body{background:#ddd}.ticket{background:white;margin:8px auto;box-shadow:0 2px 12px #0003}}
  </style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`);
  w.document.close();
}
function openTab(tab){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  $("createTab").classList.toggle("hidden",tab!=="create");$("ordersTab").classList.toggle("hidden",tab!=="orders");
}
$("loginBtn").onclick=async()=>{try{await auth.signInWithEmailAndPassword($("email").value.trim(),$("password").value);message("loginMessage","");}catch(e){message("loginMessage",friendly(e));}};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click();});
$("logoutBtn").onclick=()=>auth.signOut();
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
$("plantSelect").onchange=updateSizeOptions;
$("sizeSelect").onchange=()=>{const p=selectedPlant(),v=selectedVariant(p,$("sizeSelect").value);if(p)$("priceInput").value=getPrice(v||p.base,$("sizeSelect").value);};
$("plantSearch").oninput=e=>renderPlantOptions(e.target.value);$("addItemBtn").onclick=addItem;
$("shippingFee").oninput=totals;$("orderForm").onsubmit=saveOrder;$("resetBtn").onclick=resetForm;
$("orderSearch").oninput=renderOrders;$("dateFilter").onchange=renderOrders;$("clearFilter").onclick=()=>{$("dateFilter").value="";$("orderSearch").value="";renderOrders();};
$("newOrderBtn").onclick=()=>openTab("create");$("orderDate").value=today();
try{initFirebase();}catch(e){message("loginMessage",e.message);}
})();