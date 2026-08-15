/* ---------- tiny DOM helpers ---------- */
function $(id){ return document.getElementById(id); }
function el(tag,cls,txt){ var e=document.createElement(tag); if(cls)e.className=cls;
  if(txt!==undefined&&txt!==null)e.textContent=txt; return e; }
function mkBtn(label,cls,fn){ var b=el("button",cls||"",label); if(fn)b.onclick=fn; return b; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function clear(n){ while(n && n.firstChild) n.removeChild(n.firstChild); }
function show(n,yes){ if(n) n.classList.toggle("hidden", !yes); }
function flash(node,msg,ms){ if(!node)return; node.textContent=msg;
  setTimeout(function(){ if(node.textContent===msg) node.textContent=""; }, ms||1800); }
function errBox(msg){ var d=el("div","err",msg); return d; }

/* ---------- Pacific-time day key ---------- */
function ptDayKey(d){
  d = d || new Date();
  var s = d.toLocaleDateString("en-CA",{timeZone:"America/Los_Angeles"}); // YYYY-MM-DD
  return s;
}
function ptStamp(ts){
  var d = ts && ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date());
  return d.toLocaleString("en-US",{timeZone:"America/Los_Angeles",
    month:"numeric",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}) + " PT";
}
function daysBetweenKeys(a,b){
  if(!a||!b) return 999;
  var da=new Date(a+"T12:00:00Z"), dbb=new Date(b+"T12:00:00Z");
  return Math.round((dbb-da)/86400000);
}

/* ---------- seeded RNG (options fixed per day) ---------- */
function seedNum(str){
  var h=2166136261;
  for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0);
}
function rand01(key){ 
  var h=seedNum(key);
  h ^= h>>>15; h = Math.imul(h,2246822507); h ^= h>>>13;
  return (h>>>0)/4294967296;
}

/* ---------- rich text editor ---------- */
function richBox(initial, placeholder){
  var wrap=el("div");
  var tb=el("div","tb");
  [["B","bold"],["I","italic"],["U","underline"]].forEach(function(p){
    var b=mkBtn(p[0],"",function(e){ e.preventDefault(); document.execCommand(p[1],false,null); box.focus(); });
    b.onmousedown=function(e){ e.preventDefault(); };
    if(p[1]==="bold") b.innerHTML="<strong>B</strong>";
    if(p[1]==="italic") b.innerHTML="<em>I</em>";
    if(p[1]==="underline") b.innerHTML="<u>U</u>";
    tb.appendChild(b);
  });
  var box=el("div","rich");
  box.contentEditable="true";
  box.setAttribute("spellcheck","true");
  if(placeholder) box.setAttribute("data-ph",placeholder);
  box.innerHTML = initial || "";
  wrap.appendChild(tb); wrap.appendChild(box);
  wrap.getValue=function(){ return box.innerHTML; };
  wrap.setValue=function(v){ box.innerHTML=v||""; };
  wrap.box=box;
  return wrap;
}

/* ---------- embeds ---------- */
function toEmbedUrl(url){
  if(!url) return "";
  var m = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
  if(m) return "https://docs.google.com/"+m[1]+"/d/"+m[2]+"/preview";
  m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if(m) return "https://www.youtube.com/embed/"+m[1];
  return url;
}
function makeFrame(label,url,mode){
  var w=el("div","frame");
  var h=el("div","frameh");
  h.appendChild(el("span",null,"📄 "+(label||"Reference")));
  var body=el("div");
  var f=document.createElement("iframe");
  f.setAttribute("loading","lazy");
  f.src = toEmbedUrl(url);
  body.appendChild(f);
  if(mode==="open"){
    h.appendChild(el("span","muted","(always open)"));
  } else {
    body.classList.add("hidden");
    var t=mkBtn("Open ▾","",function(){
      var hid=body.classList.toggle("hidden");
      t.textContent = hid ? "Open ▾" : "Close ▴";
      t.className = hid ? "" : "close";
    });
    h.appendChild(t);
  }
  w.appendChild(h); w.appendChild(body);
  return w;
}

/* ---------- Google Sheet word sources ---------- */
var SHEET_CACHE = {};
function loadSheet(url){
  if(SHEET_CACHE[url]) return Promise.resolve(SHEET_CACHE[url]);
  return fetch(url).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.text();
  }).then(function(txt){
    var rows = parseCSV(txt);
    SHEET_CACHE[url]=rows;
    return rows;
  });
}
function parseCSV(text){
  var rows=[],row=[],cur="",q=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; }
      else cur+=c;
    } else {
      if(c==='"') q=true;
      else if(c===","){ row.push(cur); cur=""; }
      else if(c==="\n"){ row.push(cur); rows.push(row); row=[]; cur=""; }
      else if(c!=="\r") cur+=c;
    }
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(c){return c.trim()!=="";}); });
}
function colIndex(letter){
  letter=(letter||"A").toUpperCase().replace(/[^A-Z]/g,"")||"A";
  var n=0; for(var i=0;i<letter.length;i++) n=n*26+(letter.charCodeAt(i)-64);
  return n-1;
}

/* ---------- token substitution ----------
   sources: [{name,url,cols:[{letter,name}]}]
   picks:  {sourceName: rowIndex}  (same row reused across tokens of one source)
   returns {text, picks, values:{ "src.col": value }}
*/
function fillTokens(text, sources, seedKey, usedMap){
  var out = { text:text||"", picks:{}, values:{} };
  if(!text) return Promise.resolve(out);
  var names = (sources||[]).map(function(s){return s.name;});
  var need = {};
  (text.match(/\{([^}]+)\}/g)||[]).forEach(function(tok){
    var inner = tok.slice(1,-1);
    var parts = inner.split(".");
    if(parts.length===2 && names.indexOf(parts[0])>=0) need[parts[0]]=true;
  });
  var list = Object.keys(need);
  if(!list.length) return Promise.resolve(out);

  return Promise.all(list.map(function(nm){
    var src=null; sources.forEach(function(s){ if(s.name===nm) src=s; });
    return loadSheet(src.url).then(function(rows){
      var body = rows.length>1 ? rows.slice(1) : rows;  // skip header row
      var used = (usedMap && usedMap[nm]) || [];
      var pool = body.map(function(_,i){ return i; }).filter(function(i){ return used.indexOf(i)<0; });
      if(!pool.length) pool = body.map(function(_,i){ return i; });
      var idx = pool[Math.floor(rand01(seedKey+"|"+nm) * pool.length)];
      out.picks[nm] = idx;
      (src.cols||[]).forEach(function(c){
        out.values[nm+"."+c.name] = (body[idx]||[])[colIndex(c.letter)] || "";
      });
    }).catch(function(){ /* sheet unreachable: leave tokens as-is */ });
  })).then(function(){
    out.text = out.text.replace(/\{([^}]+)\}/g, function(m,inner){
      return out.values[inner] !== undefined ? out.values[inner] : m;
    });
    return out;
  });
}

/* ---------- image helper ---------- */
function picNode(url, alt){
  var s=el("span","pic");
  if(url){ var i=document.createElement("img"); i.src=url; i.alt=alt||""; s.appendChild(i); }
  else s.textContent = alt ? ("["+alt+"]") : "·";
  return s;
}
function shrinkImage(file, max, cb){
  var r=new FileReader();
  r.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var w=img.width,h=img.height,m=max||900;
      if(w>m||h>m){ if(w>h){h=Math.round(h*m/w);w=m;} else {w=Math.round(w*m/h);h=m;} }
      var c=document.createElement("canvas"); c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      cb(c.toDataURL("image/jpeg",0.8));
    };
    img.src=e.target.result;
  };
  r.readAsDataURL(file);
}

/* ---------- local (guest) storage ---------- */
var LS = {
  get:function(k,d){ try{ var v=localStorage.getItem("ee_"+k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set:function(k,v){ try{ localStorage.setItem("ee_"+k, JSON.stringify(v)); }catch(e){} },
  del:function(k){ try{ localStorage.removeItem("ee_"+k); }catch(e){} }
};

/* ---------- modal ---------- */
function showModal(html, buttons){
  var m=$("modal"), b=$("modalBody");
  if(!m){ m=el("div","modal"); m.id="modal"; b=el("div","modalbox"); b.id="modalBody";
    m.appendChild(b); document.body.appendChild(m); }
  clear(b);
  var d=el("div"); d.innerHTML=html; b.appendChild(d);
  var bar=el("div"); bar.style.cssText="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;";
  (buttons||[]).forEach(function(cfg){
    bar.appendChild(mkBtn(cfg.label,cfg.cls||"",function(){ if(cfg.fn) cfg.fn(); }));
  });
  b.appendChild(bar);
  m.classList.add("on");
}
function hideModal(){ var m=$("modal"); if(m) m.classList.remove("on"); }
