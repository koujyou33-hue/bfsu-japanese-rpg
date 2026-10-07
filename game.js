'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sessions = {};
let state = null, travelToken = 0, toastTimer, dialogueTimer;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const typeNames={choice:'对话 / 判断',spell:'单词拼写',match:'标签配对',order:'句卡整理',multi:'物品选择',listen:'语音留言'};
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3600);}
function campaign(){return CAMPAIGNS[state.campaign];}
function quest(){return campaign().quests[state.quest];}
function task(){return quest().tasks[state.steps[state.quest]];}
function record(q=task()){return state.records[q.id]??(state.records[q.id]={attempts:0,wrong:0,solved:false,hint:false,transcript:false,order:[],selected:[],pairs:[],pairLeft:null,spell:'',message:''});}
function done(){return state.steps.filter(n=>n===3).length;}
function solvedCount(){return Object.values(state.records).filter(r=>r.solved).length;}
function canVisit(i){return i<5 || state.steps.slice(0,5).every(n=>n===3);}
function show(name){clearTimeout(dialogueTimer);for(const id of ['map','scene','notebook','ending'])$('#'+id+'View').hidden=id!==name;state.view=name;}
function startAdventure(id){
 if(!Object.hasOwn(CAMPAIGNS,id))throw Error('请选择 mid 或 final。');
 cancelSpeech();travelToken++;
 state=sessions[id]??(sessions[id]={campaign:id,quest:0,steps:[0,0,0,0,0,0],records:{},view:'map',position:[13,58],elapsed:0,lastTick:Date.now(),writing:'',checked:[],writingSaved:false});
 state.lastTick=Date.now();$('#welcome').hidden=true;$('#play').hidden=false;$('#homeBtn').hidden=false;
 $('#chapterLabel').textContent=campaign().label;$('#chapterTitle').textContent=campaign().title;
 $('#playerRole').textContent=id==='mid'?'新生活探索中':'文化交流日志愿者';renderSidebar();done()===6?renderEnding():renderMap();return status();
}
function goHome(){if(!state)return;tick();cancelSpeech();travelToken++;state=null;$('#welcome').hidden=false;$('#play').hidden=true;$('#homeBtn').hidden=true;$('#clock').textContent='日语 1 · 课堂冒险';}
function tick(){if(state&&!document.hidden){const now=Date.now();if(done()<6)state.elapsed+=Math.min(now-state.lastTick,2000);state.lastTick=now;$('#clock').textContent='探索用时 '+formatTime(state.elapsed);}else if(state){state.lastTick=Date.now();}}
function formatTime(ms){return `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;}
setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(state)state.lastTick=Date.now();});
function renderSidebar(){
 const c=campaign();$('#progressText').textContent=`已完成 ${solvedCount()} / 18 个互动任务`;$('#progress').value=solvedCount();$('#stampCount').textContent=`${done()} / 6`;
 $('#questList').innerHTML=c.quests.map((q,i)=>`<button class="quest ${i===state.quest?'active':''} ${state.steps[i]===3?'done':''}" data-quest="${i}"><span class="num">${state.steps[i]===3?'✓':i+1}</span><span>${esc(PLACES[q.place].name)}<small>${!canVisit(i)?'集齐前五件物品后开启':esc(q.title)}</small></span></button>`).join('');
 $('#questList').querySelectorAll('button').forEach(b=>b.onclick=()=>visit(Number(b.dataset.quest)));
 $('#inventory').innerHTML='<span class="inventory-chip">东院地图</span>'+c.quests.filter((_,i)=>state.steps[i]===3).map(q=>`<span class="inventory-chip">✓ ${esc(q.reward)}</span>`).join('');
}
function renderMap(){
 travelToken++;cancelSpeech();show('map');const c=campaign();const next=c.quests.findIndex((_,i)=>state.steps[i]<3);const n=Math.max(0,next);const pin=c.quests[n];
 $('#mapView').innerHTML=`<div class="map-top"><div><span class="eyebrow">CAMPUS EXPLORER / 点击地点前往</span><h2>${done()===0?'从这里，认识北外。':'你的下一站，在哪里？'}</h2><p>${esc(done()===0?c.intro:'前五站可自由选择顺序；完成各站三个任务，获得一件线索。最后在文化广场重聚。')}</p></div><button class="primary" id="nextPlace">前往${esc(PLACES[pin.place].name)} ↗</button></div><div class="map-board"><img src="assets/east-campus-map.png" alt="北外东院示意图，点击地点进入探索"><span class="map-correction">小碧池</span><div class="map-player avatar p0" style="left:${state.position[0]}%;top:${state.position[1]}%" aria-label="佐藤悠当前位置"></div>${c.quests.map((q,i)=>{const p=PLACES[q.place];return `<button class="map-pin ${i===n?'current':''}" style="left:${p.x}%;top:${p.y}%" data-pin="${i}"><b>${state.steps[i]===3?'✓':!canVisit(i)?'⌑':i+1}</b>${esc(p.name)}</button>`}).join('')}</div><div class="map-caption"><span>地图来源：教师提供 · 保留原图地理关系</span><span>前五站自由探索 → 文化广场终章</span></div>`;
 $('#nextPlace').onclick=()=>visit(n);$('#mapView').querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>visit(Number(b.dataset.pin)));
}
async function visit(i){
 if(!state||!Number.isInteger(i)||i<0||i>5)throw Error('地点编号应为 0—5。');
 if(!canVisit(i)){toast('还缺少线索。先完成前五站，再到文化广场集合。');return {ok:false,reason:'finale_locked'};}
 if(done()===6){renderEnding();return status();}
 const token=++travelToken;cancelSpeech();state.quest=i;renderSidebar();
 const p=PLACES[quest().place];if(state.view==='map')await walkMap(p,token);
 if(token!==travelToken||!state)return {ok:false,reason:'navigation_cancelled'};
 state.position=[p.x,p.y+9];renderScene();return status();
}
function renderScene(){
 show('scene');const q=quest(),p=PLACES[q.place],person=PEOPLE[q.npc],t=task();
 $('#sceneView').innerHTML=`<div class="scene-banner">${p.img?`<img class="scene-photo" src="assets/${p.img}.webp" alt="${esc(p.caption)}">`:`<div class="scene-map"><div class="scene-map-inner"><img src="assets/east-campus-map.png" alt="北外东院地图，池塘名称校正为小碧池"><span class="map-correction">小碧池</span></div></div>`}<div class="scene-title"><small>${esc(p.jp)} · ${state.quest+1} / 6</small><h2>${esc(p.name)}</h2><p>${esc(q.title)}</p></div><div class="scene-stepbar">${[0,1,2].map(i=>`<span class="step-dot ${state.steps[state.quest]>i?'done':state.steps[state.quest]===i?'current':''}">${state.steps[state.quest]>i?'✓':i+1}</span>`).join('')}</div>${p.source?`<a class="photo-source" href="${p.source}" target="_blank" rel="noopener">${esc(p.caption)} ↗</a>`:`<span class="photo-source">${esc(p.caption)}</span>`}</div><div class="scene-body"><aside class="npc-column"><div class="portrait p${q.npc}" role="img" aria-label="${esc(person.name)}立绘"></div><div class="npc-name">${esc(person.name)}</div><div class="npc-role">${esc(person.role)}</div></aside><div id="interaction"></div></div><div class="scene-bottom"><span>点击或键盘操作 · 答错可修正 · 不限重试次数</span><button id="backMap">⌖ 回到校园地图</button></div>`;
 $('#backMap').onclick=renderMap;
 if(!t){renderStationComplete();animateScene();return;}
 const r=record(t);
 $('#interaction').innerHTML=`<div class="dialogue-box"><small>${esc(state.steps[state.quest]===0?q.story:'继续和'+person.name+'完成这一站。')}</small><p lang="ja">${esc(t.say)}</p>${t.type!=='listen'?`<div class="audio-row"><button id="speakDialogue">▷ 读出对话</button></div>`:''}</div><div class="challenge-head"><span class="type-tag">${typeNames[t.type]}</span><h3>${esc(t.title)}</h3></div><p class="instruction">${esc(t.zh)}</p><div class="workbench" id="workbench"></div><div id="feedback" role="status" aria-live="polite"></div><div class="continue-row" id="continueRow"></div>`;
 if($('#speakDialogue'))$('#speakDialogue').onclick=()=>speak(t.audio||t.say);
 renderWorkbench();renderFeedback();animateScene();
}
function renderWorkbench(){
 const t=task(),r=record();let html=t.data?`<div class="data-note jp">${esc(t.data)}</div>`:'';
 if(t.type==='listen')html+=`<div class="recording"><div class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><button class="primary" id="listenBtn">▷ 播放语音留言</button><button class="text-button" id="transcriptBtn">${r.transcript?'隐藏':'显示'}文字辅助</button><p class="transcript jp" ${r.transcript?'':'hidden'}>${esc(t.transcript)}</p></div>`;
 if(['choice','listen','multi'].includes(t.type)){
  if(t.type==='multi')html+=`<div class="tray" aria-live="polite">你的托盘：${r.selected.length?r.selected.map(i=>esc(t.options[i])).join(' ＋ '):'点击下方餐品放入'}</div>`;
  html+=`<div class="choices">${t.options.map((opt,i)=>`<button class="choice ${t.object||t.type==='multi'?'object':''} ${r.selected.includes(i)?'selected':''}" data-choice="${i}" ${r.solved?'disabled':''}><small>${t.type==='multi'?'点击放入／取出':t.object?'物品标签 '+(i+1):'回应 '+(i+1)}</small>${esc(opt)}</button>`).join('')}</div>`;
  if(t.type==='multi')html+='<div class="work-actions"><button class="primary" id="submitMulti">确认托盘</button></div>';
 }else if(t.type==='spell'){
  html+=`<div class="spelling-display"><div class="word-card">${esc(t.word)}</div><span class="micro">在背面写假名读音<br>注意长音、促音和拗音</span></div><label class="sr-only" for="spellInput">${esc(t.word)}的平假名读音</label><input id="spellInput" class="answer-input" lang="ja" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="输入平假名读音" value="${esc(r.spell)}" ${r.solved?'disabled':''}><div class="keyboard">${t.keys.map(k=>`<button data-kana="${esc(k)}" ${r.solved?'disabled':''}>${esc(k)}</button>`).join('')}<button id="backspace" ${r.solved?'disabled':''} aria-label="删除末尾假名">⌫</button></div><div class="work-actions"><button class="primary" id="submitSpell" ${r.solved?'disabled':''}>填写名签 ✓</button></div>`;
 }else if(t.type==='order'){
  html+=`<div class="tile-zone" aria-label="已排列的句子">${r.order.map((i,n)=>`<button class="tile" data-remove="${n}" ${r.solved?'disabled':''}>${esc(t.tiles[i])}</button>`).join('')}</div><div class="tile-bank" aria-label="待选词卡">${t.tiles.map((v,i)=>`<button class="tile" data-tile="${i}" ${r.order.includes(i)||r.solved?'disabled':''}>${esc(v)}</button>`).join('')}</div><div class="work-actions"><button id="clearTiles" ${r.solved?'disabled':''}>重新整理</button><button class="primary" id="submitOrder" ${r.solved?'disabled':''}>用这句话回应 ↗</button></div>`;
 }else if(t.type==='match'){
  const shuffled=t.pairs.map((_,i)=>i).sort((a,b)=>((a+1)%t.pairs.length)-((b+1)%t.pairs.length));
  html+=`<div class="match-board"><div class="match-col">${t.pairs.map((v,i)=>`<button data-left="${i}" class="${r.pairs.includes(i)?'matched':''} ${r.pairLeft===i?'selected':''}" ${r.pairs.includes(i)||r.solved?'disabled':''}>${esc(v[0])}${r.pairs.includes(i)?' ✓':''}</button>`).join('')}</div><div class="match-col">${shuffled.map(i=>`<button data-right="${i}" class="${r.pairs.includes(i)?'matched':''}" ${r.pairs.includes(i)||r.solved?'disabled':''}>${esc(t.pairs[i][1])}${r.pairs.includes(i)?' ✓':''}</button>`).join('')}</div></div><p class="micro">已归位 ${r.pairs.length} / ${t.pairs.length} 组 · 先左后右</p>`;
 }
 html+=`<div class="hint-row"><span>${esc(t.topic)}</span><button class="text-button" id="hintBtn">知识提示</button></div>`;
 $('#workbench').innerHTML=html;
 if($('#listenBtn')){$('#listenBtn').onclick=()=>speak(t.audio);$('#transcriptBtn').onclick=()=>{r.transcript=!r.transcript;if(r.transcript)r.hint=true;renderWorkbench();};}
 $('#workbench').querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{
  const i=Number(b.dataset.choice);if(r.solved)return;if(t.type==='multi'){r.selected=r.selected.includes(i)?r.selected.filter(x=>x!==i):[...r.selected,i];renderWorkbench();}else{submitAnswer(i);}
 });
 if($('#submitMulti'))$('#submitMulti').onclick=()=>submitAnswer([...r.selected]);
 if($('#spellInput')){
  $('#spellInput').oninput=e=>{r.spell=e.target.value};$('#spellInput').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();submitAnswer(e.currentTarget.value);}};
  $('#workbench').querySelectorAll('[data-kana]').forEach(b=>b.onclick=()=>{r.spell+=[...b.dataset.kana].join('');$('#spellInput').value=r.spell;});
  $('#backspace').onclick=()=>{r.spell=Array.from(r.spell).slice(0,-1).join('');$('#spellInput').value=r.spell;};$('#submitSpell').onclick=()=>submitAnswer($('#spellInput').value);
 }
 $('#workbench').querySelectorAll('[data-tile]').forEach(b=>b.onclick=()=>{r.order.push(Number(b.dataset.tile));renderWorkbench();});
 $('#workbench').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{r.order.splice(Number(b.dataset.remove),1);renderWorkbench();});
 if($('#clearTiles')){$('#clearTiles').onclick=()=>{r.order=[];renderWorkbench();};$('#submitOrder').onclick=()=>submitAnswer(r.order.map(i=>t.tiles[i]));}
 $('#workbench').querySelectorAll('[data-left]').forEach(b=>b.onclick=()=>{r.pairLeft=Number(b.dataset.left);renderWorkbench();});
 $('#workbench').querySelectorAll('[data-right]').forEach(b=>b.onclick=()=>{if(r.pairLeft===null){toast('先选左侧的卡片，再选择右侧配对。');return;}pairCards(r.pairLeft,Number(b.dataset.right));});
 $('#hintBtn').onclick=()=>{r.hint=true;r.message=t.explain;renderFeedback();};
}
function normal(s){return s.normalize('NFKC').replace(/\s/g,'').trim();}
function submitAnswer(answer){
 if(!state||state.view!=='scene'||!task())throw Error('请先进入一个未完成的任务。');
 const t=task(),r=record();if(r.solved)return {ok:false,reason:'already_solved'};
 let correct=false;
 if(['choice','listen'].includes(t.type)){if(!Number.isInteger(answer)||answer<0||answer>=t.options.length)throw Error('选项编号无效。');r.selected=[answer];correct=answer===t.answer;}
 else if(t.type==='spell'){if(typeof answer!=='string'||answer.length>100)throw Error('请输入简短的假名读音。');if(!normal(answer)){toast('请先填写读音。');return {ok:false,reason:'empty_answer'};}r.spell=answer;correct=normal(answer)===t.answer;}
 else if(t.type==='order'){if(!Array.isArray(answer)||answer.some(v=>typeof v!=='string')||answer.length>t.tiles.length||answer.some(v=>!t.tiles.includes(v)))throw Error('词卡内容无效。');correct=JSON.stringify(answer)===JSON.stringify(t.answer);}
 else if(t.type==='multi'){if(!Array.isArray(answer)||answer.some(v=>!Number.isInteger(v)||v<0||v>=t.options.length)||new Set(answer).size!==answer.length)throw Error('物品编号无效。');r.selected=[...answer];correct=JSON.stringify([...answer].sort())===JSON.stringify([...t.answer].sort());}
 else throw Error('配对任务请依次连接卡片。');
 return grade(correct);
}
function pairCards(left,right){
 if(!state||state.view!=='scene'||task()?.type!=='match')throw Error('当前不是配对任务。');
 const t=task(),r=record();if(!Number.isInteger(left)||!Number.isInteger(right)||left<0||right<0||left>=t.pairs.length||right>=t.pairs.length)throw Error('配对编号无效。');
 if(r.solved||r.pairs.includes(left)||r.pairs.includes(right))return {ok:false,reason:'already_matched'};
 if(left===right){r.pairs.push(left);r.pairLeft=null;r.message='这一组归位了。继续连接剩下的卡片。';if(r.pairs.length===t.pairs.length)return grade(true);renderWorkbench();renderFeedback();return {ok:true,matched:r.pairs.length};}
 r.pairLeft=null;return grade(false);
}
function grade(correct){const r=record();r.attempts++;if(correct){r.solved=true;r.message=task().explain;}else{r.wrong++;r.message='这一步还需要调整。请再核对场景信息、助词或假名大小；需要帮助时可点“知识提示”。';}renderWorkbench();renderFeedback();renderSidebar();if(correct)successMotion();return {ok:true,correct,solved:solvedCount(),attempts:r.attempts};}
function renderFeedback(){
 const r=record();$('#feedback').innerHTML=r.message?`<div class="feedback ${r.solved?'correct':''}"><b>${r.solved?'✓ 场景任务完成':r.hint?'知识提示':'再检查一下'}</b>${esc(r.message)}</div>`:'';
 $('#continueRow').innerHTML=r.solved?`<button id="continueBtn" class="primary">${state.steps[state.quest]===2?'收好'+esc(quest().reward):'继续这段对话'} →</button>`:'';
 if($('#continueBtn'))$('#continueBtn').onclick=advance;
}
function advance(){
 if(!state||state.view!=='scene'||!task()||!record().solved)throw Error('请先完成当前任务。');
 cancelSpeech();state.steps[state.quest]++;const collected=state.steps[state.quest]===3;renderSidebar();if(done()===6){renderEnding();if(collected)collectMotion(quest().reward);return status();}renderScene();if(collected)collectMotion(quest().reward);return status();
}
function renderStationComplete(){const q=quest();$('#interaction').innerHTML=`<div class="dialogue-box"><small>${esc(PEOPLE[q.npc].name)} · 这一站的道别</small><p lang="ja">よくできました。また会いましょう。</p><div class="audio-row"><button id="byeAudio">▷ 读出对话</button></div></div><div class="stamp-reward"><span>COLLECTED / 新的旅途纪念</span><b>✓ ${esc(q.reward)}</b><p>三个互动任务已完成，这件纪念物已收进你的背包。</p></div><div class="culture-card"><span class="eyebrow">CAMPUS & CULTURE / 带走一点新发现</span><p>${esc(q.culture)}</p></div><button id="continueMap" class="primary">展开地图，继续探索 →</button>`;$('#continueMap').onclick=renderMap;$('#byeAudio').onclick=()=>speak('よくできました。また会いましょう。');}
function renderNotebook(){if(!state)return;travelToken++;cancelSpeech();show('notebook');let html=`<span class="eyebrow">FIELD NOTES / 你的复习手册</span><h2>把冒险里的知识带走。</h2><p class="micro">这里只记录你做过或主动查看过提示的内容。答错的任务会标注“再复习”。</p>`;let count=0;for(const q of campaign().quests){for(const t of q.tasks){const r=state.records[t.id];if(r&&(r.solved||r.wrong||r.hint)){count++;html+=`<div class="note-item"><b>${r.wrong?'↺ 再复习':'✓ 已掌握'} · ${esc(t.topic)}</b>${esc(t.explain)}</div>`;}}}if(!count)html+='<p>手册还是空白。先到一个地点完成任务吧。</p>';html+='<p><button class="primary" id="closeNotebook">返回冒险 →</button></p>';$('#notebookView').innerHTML=html;$('#closeNotebook').onclick=()=>done()===6?renderEnding():renderMap();}
function renderEnding(){
 cancelSpeech();show('ending');const c=campaign(),records=Object.values(state.records),first=records.filter(r=>r.solved&&r.wrong===0&&!r.hint).length;
 $('#endingView').innerHTML=`<span class="eyebrow">CHAPTER COMPLETE / 故事还在继续</span><h2>${state.campaign==='mid'?'六枚印章，一群新朋友。':'最后一页，写下你的北外。'}</h2><div class="ending-people"><div class="portrait p0" role="img" aria-label="佐藤悠"></div><div class="portrait p1" role="img" aria-label="林同学"></div><div class="portrait p2" role="img" aria-label="周学长"></div></div><p>${esc(c.ending)}</p><div class="dialogue-box"><small>佐藤 悠 · 你</small><p lang="ja">${esc(c.endJP)}</p><small>林同学</small><p lang="ja">${esc(c.reply)}</p><div class="audio-row"><button id="endAudio">▷ 听两人的最后一段对话</button></div></div><div class="end-stats"><div><b>18 / 18</b><span>完成任务</span></div><div><b>${first}</b><span>无提示、无错误完成</span></div><div><b>${formatTime(state.elapsed)}</b><span>探索用时</span></div></div>${state.campaign==='final'?`<div class="postcard"><span class="eyebrow">EPILOGUE / 写作延伸 · 可另用 2—3 分钟</span><h3>给日本朋友的一张北外明信片</h3><p class="instruction">以佐藤悠的身份写 3—4 句日语：① 昨天做了什么；② 现在喜欢什么或擅长什么；③ 发生了什么变化。至少用一次过去式和一次「～になりました」。可参考上方故事，自主完成后交给老师或同伴检查。</p><label for="postcardText" class="sr-only">北外生活日语明信片</label><textarea id="postcardText" lang="ja" maxlength="1000" placeholder="昨日は……。私は……が……。……になりました。">${esc(state.writing)}</textarea><div class="check-list">${['我写了 3—4 句完整日语。','我使用了过去式，并核对了词尾。','我用「～になりました」表达变化。'].map((v,i)=>`<label><input type="checkbox" data-check="${i}" ${state.checked.includes(i)?'checked':''}> ${v}</label>`).join('')}</div><button class="primary" id="saveWriting">完成自查，保存到本次日记</button><p id="writingStatus" class="writing-note">${state.writingSaved?'已保存在本次页面会话中；刷新页面会清空。':'写作不自动判定正误，请由老师／同伴反馈。内容仅在本次页面会话内保留。'}</p></div>`:''}<div class="end-actions"><button id="reviewNotes" class="primary">查看知识与错题手册</button><button id="anotherChapter">返回篇章选择</button></div>`;
 $('#endAudio').onclick=()=>speak(c.endJP+'　'+c.reply);$('#reviewNotes').onclick=renderNotebook;$('#anotherChapter').onclick=goHome;
 if($('#postcardText')){$('#postcardText').oninput=e=>{state.writing=e.target.value;state.writingSaved=false;};$('#endingView').querySelectorAll('[data-check]').forEach(el=>el.onchange=()=>{const i=Number(el.dataset.check);state.checked=el.checked?[...new Set([...state.checked,i])]:state.checked.filter(n=>n!==i);state.writingSaved=false;});$('#saveWriting').onclick=()=>{if(!state.writing.trim()||state.checked.length!==3){$('#writingStatus').textContent='请先完成写作，并逐项勾选自查。';return;}state.writingSaved=true;$('#writingStatus').textContent='已保存在本次页面会话中。请给老师／同伴看一看；刷新页面会清空。';};}
}
async function walkMap(place,token){
 const sprite=$('.map-player'),board=$('.map-board');if(!sprite||!board)return;
 const start=[...state.position],end=[place.x,place.y+9];
 const route=[start,[start[0],56],[41,56],[end[0],56],end].filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 board.querySelector('.travel-route')?.remove();board.querySelector('.travel-caption')?.remove();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('class','travel-route');svg.setAttribute('aria-hidden','true');
 const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',route.map(p=>p.join(',')).join(' '));svg.appendChild(line);board.appendChild(svg);
 const label=document.createElement('div');label.className='travel-caption';label.textContent='前往 '+place.name+' · 途中';board.appendChild(label);sprite.classList.add('walking');
 for(let n=1;n<route.length;n++){
  if(token!==travelToken||!state){svg.remove();label.remove();sprite.classList.remove('walking');return;}
  sprite.style.transitionDuration=reducedMotion()?'0ms':'240ms';sprite.style.left=route[n][0]+'%';sprite.style.top=route[n][1]+'%';
  await new Promise(r=>setTimeout(r,reducedMotion()?0:250));
 }
 sprite.classList.remove('walking');svg.remove();label.remove();
}
function animateScene(){
 const scene=$('#sceneView');scene.classList.remove('scene-enter');void scene.offsetWidth;scene.classList.add('scene-enter');
 if(reducedMotion())return;
 const line=scene.querySelector('.dialogue-box p[lang="ja"]');if(!line)return;
 const full=line.textContent;line.style.minHeight=line.getBoundingClientRect().height+'px';const ink=document.createElement('span');ink.setAttribute('aria-hidden','true');const accessible=document.createElement('span');accessible.className='sr-only';accessible.textContent=full;line.textContent='';line.append(accessible,ink);
 const chars=Array.from(full);let n=0;const skip=document.createElement('button');skip.className='type-skip';skip.textContent='显示整句 ›';skip.type='button';line.after(skip);
 const reveal=()=>{clearTimeout(dialogueTimer);ink.textContent=full;skip.remove();};skip.onclick=reveal;
 const write=()=>{if(!line.isConnected)return;ink.textContent=chars.slice(0,++n).join('');if(n<chars.length)dialogueTimer=setTimeout(write,24);else skip.remove();};write();
}
function successMotion(){
 if(reducedMotion())return;const box=$('#feedback').getBoundingClientRect();
 for(let i=0;i<7;i++){const dot=document.createElement('i');dot.className='success-dot';dot.style.left=(box.left+28)+'px';dot.style.top=(box.top+25)+'px';dot.style.background=i%2?'#cfab51':'#719d70';document.body.appendChild(dot);const a=dot.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(i*.9)*75}px,${Math.sin(i*.9)*65-35}px) scale(.2)`,opacity:0}],{duration:580,easing:'cubic-bezier(.1,.6,.3,1)'});a.finished.then(()=>dot.remove());}
}
function collectMotion(name){
 toast('已收进背包：'+name);if(reducedMotion())return;const target=$('#inventory').getBoundingClientRect(),origin=$('.main-stage').getBoundingClientRect();if(!target.width||!target.height)return;
 const token=document.createElement('div');token.className='flying-token';token.textContent='✓ '+name;token.style.left=(origin.left+origin.width*.4)+'px';token.style.top=(Math.max(100,origin.top)+180)+'px';document.body.appendChild(token);
 const r=token.getBoundingClientRect();const a=token.animate([{transform:'translate(0,0) rotate(-5deg) scale(1.15)',opacity:1},{transform:`translate(${target.left-r.left}px,${target.top-r.top}px) rotate(5deg) scale(.4)`,opacity:.2}],{duration:850,easing:'cubic-bezier(.4,0,.1,1)'});a.finished.then(()=>token.remove());
}
$('#sceneView').addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||reducedMotion())return;const p=$('#sceneView .npc-column .portrait');if(!p)return;const r=$('#sceneView').getBoundingClientRect();p.style.setProperty('--look-x',((e.clientX-r.left)/r.width-.5)*8+'deg');p.style.setProperty('--look-y',((e.clientY-r.top)/r.height-.5)*-5+'deg');});
$('#sceneView').addEventListener('pointerleave',()=>{const p=$('#sceneView .npc-column .portrait');if(p){p.style.setProperty('--look-x','0deg');p.style.setProperty('--look-y','0deg');}});
function cancelSpeech(){if('speechSynthesis' in window)window.speechSynthesis.cancel();}
function speak(text){
 if(!('speechSynthesis' in window)){toast('此设备不支持朗读，请使用文字辅助。');return;}
 const voice=window.speechSynthesis.getVoices().find(v=>/^ja(?:-|_)/i.test(v.lang));
 if(!voice){toast('此设备尚无可用日语语音，可用文字辅助继续；课堂前请配置日语语音。');return;}
 // Keep kanji on screen; explicitly normalize the exceptional hour reading for TTS.
 cancelSpeech();const spokenText=text.replace(/九時|９時|9時/g,'くじ');const u=new SpeechSynthesisUtterance(spokenText);u.voice=voice;u.lang='ja-JP';u.rate=.83;u.volume=.9;u.onerror=()=>toast('日语语音暂时无法播放，请使用文字辅助。');window.speechSynthesis.speak(u);
}
function status(){if(!state)return {view:'welcome',campaigns:['mid','final']};const t=done()<6?task():null;return {campaign:state.campaign,view:state.view,station:state.quest,stationName:PLACES[quest().place].name,completedStations:done(),solvedTasks:solvedCount(),task:t?{id:t.id,type:t.type,title:t.title,solved:state.records[t.id]?.solved??false}:null};}
document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>startAdventure(b.dataset.start));$('#homeBtn').onclick=goHome;$('#mapBtn').onclick=()=>done()===6?renderEnding():renderMap();$('#notebookBtn').onclick=renderNotebook;
$('#fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此窗口无法全屏，可使用浏览器全屏快捷键。');}};
$('#sourcesBtn').onclick=()=>$('#sourcesDialog').showModal();$('.close-dialog').onclick=()=>$('#sourcesDialog').close();
window.addEventListener('pagehide',cancelSpeech);
// WebMCP mirrors the same visible actions; it neither reveals answers nor skips tasks.
if(document.modelContext?.registerTool){
 const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});
 const add=(name,description,properties,required,fn,readOnly=false)=>{const schema={type:'object',properties,required,additionalProperties:false};try{Promise.resolve(document.modelContext.registerTool({name,description,inputSchema:schema,annotations:{readOnlyHint:readOnly,untrustedContentHint:false},execute:async input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(properties,k))||required.some(k=>!Object.hasOwn(input,k)))throw Error('工具参数无效。');return await fn(input);}},{signal:controller.signal})).catch(()=>{});}catch{/* Unsupported hosts retain the complete UI. */}};
 add('start_review_adventure','Start or resume one chapter in the visible game.',{campaign:{type:'string',enum:['mid','final']}},['campaign'],a=>startAdventure(a.campaign));
 add('visit_campus_station','Visit a map station, zero-based 0–5. The finale requires the first five completed.',{station:{type:'integer',minimum:0,maximum:5}},['station'],a=>visit(a.station));
 add('answer_current_challenge','Submit the visible challenge. Choice/listening: zero-based option; spell: kana string; order: ordered string array; multi: option index array.',{answer:{oneOf:[{type:'integer'},{type:'string'},{type:'array',items:{oneOf:[{type:'string'},{type:'integer'}]}}]}},['answer'],a=>submitAnswer(a.answer));
 add('match_challenge_cards','Connect one left card and one right card by zero-based pair index, updating the visible board.',{left:{type:'integer'},right:{type:'integer'}},['left','right'],a=>pairCards(a.left,a.right));
 add('continue_review_story','Advance after a correctly completed challenge; never skips unanswered work.',{},[],()=>advance());
 add('read_review_status','Read concise game progress without revealing solutions.',{},[],()=>status(),true);
}
