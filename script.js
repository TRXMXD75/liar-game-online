// --- النوافذ المنبثقة ---
function showModal(title, msg, type = "info") {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    titleEl.innerText = title; document.getElementById('modal-body').innerText = msg;
    if(type === 'error') titleEl.style.color = 'var(--accent)';
    else if(type === 'success') titleEl.style.color = 'var(--success)';
    else titleEl.style.color = 'var(--gold)';
    modal.style.display = 'flex';
}
function closeModal() { document.getElementById('custom-modal').style.display = 'none'; }

// --- الصوتيات ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
function initAudio() { if(!audioCtx) audioCtx = new AudioContext(); if(audioCtx.state === 'suspended') audioCtx.resume(); }
function playSound(type) {
    if(!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        if(type === 'play') { osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); }
        else if(type === 'turn') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3); }
        else if(type === 'bluff') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.5); gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); osc.start(); osc.stop(audioCtx.currentTime + 0.5); }
        else if(type === 'pass') { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 0.2); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
        else if(type === 'win') { osc.type = 'square'; osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.setValueAtTime(554, audioCtx.currentTime + 0.1); osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.2); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6); osc.start(); osc.stop(audioCtx.currentTime + 0.6); }
    } catch(e) {}
}

// --- الترتيب التصاعدي ---
const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function sortMyHand() { myHand.sort((a,b) => rankOrder.indexOf(a) - rankOrder.indexOf(b)); }

// --- التوكن (SessionStorage لمنع التضارب) ---
let myToken;
try {
    myToken = sessionStorage.getItem('kaddab_token');
    if(!myToken) { myToken = Math.random().toString(36).substr(2); sessionStorage.setItem('kaddab_token', myToken); }
} catch(e) { myToken = Math.random().toString(36).substr(2); }

let peer, conn, connections = [];
let gameState = { players: [], currentPlayer: 0, pot: [], currentClaim: "", lastPlayer: -1, lastPlayCount: 0, actionLog: "", winner: null, bluffEventId: 0, gameStarted: false };
let hostHandBackup = {}; 
let isHost = false, myHand = [], selected = [], myIndex = 0, myName = "";
let processedBluffIds = [];

function getPlayerName() { return document.getElementById('player-name').value.trim() || `لاعب ${Math.floor(Math.random() * 100)}`; }
function updatePeerCount() { if(isHost) { document.getElementById('peer-count').innerText = connections.length + 1; } }

window.onbeforeunload = function() { if(isHost && gameState.gameStarted) return "إذا خرجت ستنتهي اللعبة للجميع!"; };

// --- الاتصال ---
function setupConn(c) {
    c.on('data', data => {
        if(data.type === 'HELLO_HOST') {
            if(gameState.gameStarted) {
                let existing = gameState.players.find(p => p.token === data.token);
                if(existing) { c.playerName = data.name; c.playerToken = data.token; connections.push(c); c.send({ type: 'RECONNECT', hand: hostHandBackup[data.token], state: gameState, yourIndex: existing.index }); } 
                else c.send({ type: 'REJECTED' });
            } else { c.playerName = data.name; c.playerToken = data.token; connections.push(c); updatePeerCount(); c.send({ type: 'HELLO_CLIENT' }); }
        }
        else if (data.type === 'HELLO_CLIENT') document.getElementById('initial-setup').innerHTML = `<h2 style='color:var(--gold)'>تم الاتصال! ✅</h2><p>انتظر المضيف يوزع الورق...</p>`;
        else if (data.type === 'REJECTED') { showModal("مغلقة 🔒", "اللعبة بدأت بالفعل وما تقدر تدخل الحين", "error"); if(peer) peer.destroy(); }
        else if (data.type === 'START' || data.type === 'RECONNECT') {
            document.getElementById('lobby').style.display = 'none';
            myHand = data.hand; gameState = data.state; myIndex = data.yourIndex; sortMyHand(); render();
        }
        else if (data.type === 'UPDATE') {
            gameState = data.state;
            if(gameState.potToGive && gameState.potToGive.target === myIndex && !processedBluffIds.includes(gameState.bluffEventId)) {
                myHand.push(...gameState.potToGive.cards); sortMyHand(); processedBluffIds.push(gameState.bluffEventId);
                try { if(!isHost) conn.send({ type: 'BACKUP_HAND', token: myToken, hand: myHand }); else hostHandBackup[myToken] = myHand; } catch(e){}
            }
            if(isHost) { connections.forEach(cli => { try { cli.send({ type: 'UPDATE', state: gameState }); } catch(e){} }); }
            render();
        }
        else if (data.type === 'BACKUP_HAND' && isHost) hostHandBackup[data.token] = data.hand;
    });
    c.on('close', () => { connections = connections.filter(cli => cli !== c); updatePeerCount(); });
}

function startHost() { initAudio(); myName = getPlayerName(); isHost = true; document.getElementById('initial-setup').innerHTML = "<h2>جاري تجهيز الطاولة... ⏳</h2>"; peer = new Peer(); peer.on('open', id => { document.getElementById('initial-setup').style.display = 'none'; document.getElementById('waiting-area').style.display = 'block'; document.getElementById('room-code').innerText = id; document.getElementById('start-game-btn').style.display = 'block'; }); peer.on('connection', c => setupConn(c)); }
function joinRoom() { initAudio(); myName = getPlayerName(); const hostId = document.getElementById('join-id').value.trim(); if(!hostId) return showModal("تنبيه", "أدخل الكود!", "error"); document.getElementById('initial-setup').innerHTML = "<h2>جاري البحث... ⏳</h2>"; peer = new Peer(); peer.on('open', id => { conn = peer.connect(hostId); setupConn(conn); conn.on('open', () => conn.send({ type: 'HELLO_HOST', name: myName, token: myToken })); }); peer.on('error', () => { showModal("خطأ", "الكود خطأ!", "error"); setTimeout(()=>location.reload(), 2000); }); }

function broadcastStart() {
    if(!isHost) return; playSound('play'); gameState.gameStarted = true;
    let playersArr = [{ name: myName, token: myToken, conn: null }];
    connections.forEach(c => playersArr.push({ name: c.playerName, token: c.playerToken, conn: c })); playersArr.sort(() => Math.random() - 0.5);
    gameState.players = playersArr.map((p, i) => ({ index: i, name: p.name, token: p.token, cardCount: 0 }));
    
    let deck = []; rankOrder.forEach(r => { for(let i=0; i<8; i++) deck.push(r); }); deck.sort(() => Math.random() - 0.5);
    let hands = Array.from({length: playersArr.length}, () => []);
    let pIdx = 0; while(deck.length > 0) { hands[pIdx % playersArr.length].push(deck.pop()); pIdx++; }
    playersArr.forEach((p, i) => gameState.players[i].cardCount = hands[i].length);

    playersArr.forEach((p, i) => { 
        hostHandBackup[p.token] = hands[i]; 
        if(p.conn) { try { p.conn.send({ type: 'START', hand: hands[i], state: gameState, yourIndex: i }); } catch(e){} } 
        else { myHand = hands[i]; myIndex = i; sortMyHand(); } 
    });
    document.getElementById('lobby').style.display = 'none'; render();
}

// --- فحص الفوز ---
function checkWin() {
    let winnerPlayer = gameState.players.find(p => p.cardCount === 0 && gameState.lastPlayer !== p.index);
    if(winnerPlayer) gameState.winner = winnerPlayer.name;
}

// --- آليات اللعب ---
function playCards() {
    if(gameState.currentPlayer !== myIndex) return showModal("تنبيه", "مب دورك يا بطل!", "error");
    if(selected.length === 0) return showModal("تنبيه", "اختر ورقة على الأقل عشان تنزلها!", "error");

    let claim = document.getElementById('claim-val').value;
    if(!claim && !gameState.currentClaim) return showModal("تنبيه", "يجب تحديد الرقم المطلوب إما منك أو ممن قبلك!", "error");
    if(!gameState.currentClaim) gameState.currentClaim = claim;

    playSound('play');
    let played = []; selected.sort((a,b)=>b-a).forEach(idx => played.push(myHand.splice(idx, 1)[0]));
    
    gameState.players[myIndex].cardCount -= played.length;
    gameState.pot.push(...played);
    gameState.lastPlayer = myIndex;
    gameState.lastPlayCount = played.length; 
    
    let nextPlayerName = gameState.players[(myIndex + 1) % gameState.players.length].name;
    gameState.actionLog = `🃏 ${myName} نزل [${played.length}] أوراق على أنها (${gameState.currentClaim}) ➡️ الدور عند ${nextPlayerName}`;
    
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    selected = [];
    
    checkWin();
    try { if(!isHost) conn.send({ type: 'BACKUP_HAND', token: myToken, hand: myHand }); else hostHandBackup[myToken] = myHand; } catch(e){}
    syncData();
}

function passTurn() {
    if(gameState.currentPlayer !== myIndex) return;
    if(gameState.lastPlayer === -1 || gameState.pot.length === 0) return showModal("تنبيه", "الطاولة فاضية، ما تقدر تسوي Pass! لازم تختار رقم وتلعب.", "error");
    
    playSound('pass');
    let nextPlayerName = gameState.players[(myIndex + 1) % gameState.players.length].name;
    gameState.actionLog = `⏭️ ${myName} سوى Pass ➡️ الدور عند ${nextPlayerName} يختار رقم جديد!`;
    
    gameState.currentClaim = ""; gameState.lastPlayer = -1; 
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    selected = []; document.getElementById('claim-val').value = ""; 
    
    checkWin(); syncData();
}

function callBluff() {
    if(gameState.pot.length === 0 || gameState.lastPlayer === -1 || gameState.lastPlayer === myIndex) return;
    playSound('bluff');
    
    let lastPlayedCards = gameState.pot.slice(-gameState.lastPlayCount);
    let isLying = lastPlayedCards.some(c => c !== gameState.currentClaim);
    
    let targetIndex;
    if(isLying) {
        targetIndex = gameState.lastPlayer; 
        gameState.currentPlayer = myIndex; // اللي كشفه يبدأ
        gameState.actionLog = `💥 ${myName} كشف كذبة ${gameState.players[targetIndex].name} بنجاح! الدور يرجع لـ ${myName}.`;
        showModal("قفطته! 🕵️‍♂️", `طلع كذاب! 🤥 ${gameState.players[targetIndex].name} سيسحب كل الكومة.`, "success");
    } else {
        targetIndex = myIndex; 
        gameState.currentPlayer = gameState.lastPlayer; // الصادق يكمل
        gameState.actionLog = `🤦‍♂️ ${myName} ظلم ${gameState.players[gameState.lastPlayer].name}.. ${myName} بياكل الورق والصادق يكمل!`;
        showModal("أوبس! 🤦‍♂️", `طلع صادق! 😇 أنت بتاخذ كل الكومة والدور يرجع له لأنه صادق.`, "error");
    }
    
    gameState.bluffEventId = Math.random();
    gameState.potToGive = { target: targetIndex, cards: [...gameState.pot] };
    gameState.players[targetIndex].cardCount += gameState.pot.length;
    
    gameState.pot = []; gameState.currentClaim = ""; gameState.lastPlayer = -1;
    
    if(targetIndex === myIndex) { 
        myHand.push(...gameState.potToGive.cards); sortMyHand(); processedBluffIds.push(gameState.bluffEventId); 
        try { if(!isHost) conn.send({ type: 'BACKUP_HAND', token: myToken, hand: myHand }); else hostHandBackup[myToken] = myHand; } catch(e){}
    }
    document.getElementById('claim-val').value = ""; 
    
    checkWin(); syncData();
}

function syncData() {
    if(isHost) { connections.forEach(c => { try { c.send({ type: 'UPDATE', state: gameState }); } catch(e){} }); } 
    else { try { conn.send({ type: 'UPDATE', state: gameState }); } catch(e){} }
    render();
}

function render() {
    if(gameState.winner) {
        playSound('win');
        document.getElementById('win-body').innerText = `${gameState.winner} خلص أوراقه وفاز باللعبة! 🎉`;
        document.getElementById('win-modal').style.display = 'flex';
        return;
    }

    document.getElementById('action-log').innerText = gameState.actionLog || "بانتظار الحركة الأولى...";

    const handEl = document.getElementById('my-hand'); handEl.innerHTML = '';
    myHand.forEach((card, idx) => {
        const c = document.createElement('div'); c.className = `card ${selected.includes(idx)?'selected':''}`;
        c.innerHTML = `<span>${card}</span><span style="align-self:flex-end; transform:rotate(180deg)">${card}</span>`;
        c.onclick = () => { playSound('pass'); selected.includes(idx) ? selected.splice(selected.indexOf(idx), 1) : selected.push(idx); render(); };
        handEl.appendChild(c);
    });

    const status = document.getElementById('status-bar');
    if(gameState.currentPlayer === myIndex) {
        if(status.innerText !== "🔥 دورك! اختر ونزل الورق 🔥") playSound('turn');
        status.innerText = "🔥 دورك! اختر ونزل الورق 🔥"; status.style.color = "#00ff00";
    } else { status.innerText = `⏳ بانتظار ${gameState.players[gameState.currentPlayer]?.name} ⏳`; status.style.color = "white"; }

    // إخفاء/إظهار اختيار الرقم
    const claimSelect = document.getElementById('claim-val');
    if(!gameState.currentClaim && gameState.currentPlayer === myIndex) { claimSelect.style.display = "inline-block"; } 
    else { claimSelect.style.display = "none"; }
    
    if(gameState.currentClaim) { document.getElementById('claim-msg').innerText = `المطلوب: ${gameState.currentClaim}`; document.getElementById('claim-msg').style.display = "block"; } 
    else { document.getElementById('claim-msg').style.display = "none"; }
    
    // تعطيل الأزرار بشكل ذكي
    const bluffBtn = document.getElementById('btn-bluff');
    const passBtn = document.getElementById('btn-pass');
    bluffBtn.disabled = (gameState.pot.length === 0 || gameState.lastPlayer === -1 || gameState.lastPlayer === myIndex);
    passBtn.disabled = (gameState.pot.length === 0 || gameState.lastPlayer === -1); 

    document.getElementById('pot-count-badge').innerText = `الكومة: ${gameState.pot.length} بطاقة`;
    
    const potCont = document.getElementById('pot-container'); potCont.innerHTML = '';
    gameState.pot.forEach((_, i) => { const p = document.createElement('div'); p.className = 'pot-card'; p.style.setProperty('--r', `${(i * 17) % 360}deg`); potCont.appendChild(p); });

    const avatarsCont = document.getElementById('avatars-container'); avatarsCont.innerHTML = '';
    let total = gameState.players.length;
    gameState.players.forEach(p => {
        if(p.index === myIndex) return; 
        let relIndex = (p.index - myIndex + total) % total; 
        let angleDeg = 90 - (360 / total) * relIndex; 
        let angleRad = angleDeg * (Math.PI / 180);
        let x = 50 + 45 * Math.cos(angleRad); let y = 50 + 45 * Math.sin(angleRad); 

        const div = document.createElement('div'); div.className = `avatar ${gameState.currentPlayer === p.index ? 'active' : ''}`;
        div.style.left = `${x}%`; div.style.top = `${y}%`;
        div.innerHTML = `<div class="name">${p.name}</div><div class="cards">🎴 ${p.cardCount}</div>`;
        avatarsCont.appendChild(div);
    });
}