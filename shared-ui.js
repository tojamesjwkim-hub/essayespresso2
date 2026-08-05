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
  b.style.setProperty("--bgopacity", Math.min(80,(opacity==null?80:opacity))/100);
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
  function paint(){
    bodyEl.classList.toggle("hidden",!open);
    btn.textContent = open?"Close ▴":"Open ▾";
    btn.className = open?"close":"";
  }
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
  box.setAttribute("spellcheck","true");
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


// ============================================================
//  Per-box tinting + wordlist (shared by student & teacher)
// ============================================================
var BOX_TINTS=["#ffffff","#eef6ef","#fdf0f5","#eef3fb","#fbf6e9","#f3eefb","#f7f0e8"];

// Adds a small gear to a card head that lets you tint that card.
// saveFn(color) persists it; current is the stored colour.
function ctrlsOf(headEl){
  var c=headEl.querySelector(".ctrls");
  if(!c){ c=el("div","ctrls"); headEl.appendChild(c); }
  return c;
}
function addBoxGear(headEl, cardEl, current, saveFn){
  var gear=mkBtn("⚙","boxgear");
  var bar=el("div","tintbar"); bar.classList.add("hidden");
  BOX_TINTS.forEach(function(c){
    var b=mkBtn("","sw",function(){
      cardEl.style.background=c;
      bar.classList.add("hidden");
      if(saveFn) saveFn(c);
    });
    b.style.background=c;
    bar.appendChild(b);
  });
  gear.onclick=function(){ bar.classList.toggle("hidden"); };
  ctrlsOf(headEl).appendChild(gear);
  cardEl.insertBefore(bar, cardEl.children[1]||null);
  if(current) cardEl.style.background=current;
  return gear;
}

// Wordlist panel: reference embeds on top, then Word+Definition+tags+Save on one line.
// refs = [{label,url,mode}] configured by the teacher.
function buildWordlist(container, colRef, refs, readOnly){
  container.innerHTML="";
  var sortAZ=false, search="", activeTag="", cache=[];

  // ---- reference embeds (teacher-configured) ----
  if((refs||[]).length){
    container.appendChild(el("p","muted","Reference:"));
    refs.forEach(function(r){
      if(!r.url) return;
      container.appendChild(makeEmbed(r.label||"Reference", r.url, r.mode||"collapsible"));
    });
  }

  // ---- one-line add ----
  container.appendChild(el("p","muted","Add a word:"));
  var line=el("div","wl-line");
  var wIn=document.createElement("input"); wIn.type="text"; wIn.placeholder="Word";
  wIn.style.cssText="flex:1;min-width:110px;";
  var dIn=document.createElement("input"); dIn.type="text"; dIn.placeholder="Definition";
  dIn.style.cssText="flex:2;min-width:150px;";
  var tIn=document.createElement("input"); tIn.type="text"; tIn.placeholder="tags";
  tIn.style.cssText="flex:1;min-width:80px;";
  var msg=el("span","muted");
  var saveBtn=mkBtn("Save","act",function(){
    var w=(wIn.value||"").trim();
    if(!w){ msg.textContent="Type a word first."; return; }
    colRef.add({
      word:w, definition:(dIn.value||"").trim(),
      tags:(tIn.value||"").trim().toLowerCase().split(/[\s,]+/).filter(Boolean),
      at:firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(){
      wIn.value=""; dIn.value=""; tIn.value="";
      msg.textContent="Saved ✓"; setTimeout(function(){msg.textContent="";},1400);
      load();
    }).catch(function(e){ msg.textContent="Could not save: "+e.message; });
  });
  if(readOnly) saveBtn.disabled=true;
  line.appendChild(wIn); line.appendChild(dIn); line.appendChild(tIn); line.appendChild(saveBtn);
  container.appendChild(line);
  container.appendChild(msg);

  // ---- search / sort ----
  var bar=el("div","filterbar"); bar.style.marginTop="10px";
  var sIn=document.createElement("input"); sIn.type="text";
  sIn.placeholder="Search word, definition or tag…"; sIn.style.cssText="flex:1;min-width:150px;";
  sIn.oninput=function(){ search=sIn.value.toLowerCase(); render(); };
  bar.appendChild(sIn);
  var sortBtn=mkBtn("Sort A–Z","",function(){
    sortAZ=!sortAZ; sortBtn.textContent=sortAZ?"Newest first":"Sort A–Z"; render();
  });
  bar.appendChild(sortBtn);
  bar.appendChild(mkBtn("⟳","",function(){ load(); }));
  container.appendChild(bar);

  var chipBar=el("div"); chipBar.style.marginBottom="6px";
  container.appendChild(chipBar);
  var listBox=el("div");
  container.appendChild(listBox);

  function renderChips(){
    var set={};
    cache.forEach(function(r){ (r.tags||[]).forEach(function(t){ set[t]=1; }); });
    var tags=Object.keys(set).sort();
    chipBar.innerHTML="";
    if(!tags.length) return;
    chipBar.appendChild(el("span","muted","tags: "));
    tags.forEach(function(t){
      var chip=el("span","tag"+(activeTag===t?" on":""),esc(t));
      chip.onclick=function(){ activeTag=(activeTag===t?"":t); render(); };
      chipBar.appendChild(chip);
    });
  }

  function matches(r){
    if(activeTag && (r.tags||[]).indexOf(activeTag)<0) return false;
    if(!search) return true;
    return ((r.word||"")+" "+(r.definition||"")+" "+(r.tags||[]).join(" "))
      .toLowerCase().indexOf(search)>=0;
  }

  function render(){
    renderChips();
    var rows=cache.filter(matches);
    if(sortAZ) rows.sort(function(a,b){
      return (a.word||"").toLowerCase().localeCompare((b.word||"").toLowerCase()); });
    else rows.sort(function(a,b){
      var x=a.at&&a.at.toMillis?a.at.toMillis():0, y=b.at&&b.at.toMillis?b.at.toMillis():0; return y-x; });
    listBox.innerHTML="";
    if(!rows.length){ listBox.innerHTML='<p class="muted">No words yet.</p>'; return; }
    rows.forEach(function(r){
      var row=el("div","wl-row");
      var top=el("div");
      top.style.cssText="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;";
      var txt=el("div");
      txt.innerHTML='<span class="wl-word">'+esc(r.word)+'</span>'+
        (r.definition?' — '+esc(r.definition):'')+' ';
      (r.tags||[]).forEach(function(t){ txt.appendChild(el("span","tag",esc(t))); });
      top.appendChild(txt);
      if(!readOnly){
        top.appendChild(mkBtn("✕","del",function(){
          if(confirm('Delete "'+r.word+'"?')) colRef.doc(r.id).delete().then(load);
        }));
      }
      row.appendChild(top);
      listBox.appendChild(row);
    });
  }

  function load(){
    colRef.limit(500).get().then(function(snap){
      cache=[]; snap.forEach(function(d){ cache.push(Object.assign({id:d.id},d.data())); });
      render();
    }).catch(function(){ listBox.innerHTML='<p class="muted">Could not load wordlist.</p>'; });
  }
  load();
  return {reload:load};
}
