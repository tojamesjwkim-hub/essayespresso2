// ============================================================
//  shared-ui.js — helpers used by more than one page.
// ============================================================

var SITE_DEFAULTS = {
  title: "EssayEspresso",
  tagline: "A tutoring worksheet space",
  prompt: "Sign in with the Google account your tutor approved.",
  newNote: "New here? Sign in and your tutor will approve you shortly.",
  runner: "This is a version of EssayEspresso used by Jim the Tutor · Questions? tojamesjwkim@gmail.com",
  icon: "", bg: "", opacity: 90,
  parentBlurb: "If you have any questions or requests, please email tojamesjwkim@gmail.com"
};

var PASTELS = ["#c9dcf0","#eef6ef","#fdf0f5","#fbf6e9","#f3eefb","#ffffff"];

function esc(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function mkBtn(label, cls, onclick){
  var b=document.createElement("button");
  b.type="button"; b.textContent=label; if(cls) b.className=cls; if(onclick) b.onclick=onclick;
  return b;
}
function el(tag, cls, html){
  var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e;
}

// ---- background ----
function applyBackground(bg, opacity){
  var b=document.body;
  b.classList.remove("has-bgimage");
  b.style.removeProperty("--bgcolor");
  b.style.removeProperty("--bgimage");
  b.style.setProperty("--bgopacity", (opacity==null?90:opacity)/100);
  if(!bg) return;
  if(bg.charAt(0)==="#"){ b.style.setProperty("--bgcolor", bg); }
  else { b.style.setProperty("--bgimage","url('"+bg+"')"); b.classList.add("has-bgimage"); }
}

// ---- site chrome ----
function renderSiteChrome(s){
  s=Object.assign({},SITE_DEFAULTS,s||{});
  var r=s.runner||SITE_DEFAULTS.runner;
  ["runnerTop","runnerBottom"].forEach(function(id){ if($(id)) $(id).textContent=r; });
  if($("siteTitle")) $("siteTitle").textContent=s.title||SITE_DEFAULTS.title;
  if($("siteIcon") && s.icon) $("siteIcon").innerHTML='<img src="'+esc(s.icon)+'" alt="">';
}
function loadSite(){
  return siteRef.get().then(function(snap){
    var s=snap.exists?Object.assign({},SITE_DEFAULTS,snap.data()):Object.assign({},SITE_DEFAULTS);
    renderSiteChrome(s); return s;
  }).catch(function(){ renderSiteChrome(SITE_DEFAULTS); return Object.assign({},SITE_DEFAULTS); });
}

// ---- tabs ----
function wireTabs(){
  document.querySelectorAll(".tab").forEach(function(t){
    t.addEventListener("click",function(){
      document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active");});
      document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("active");});
      t.classList.add("active");
      var p=$(t.getAttribute("data-panel")); if(p) p.classList.add("active");
    });
  });
}

// ---- collapsible section helper ----
function makeCollapsible(bodyEl, btn, startOpen){
  var open = startOpen!==false;
  function paint(){ bodyEl.classList.toggle("hidden",!open); btn.textContent = open?"Collapse ▴":"Open ▾"; }
  btn.onclick=function(){ open=!open; paint(); };
  paint();
}

// ---- image shrinking (keeps uploads tiny & free) ----
function shrinkImage(file, maxDim, cb){
  maxDim=maxDim||240;
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var w=img.width,h=img.height;
      if(w>h && w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; }
      else if(h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; }
      var c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      cb(c.toDataURL("image/jpeg",0.8));
    };
    img.onerror=function(){cb(null);};
    img.src=e.target.result;
  };
  reader.onerror=function(){cb(null);};
  reader.readAsDataURL(file);
}
function wireImageUpload(btnId,fileId,targetId,maxDim){
  var btn=$(btnId),f=$(fileId),t=$(targetId);
  if(!btn||!f) return;
  btn.onclick=function(){f.click();};
  f.onchange=function(){
    if(!f.files||!f.files[0])return;
    var old=btn.textContent; btn.textContent="Shrinking…";
    shrinkImage(f.files[0],maxDim,function(d){ if(d&&t)t.value=d; btn.textContent=old; });
  };
}

function renderSwatches(containerId,targetId){
  var c=$(containerId); if(!c)return; c.innerHTML="";
  PASTELS.forEach(function(col){
    var b=mkBtn("","",function(){ $(targetId).value=col; });
    b.style.cssText="width:26px;height:26px;padding:0;margin-right:4px;background:"+col;
    c.appendChild(b);
  });
}

// ---- rich text (contenteditable + toolbar) ----
function makeRichEditor(initialHTML, placeholder){
  var wrap=el("div");
  var tb=el("div","tb");
  var box=el("div","rich");
  box.contentEditable="true";
  box.innerHTML=initialHTML||"";
  if(placeholder) box.setAttribute("data-ph",placeholder);
  function cmd(c){ return function(){ document.execCommand(c,false,null); box.focus(); }; }
  tb.appendChild(mkBtn("B","",cmd("bold")));
  tb.appendChild(mkBtn("I","",cmd("italic")));
  tb.appendChild(mkBtn("U","",cmd("underline")));
  tb.appendChild(mkBtn("• list","",cmd("insertUnorderedList")));
  tb.appendChild(mkBtn("1. list","",cmd("insertOrderedList")));
  tb.querySelectorAll("button").forEach(function(b){ b.style.fontWeight="bold"; });
  wrap.appendChild(tb); wrap.appendChild(box);
  wrap.getHTML=function(){ return box.innerHTML; };
  wrap.setHTML=function(h){ box.innerHTML=h||""; };
  wrap.setDisabled=function(d){ box.contentEditable=d?"false":"true"; box.style.background=d?"#f6f6f6":"#fff"; };
  wrap.box=box;
  return wrap;
}

// ---- drawing canvas ----
function makeCanvas(initialDataUrl, readOnly){
  var wrap=el("div");
  var tools=el("div","cvtools");
  var canvas=document.createElement("canvas");
  canvas.className="draw"; canvas.width=800; canvas.height=400;
  canvas.style.height="230px";
  var ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#000"; ctx.lineWidth=3;

  var history=[];
  function snapshot(){ try{ history.push(canvas.toDataURL()); if(history.length>20)history.shift(); }catch(e){} }

  if(initialDataUrl){
    var img=new Image();
    img.onload=function(){ ctx.drawImage(img,0,0,canvas.width,canvas.height); };
    img.src=initialDataUrl;
  }

  var drawing=false,erasing=false;
  function pos(e){
    var r=canvas.getBoundingClientRect();
    var p=(e.touches&&e.touches[0])?e.touches[0]:e;
    return { x:(p.clientX-r.left)*(canvas.width/r.width), y:(p.clientY-r.top)*(canvas.height/r.height) };
  }
  function start(e){ if(readOnly)return; e.preventDefault(); snapshot(); drawing=true;
    var p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e){ if(!drawing||readOnly)return; e.preventDefault();
    var p=pos(e); ctx.strokeStyle=erasing?"#fff":"#000"; ctx.lineTo(p.x,p.y); ctx.stroke(); }
  function end(){ drawing=false; }
  canvas.addEventListener("mousedown",start); canvas.addEventListener("mousemove",move);
  window.addEventListener("mouseup",end);
  canvas.addEventListener("touchstart",start,{passive:false});
  canvas.addEventListener("touchmove",move,{passive:false});
  canvas.addEventListener("touchend",end);

  if(!readOnly){
    tools.appendChild(document.createTextNode("Pen: "));
    var thin=mkBtn("▪ thin","",function(){ erasing=false; ctx.lineWidth=3; });
    var thick=mkBtn("▮ thick","",function(){ erasing=false; ctx.lineWidth=9; });
    var er=mkBtn("Eraser","",function(){ erasing=true; ctx.lineWidth=18; });
    var undo=mkBtn("Undo","",function(){
      var last=history.pop(); if(!last)return;
      var im=new Image(); im.onload=function(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(im,0,0); };
      im.src=last;
    });
    var clr=mkBtn("Clear","",function(){
      if(!confirm("Clear the whole drawing?"))return;
      snapshot(); ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    });
    [thin,thick,er,undo,clr].forEach(function(b){ tools.appendChild(b); });
    wrap.appendChild(tools);
  }
  wrap.appendChild(canvas);
  wrap.getData=function(){ return canvas.toDataURL("image/png"); };
  wrap.isBlank=function(){ return history.length===0 && !initialDataUrl; };
  return wrap;
}

// ---- embeds ----
function toEmbedUrl(url){
  if(!url) return "";
  var m=url.match(/(https:\/\/docs\.google\.com\/[^\/]+\/d\/[^\/]+)/);
  if(m) return m[1]+"/preview";
  var yt=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if(yt) return "https://www.youtube.com/embed/"+yt[1];
  return url;
}
// mode: "open" (always) | "collapsible" | "link"
function makeEmbed(label, url, mode){
  if(mode==="link"){
    var p=el("p"); p.style.margin="4px 0";
    p.innerHTML='<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label||url)+' ↗</a>';
    return p;
  }
  var wrap=el("div","embed");
  var head=el("div","embed-head");
  head.appendChild(el("span",null,"📄 "+esc(label||"Document")));
  var frame=document.createElement("iframe");
  frame.src=toEmbedUrl(url); frame.loading="lazy";
  if(mode==="collapsible"){
    frame.classList.add("hidden");
    var t=mkBtn("Open ▾","",function(){
      var hidden=frame.classList.toggle("hidden");
      t.textContent=hidden?"Open ▾":"Close ▴";
    });
    t.style.cssText="font-size:12px;padding:1px 7px";
    head.appendChild(t);
  } else {
    head.appendChild(el("span","muted","(always open)"));
  }
  wrap.appendChild(head); wrap.appendChild(frame);
  return wrap;
}

// ---- downloads ----
function downloadBlob(content, filename, type){
  var blob=new Blob([content],{type:type});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function downloadJSON(obj,filename){
  downloadBlob(JSON.stringify(obj,null,2),filename,"application/json");
}
function toCSV(rows){
  return rows.map(function(r){
    return r.map(function(c){
      var s=String(c==null?"":c);
      return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    }).join(",");
  }).join("\n");
}
function downloadCSV(rows,filename){ downloadBlob("\ufeff"+toCSV(rows),filename,"text/csv;charset=utf-8"); }

// strip html for CSV cells
function stripHTML(h){
  var d=document.createElement("div"); d.innerHTML=h||"";
  return (d.textContent||"").replace(/\s+/g," ").trim();
}

// error surfacing (so failures never fail silently again)
function showErr(msg, where){
  var box=$(where||"err");
  if(!box){ alert(msg); return; }
  box.textContent=msg; box.classList.remove("hidden"); box.className="err";
  setTimeout(function(){ box.classList.add("hidden"); }, 8000);
}
function handleErr(prefix){
  return function(e){ showErr(prefix+": "+(e&&e.message?e.message:e)); console.error(prefix,e); };
}
