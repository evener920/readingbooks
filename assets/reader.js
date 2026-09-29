/* 引导式阅读（读书库 readingbooks 版，配套双栏书页）
   两种模式：
     • 逐句填色推进（sent）：当前句淡朱砂底 + 波浪下划线（CSS Custom Highlight，零 DOM 改动）
     • 波浪逐字浮现（wave）：分块激活，只读当前块，波峰放大当前字（浮层，性能稳）
   控制：播放/暂停、上/下一句、速度(wpm)、聚光(非当前块淡出)、模式切换、起点、大纲、退出
   进度保护：进入即 GRD_LOCK，期间不写书签/不上云；退出弹询问条。
   由书页 </body> 前注入；只增强 .book-text（左栏正文），右栏 .pane-notes 被排除。 */
(function(){
  "use strict";

  var FONT = '"京华老宋体","Songti SC","STSong","SimSun",serif';
  // 只认左栏正文容器；不要 .wrap（书页有 .wrap 居中容器），避免抓到全页
  var READ_SEL = "article,[data-reader],.book-text,.content,.post-content,main,.reader";
  // 排除：工具栏/浮层/笔记右栏/脚本样式
  var SKIP = ".reader-toolbar,.reader-progress,.reader-outline,.reader-exit,.pane-notes,#portal-links,.portal-links,.r-wave,script,style";
  var BLOCK_SEL = "p,li,blockquote,h1,h2,h3,h4,h5,h6,section,article,td,pre,div";
  var SENT_RE = /[^。！？!?；;\n]+[。！？!?；;]?/g;

  var readArea=null, blocks=[], sentences=[], cur=-1, waveOff=0,
      playing=false, mode='sent', timer=null, wpm=260, spot=false,
      hlMode=false, picking=false, grdLock=false, bmBefore=null,
      explicitStart=false, activeBlock=-1,
      playBtn=null, progEl=null, wpmEl=null, modeBtn=null,
      exitEl=null, outlineEl=null, waveChars=null, overlays=[];

  function $(s,r){ return (r||document).querySelector(s); }
  function $all(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function init(){
    readArea = $(READ_SEL) || document.body;
    if(!readArea){ console.warn("[reader] 未找到阅读区，已跳过"); return; }
    if(readArea===document.body) console.info("[reader] 未识别语义容器，已回退到 body 全文本");
    readArea.style.fontFamily = FONT;
    if(window.CSS && CSS.highlights){ CSS.highlights.set('sentence', new Highlight()); }
    buildDom(); bind();
    try{ var s=localStorage.getItem(key()); if(s){ cur=(JSON.parse(s).idx)||0; } }catch(e){}
  }

  function key(){ var m=document.querySelector('meta[name=slug]');
    return 'reader:'+(m?m.content:location.pathname); }
  function save(){ if(grdLock) return; try{ localStorage.setItem(key(), JSON.stringify({idx:cur})); }catch(e){} }

  function buildBlocks(){
    if(blocks.length) return;
    var cand = $all(BLOCK_SEL, readArea);
    var res=[];
    cand.forEach(function(el){
      if(!el.textContent || !el.textContent.trim()) return;
      res.push(el);
    });
    blocks = res;
  }

  function buildSentences(){
    if(sentences.length) return;
    buildBlocks();
    for(var bi=0; bi<blocks.length; bi++){
      var b=blocks[bi];
      var w=document.createTreeWalker(b, NodeFilter.SHOW_TEXT, {
        acceptNode:function(n){
          if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var p=n.parentElement;
          while(p && p!==b){
            if(p.matches && p.matches(SKIP)) return NodeFilter.FILTER_REJECT;
            if(/SCRIPT|STYLE/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
            p=p.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        }});
      var ns=[]; while(w.nextNode()) ns.push(w.currentNode);
      var ch=0;
      for(var i=0;i<ns.length;i++){
        var v=ns[i].nodeValue; SENT_RE.lastIndex=0; var m;
        while((m=SENT_RE.exec(v))!==null){
          if(m[0].trim().length<1) continue;
          var r=document.createRange();
          r.setStart(ns[i], m.index); r.setEnd(ns[i], m.index+m[0].length);
          sentences.push({block:bi, range:r, bStart:ch, bLen:m[0].length, text:m[0]});
          ch += m[0].length;
        }
      }
    }
  }

  function getBlockChars(bi){
    if(blockCharsCache[bi]) return blockCharsCache[bi];
    var b=blocks[bi], w=document.createTreeWalker(b, NodeFilter.SHOW_TEXT, {
      acceptNode:function(n){
        if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p=n.parentElement;
        while(p && p!==b){
          if(p.matches && p.matches(SKIP)) return NodeFilter.FILTER_REJECT;
          if(/SCRIPT|STYLE/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
          p=p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }});
    var arr=[], node;
    while((node=w.nextNode())){
      var v=node.nodeValue;
      for(var j=0;j<v.length;j++) arr.push({node:node, off:j});
    }
    blockCharsCache[bi]=arr;
    return arr;
  }
  var blockCharsCache={};

  function highlightSentence(i){
    if(!(window.CSS && CSS.highlights)) return;
    var h=CSS.highlights.get('sentence'); if(!h) return;
    h.clear();
    if(i>=0 && i<sentences.length){ try{ h.add(sentences[i].range); }catch(e){} }
  }

  function charRect(node, off){
    if(!node) return null;
    var r=document.createRange();
    try{ r.setStart(node, off); r.setEnd(node, off+1); }
    catch(e){ return null; }
    return r.getBoundingClientRect();
  }
  function placeWave(el, info, scale, color){
    if(!info || !info.width){ el.style.display='none'; return; }
    var fs=parseFloat(getComputedStyle(readArea).fontSize)*scale;
    el.style.display='block';
    el.style.left=info.left+'px'; el.style.top=info.top+'px';
    el.style.width=info.width+'px'; el.style.height=info.height+'px';
    el.style.fontSize=fs+'px'; el.style.lineHeight=info.height+'px';
    el.style.color=color; el.textContent = info.ch;
  }
  function renderWave(){
    var s=sentences[cur]; if(!s) return;
    if(activeBlock!==s.block){ waveChars=getBlockChars(s.block); activeBlock=s.block; }
    var g = s.bStart + waveOff;
    var c = waveChars[g]; if(!c) return;
    var info = charRect(c.node, c.off); if(!info) return;
    info.ch = c.node.nodeValue.charAt(c.off);
    placeWave(overlays[2], info, 1.70, '#9c4a3c');
    var a1=waveChars[g-1], a2=waveChars[g-2], b1=waveChars[g+1], b2=waveChars[g+2];
    placeWave(overlays[1], a1?Object.assign(charRect(a1.node,a1.off),{ch:a1.node.nodeValue.charAt(a1.off)}):null, 1.30, '#a8823c');
    placeWave(overlays[0], a2?Object.assign(charRect(a2.node,a2.off),{ch:a2.node.nodeValue.charAt(a2.off)}):null, 1.12, '#6b6257');
    placeWave(overlays[3], b1?Object.assign(charRect(b1.node,b1.off),{ch:b1.node.nodeValue.charAt(b1.off)}):null, 1.30, '#a8823c');
    placeWave(overlays[4], b2?Object.assign(charRect(b2.node,b2.off),{ch:b2.node.nodeValue.charAt(b2.off)}):null, 1.12, '#6b6257');
  }
  function hideWave(){ overlays.forEach(function(e){ e.style.display='none'; }); }

  function updateSpot(){
    if(!spot){ blocks.forEach(function(b){ b.classList.remove('dimmed'); }); return; }
    var cb = sentences[cur] ? blocks[sentences[cur].block] : null;
    if(!cb){ return; }
    blocks.forEach(function(b){
      var lit = (b===cb) || b.contains(cb) || cb.contains(b);
      if(lit) b.classList.remove('dimmed'); else b.classList.add('dimmed');
    });
  }

  function show(i, doScroll){
    cur=i;
    if(mode==='sent'){ highlightSentence(cur); hideWave(); }
    else { highlightSentence(-1); renderWave(); }
    if(progEl){ progEl.max = Math.max(1, sentences.length-1); progEl.value = (cur<0?0:cur); }
    updateSpot();
    save();
    if(guidedScroll && doScroll && playing){
      var rc = (mode==='wave')
        ? charRect(waveChars[(sentences[cur].bStart+waveOff)] ? waveChars[sentences[cur].bStart+waveOff].node : null, waveChars[sentences[cur].bStart+waveOff] ? waveChars[sentences[cur].bStart+waveOff].off : 0)
        : (sentences[cur] ? rectOf(sentences[cur].range) : null);
      if(rc){
        var pane = scrollContainer();
        if(pane && pane!==window){
          if(rc.top<window.innerHeight*0.20 || rc.top>window.innerHeight*0.80){
            pane.scrollTo({ top: pane.scrollTop + (rc.top - window.innerHeight*0.42), behavior:'smooth' });
          }
        } else {
          var vh=window.innerHeight;
          if(rc.top<vh*0.20 || rc.top>vh*0.80){
            window.scrollTo({ top: window.scrollY + (rc.top - vh*0.42), behavior:'smooth' });
          }
        }
      }
    }
  }
  function rectOf(r){ try{ return r.getBoundingClientRect(); }catch(e){ return null; } }
  // 引导滚动的容器：优先正文所在的可滚动左栏，否则 window
  function scrollContainer(){
    if(readArea){
      var el = readArea.closest && readArea.closest('.pane-text');
      if(el && el.scrollHeight>el.clientHeight) return el;
      if(readArea.scrollHeight>readArea.clientHeight) return readArea;
    }
    return window;
  }

  function advance(){
    if(mode==='sent'){
      cur++; waveOff=0;
      if(cur>=sentences.length){ stop(); return; }
    } else {
      waveOff++;
      var s=sentences[cur];
      if(waveOff >= s.bLen){
        cur++; waveOff=0;
        if(cur>=sentences.length){ stop(); return; }
      }
    }
  }
  function delay(){
    if(mode==='sent'){
      var n = sentences[cur] ? sentences[cur].bLen : 6;
      return clamp(n * (60000/wpm), 130, 4500);
    } else {
      return clamp(60000/wpm, 45, 700);
    }
  }
  function loop(){
    if(!playing) return;
    advance();
    if(!playing) return;
    show(cur, true);
    timer = setTimeout(loop, delay());
  }

  function startSession(){
    if(!grdLock){ grdLock=true; bmBefore = cur; }
  }
  function play(){
    buildSentences(); if(!sentences.length) return;
    startSession();
    if(!explicitStart && (cur<0 || cur>=sentences.length)){
      cur = viewportCenterSentence();
    }
    if(cur<0) cur=0;
    if(cur>=sentences.length) cur=sentences.length-1;
    playing=true; playBtn.textContent='⏸';
    show(cur, true);
    clearTimeout(timer); loop();
  }
  function pause(){ playing=false; if(playBtn) playBtn.textContent='▶'; clearTimeout(timer); save(); }
  function stop(){
    playing=false; if(playBtn) playBtn.textContent='▶'; clearTimeout(timer);
    highlightSentence(-1); hideWave();
    blocks.forEach(function(b){ b.classList.remove('dimmed'); });
  }
  function step(d){ buildSentences(); cur=clamp(cur+d, 0, sentences.length-1); waveOff=0; explicitStart=true; show(cur, false); }

  function viewportCenterSentence(){
    var cy=window.innerHeight/2, best=-1, bestD=1e9;
    for(var i=0;i<sentences.length;i++){
      var r=rectOf(sentences[i].range); if(!r) continue;
      var c=r.top+r.height/2, d=Math.abs(c-cy);
      if(d<bestD){ bestD=d; best=i; }
    }
    return best;
  }

  function togglePicking(){
    picking=!picking;
    document.body.style.cursor = picking ? 'crosshair' : '';
    if(pickTip) pickTip.style.display = picking ? 'block' : 'none';
  }
  function pickAt(y){
    var best=-1, bestD=1e9;
    for(var i=0;i<sentences.length;i++){
      var r=rectOf(sentences[i].range); if(!r) continue;
      var d=Math.abs((r.top+r.height/2)-y);
      if(d<bestD){ bestD=d; best=i; }
    }
    return best;
  }

  function buildOutline(){
    var hs=$all('h1,h2,h3', readArea).filter(function(h){
      return h.textContent && h.textContent.trim().length>0 && !(h.matches&&h.matches(SKIP));
    });
    if(!hs.length){ return null; }
    var items = hs.map(function(h){
      var first = sentenceAfter(h);
      return { title:h.textContent.trim().slice(0,40), idx:first };
    });
    return items;
  }
  function sentenceAfter(el){
    for(var i=0;i<sentences.length;i++){
      var sn=sentences[i].range.startContainer;
      if(sn && el.compareDocumentPosition(sn) & Node.DOCUMENT_POSITION_FOLLOWING){ return i; }
    }
    return 0;
  }

  function exitGuard(){
    if(!grdLock){ stop(); return; }
    if(!exitEl){
      exitEl=document.createElement('div'); exitEl.className='reader-exit';
      exitEl.innerHTML='<div class="re-title">退出引导阅读，进度如何处理？</div>'+
        '<div class="re-btns">'+
        '<button data-a="reset">回到原书签</button>'+
        '<button data-a="save">存为书签</button>'+
        '<button data-a="none">都不动</button></div>';
      document.body.appendChild(exitEl);
      exitEl.addEventListener('click', function(e){
        var a=e.target.getAttribute('data-a'); if(!a) return;
        if(a==='reset'){ stop(); cur=bmBefore==null?0:bmBefore; highlightSentence(-1); }
        else if(a==='save'){ stop(); save(); }
        else { stop(); }
        grdLock=false; exitEl.style.display='none';
      });
    }
    exitEl.style.display='flex';
  }

  var pickTip=null;
  function buildDom(){
    var tb=document.createElement('div'); tb.className='reader-toolbar';
    tb.innerHTML =
      '<button id="r-play" title="播放/暂停（空格）">▶</button>'+
      '<button id="r-prev" title="上一句（←）">⏮</button>'+
      '<button id="r-next" title="下一句（→）">⏭</button>'+
      '<span class="lab">速度</span><input id="r-wpm" type="range" min="80" max="600" step="10" value="'+wpm+'" title="阅读速度 wpm">'+
      '<span id="r-wpmv" class="wpmv">'+wpm+'</span>'+
      '<button id="r-mode" title="逐句 ⇄ 波浪">逐句</button>'+
      '<button id="r-spot" title="聚光模式（非当前段淡出）">聚光</button>'+
      '<button id="r-start" title="选起点（S）">起点</button>'+
      '<button id="r-outline" title="章节大纲">大纲</button>'+
      '<button id="r-exit" title="退出引导（进度保护）">✕</button>';
    document.body.appendChild(tb);
    playBtn=$('#r-play',tb);
    modeBtn=$('#r-mode',tb); wpmEl=$('#r-wpmv',tb);
    $('#r-prev',tb).addEventListener('click', function(){ if(playing) pause(); step(-1); });
    $('#r-next',tb).addEventListener('click', function(){ if(playing) pause(); step(1); });
    $('#r-wpm',tb).addEventListener('input', function(e){ wpm=+e.target.value; if(wpmEl) wpmEl.textContent=wpm; if(playing) restart(); });
    modeBtn.addEventListener('click', function(){
      mode = (mode==='sent')?'wave':'sent'; modeBtn.textContent=(mode==='sent')?'逐句':'波浪';
      waveOff=0; overlays.length && (activeBlock=-1); show(cur, false);
    });
    $('#r-spot',tb).addEventListener('click', function(e){ spot=!spot; e.target.classList.toggle('on',spot); updateSpot(); });
    $('#r-start',tb).addEventListener('click', function(){ buildSentences(); startSession(); togglePicking(); });
    $('#r-outline',tb).addEventListener('click', function(){ toggleOutline(); });
    $('#r-exit',tb).addEventListener('click', function(){ exitGuard(); });
    playBtn.addEventListener('click', function(){ playing?pause():play(); });

    var pr=document.createElement('div'); pr.className='reader-progress';
    pr.innerHTML='<input id="r-prog" type="range" min="0" max="1" value="0" step="1">';
    document.body.appendChild(pr); progEl=$('#r-prog',pr);
    progEl.addEventListener('input', function(e){
      buildSentences(); explicitStart=true; startSession();
      cur=clamp(+e.target.value,0,sentences.length-1); waveOff=0;
      show(cur, false);
    });

    pickTip=document.createElement('div'); pickTip.className='reader-picktip';
    pickTip.textContent='点选任意段落作为起点（再按 S 取消）'; pickTip.style.display='none';
    document.body.appendChild(pickTip);

    for(var i=0;i<5;i++){ var e=document.createElement('div'); e.className='r-wave'; e.style.display='none'; document.body.appendChild(e); overlays.push(e); }

    var st=document.createElement('style');
    st.textContent='::highlight(reader){background:rgba(168,57,43,.20);border-radius:3px;}';
    document.head.appendChild(st);
  }

  function restart(){ clearTimeout(timer); if(playing) loop(); }

  function toggleOutline(){
    if(!outlineEl){
      outlineEl=document.createElement('div'); outlineEl.className='reader-outline';
      document.body.appendChild(outlineEl);
      outlineEl.addEventListener('click', function(e){
        if(e.target===outlineEl){ outlineEl.style.display='none'; return; }
        var idx=+e.target.getAttribute('data-idx'); if(isNaN(idx)) return;
        buildSentences(); explicitStart=true; startSession();
        cur=clamp(idx,0,sentences.length-1); waveOff=0; outlineEl.style.display='none';
        show(cur,false); if(!playing) play();
      });
    }
    var items=buildOutline();
    if(!items){ outlineEl.innerHTML='<div class="ol-empty">本页未识别到章节标题（h1–h3）</div>'; outlineEl.style.display='flex'; return; }
    outlineEl.innerHTML='<div class="ol-title">从章节开始引导</div>'+ items.map(function(it){
      return '<button class="ol-item" data-idx="'+(it.idx==null?0:it.idx)+'">'+it.title+'</button>';
    }).join('');
    outlineEl.style.display='flex';
  }

  function bind(){
    document.addEventListener('mouseup', function(){ if(hlMode) applyHL(); });
    document.addEventListener('keydown', function(e){
      if(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if(picking){
        if(e.code==='KeyS'){ e.preventDefault(); togglePicking(); }
        return;
      }
      if(e.code==='Space'){ e.preventDefault(); playing?pause():play(); }
      else if(e.code==='ArrowRight'){ e.preventDefault(); if(playing)pause(); step(1); }
      else if(e.code==='ArrowLeft'){ e.preventDefault(); if(playing)pause(); step(-1); }
      else if(e.code==='KeyS'){ e.preventDefault(); buildSentences(); startSession(); togglePicking(); }
    });
    document.addEventListener('click', function(e){
      if(picking && !e.target.closest('.reader-toolbar') && !e.target.closest('.reader-picktip')){
        var idx=pickAt(e.clientY);
        if(idx>=0){ explicitStart=true; startSession(); cur=idx; waveOff=0; togglePicking(); show(cur,false); if(!playing) play(); }
      }
    });
  }

  function applyHL(){
    var sel=window.getSelection();
    if(!sel || sel.isCollapsed || !sel.rangeCount) return;
    if(window.CSS && CSS.highlights){
      if(!CSS.highlights.get('reader')) CSS.highlights.set('reader', new Highlight());
      try{ CSS.highlights.get('reader').add(sel.getRangeAt(0)); }catch(e){}
    } else { try{ document.execCommand('hiliteColor', false, 'rgba(168,57,43,.25)'); }catch(e){} }
    sel.removeAllRanges();
  }

  var guidedScroll = true;

  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
