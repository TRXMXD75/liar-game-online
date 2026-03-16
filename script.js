function showModal(title, msg, type = "info") {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    titleEl.innerText = title; document.getElementById('modal-body').innerText = msg;
    if(type === 'error') titleEl.style.color = 'var(--accent-red)';
    else if(type === 'success') titleEl.style.color = 'var(--success-green)';
    else titleEl.style.color = 'var(--gold-primary)';
    modal.style.display = 'flex';
}
function closeModal() { document.getElementById('custom-modal').style.display = 'none'; }

function showBigAction(text, color) {
    const overlay = document.getElementById('action-overlay');
    const textEl = document.getElementById('action-text');
    textEl.innerText = text;
    textEl.style.textShadow = `0 10px 30px rgba(0,0,0,0.9), 0 0 50px ${color}`;
    overlay.style.display = 'flex';
    textEl.style.animation = 'none';
    void textEl.offsetWidth;
    textEl.style.animation = 'smashIn 2.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    setTimeout(() => { overlay.style.display = 'none'; }, 2500);
}

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
function initAudio() { if(!audioCtx) audioCtx = new AudioContext(); if(audioCtx.state === 'suspended') audioCtx.resume(); }

function playSound(type) {
    if(!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        if(type === 'play') { osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); }
        else if(type === 'turn') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3); }
        else if(type === 'big_bluff') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.8); gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.8); osc.start(); osc.stop(audioCtx.currentTime + 0.8); }
        else if(type === 'big_pass') { osc.type = 'triangle'; osc.frequency.setValueAtTime(500, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5); gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); osc.start(); osc.stop(audioCtx.currentTime + 0.5); }
        else if(type === 'win') { osc.type = 'square'; osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.setValueAtTime(554, audioCtx.currentTime + 0.2); osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.4); gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1); osc.start(); osc.stop(audioCtx.currentTime + 1); }
    } catch(e) {}
}

const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function sortMyHand() { myHand.sort((a,b) => rankOrder.indexOf(a) - rankOrder.indexOf(b)); }

let myToken;
try { myToken = sessionStorage.getItem('kaddab_token'); if(!myToken) { myToken = Math.random().toString(36).substr(2); sessionStorage.setItem('kaddab_token', myToken); } } catch(e) { myToken = Math.random().toString(36).substr(2); }

let peer, conn, connections = [];
let gameState = { players: [], currentPlayer: 0, pot: [], currentClaim: "", lastPlayer: -1, lastPlayCount: 0, actionLog: "", winner: null, bluffEventId: 0, gameStarted: false };
let hostHandBackup = {}; 
let isHost = false, myHand = [], selected = [], myIndex = 0, myName = "";
let processedBluffIds = [];
let lobbyNames = [];

function getPlayerName() { return document.getElementById('player-name').value.trim() || `لاعب ${Math.floor(Math.random() * 100)}`; }

function updateLobbyUI() {
    document.getElementById('peer-count').innerText = lobbyNames.length;
    const listEl = document.getElementById('lobby-players-list'); listEl.innerHTML = '';
    lobbyNames.forEach(name => { let tag = document.createElement('div'); tag.className = 'lobby-player-tag'; tag.innerText = name; listEl.appendChild(tag); });
}

function broadcastLobby() {
    if(isHost) {
        connections = connections.filter(c => c.open);
        lobbyNames = [myName, ...connections.map(c => c.playerName)];
        updateLobbyUI();
        connections.forEach(c => { try { c.send({ type: 'LOBBY_UPDATE', names: lobbyNames }); } catch(e){} });
    }
}

window.onbeforeunload = function() { if(isHost && gameState.gameStarted) return "إذا خرجت ستنتهي اللعبة للجميع!"; };

function setupConn(c) {
    c.on('data', data => {
        if(data.type === 'HELLO_HOST') {
            if(gameState.gameStarted) {
                let existing = gameState.players.find(p => p.token === data.token);
                if(existing) { c.playerName = data.name; c.playerToken = data.token; connections.push(c); c.send({ type: 'RECONNECT', hand: hostHandBackup[data.token], state: gameState, yourIndex: existing.index }); } 
                else c.send({ type: 'REJECTED' });
            } else { c.playerName = data.name; c.playerToken = data.token; connections.push(c); c.send({ type: 'HELLO_CLIENT' }); broadcastLobby(); }
        }
        else if (data.type === 'HELLO_CLIENT') document.getElementById('initial-setup').innerHTML = `<h2 style='color:var(--success-green)'>تم الاتصال! ✅</h2><p>انتظر المضيف يبدأ...</p>`;
        else if (data.type === 'LOBBY_UPDATE') { lobbyNames = data.names; updateLobbyUI(); }
        else if (data.type === 'REJECTED') { showModal("مغلقة 🔒", "اللعبة بدأت بالفعل وما تقدر تدخل الحين", "error"); if(peer) peer.destroy(); }
        else if (data.type === 'START' || data.type === 'RECONNECT') {
            document.getElementById('lobby').style.display = 'none'; document.getElementById('table-area').style.display = 'flex'; document.getElementById('hand-container').style.display = 'flex'; document.getElementById('status-bar').style.display = 'block'; document.getElementById('action-log').style.display = 'block';
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
        else if (data.type === 'BIG_EVENT') { playSound(data.sound); showBigAction(data.text, data.color); document.getElementById('claim-val').value = ""; }
        else if (data.type === 'BACK_TO_LOBBY') { resetToLobby(data.names); }
    });
    c.on('close', () => { connections = connections.filter(cli => cli !== c); if(!gameState.gameStarted) broadcastLobby(); });
}

function startHost() { initAudio(); myName = getPlayerName(); isHost = true; lobbyNames = [myName]; updateLobbyUI(); document.getElementById('initial-setup').style.display = 'none'; document.getElementById('waiting-area').style.display = 'block'; document.getElementById('start-game-btn').style.display = 'block'; peer = new Peer(); peer.on('open', id => { document.getElementById('room-code').innerText = id; }); peer.on('connection', c => setupConn(c)); }
function joinRoom() { initAudio(); myName = getPlayerName(); const hostId = document.getElementById('join-id').value.trim(); if(!hostId) return showModal("تنبيه", "أدخل الكود!", "error"); document.getElementById('initial-setup').innerHTML = "<h2>جاري البحث... ⏳</h2>"; peer = new Peer(); peer.on('open', id => { conn = peer.connect(hostId); setupConn(conn); conn.on('open', () => conn.send({ type: 'HELLO_HOST', name: myName, token: myToken })); }); peer.on('error', () => { showModal("خطأ", "الكود خطأ!", "error"); setTimeout(()=>location.reload(), 2000); }); }

function broadcastStart() {
    if(!isHost) return; playSound('play'); gameState.gameStarted = true;
    let playersArr = [{ name: myName, token: myToken, conn: null }];
    connections.forEach(c => playersArr.push({ name: c.playerName, token: c.playerToken, conn: c })); playersArr.sort(() => Math.random() - 0.5);
    
    // تصفير الحالات السابقة للجميع
    gameState.players = playersArr.map((p, i) => ({ index: i, name: p.name, token: p.token, cardCount: 0, lastAction: null }));
    
    let deck = []; rankOrder.forEach(r => { for(let i=0; i<8; i++) deck.push(r); }); deck.sort(() => Math.random() - 0.5);
    let hands = Array.from({length: playersArr.length}, () => []);
    let pIdx = 0; while(deck.length > 0) { hands[pIdx % playersArr.length].push(deck.pop()); pIdx++; }
    playersArr.forEach((p, i) => gameState.players[i].cardCount = hands[i].length);

    gameState.pot = []; gameState.currentClaim = ""; gameState.lastPlayer = -1; gameState.actionLog = "بدأت اللعبة! 🃏"; gameState.winner = null;
    document.getElementById('claim-val').value = "";

    playersArr.forEach((p, i) => { hostHandBackup[p.token] = hands[i]; if(p.conn) { try { p.conn.send({ type: 'START', hand: hands[i], state: gameState, yourIndex: i }); } catch(e){} } else { myHand = hands[i]; myIndex = i; sortMyHand(); } });
    
    document.getElementById('lobby').style.display = 'none'; document.getElementById('table-area').style.display = 'flex'; document.getElementById('hand-container').style.display = 'flex'; document.getElementById('status-bar').style.display = 'block'; document.getElementById('action-log').style.display = 'block'; document.getElementById('win-modal').style.display = 'none';
    render();
}

function checkWin() { let winnerPlayer = gameState.players.find(p => p.cardCount === 0 && gameState.lastPlayer !== p.index); if(winnerPlayer) gameState.winner = winnerPlayer.name; }

function sendBigEventToAll(text, color, sound) {
    let eventData = { type: 'BIG_EVENT', text, color, sound };
    if(isHost) { playSound(sound); showBigAction(text, color); document.getElementById('claim-val').value = ""; connections.forEach(c => { try { c.send(eventData); } catch(e){} }); } 
    else { playSound(sound); showBigAction(text, color); document.getElementById('claim-val').value = ""; try { conn.send(eventData); } catch(e){} }
}

// مسح حالة الأكشن للاعب الذي سيبدأ دوره
function clearNextPlayerAction() {
    let nextIdx = (gameState.currentPlayer + 1) % gameState.players.length;
    gameState.players[nextIdx].lastAction = null;
}

function playCards() {
    if(gameState.currentPlayer !== myIndex) return showModal("تنبيه", "مب دورك يا بطل!", "error");
    if(selected.length === 0) return showModal("تنبيه", "اختر ورقة على الأقل!", "error");

    let claim = document.getElementById('claim-val').value;
    if(!claim && !gameState.currentClaim) return showModal("تنبيه", "حدد الرقم المطلوب من القائمة!", "error");
    if(!gameState.currentClaim) gameState.currentClaim = claim;

    playSound('play');
    let played = []; selected.sort((a,b)=>b-a).forEach(idx => played.push(myHand.splice(idx, 1)[0]));
    
    gameState.players[myIndex].cardCount -= played.length;
    gameState.players[myIndex].lastAction = { text: "نزل ورق", type: "play" };
    gameState.pot.push(...played);
    gameState.lastPlayer = myIndex;
    gameState.lastPlayCount = played.length; 
    
    let nextPlayerName = gameState.players[(myIndex + 1) % gameState.players.length].name;
    gameState.actionLog = `🃏 ${myName} نزل [${played.length}] أوراق على أنها (${gameState.currentClaim}) ➡️ الدور عند ${nextPlayerName}`;
    
    clearNextPlayerAction();
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    selected = []; document.getElementById('claim-val').value = ""; 
    
    checkWin();
    try { if(!isHost) conn.send({ type: 'BACKUP_HAND', token: myToken, hand: myHand }); else hostHandBackup[myToken] = myHand; } catch(e){}
    syncData();
}

function passTurn() {
    if(gameState.currentPlayer !== myIndex) return;
    if(gameState.lastPlayer === -1 || gameState.pot.length === 0) return showModal("تنبيه", "الطاولة فاضية، ما تقدر تسوي Pass!", "error");
    
    let nextPlayerName = gameState.players[(myIndex + 1) % gameState.players.length].name;
    gameState.actionLog = `💨 ${myName} سوّى PASS ➡️ الدور عند ${nextPlayerName} يختار رقم جديد!`;
    
    gameState.players[myIndex].lastAction = { text: "Pass 💨", type: "pass" };

    gameState.currentClaim = ""; gameState.lastPlayer = -1; 
    clearNextPlayerAction();
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    selected = []; document.getElementById('claim-val').value = ""; 
    
    sendBigEventToAll(`💨 ${myName}\nسوّى PASS!`, '#00f3ff', 'big_pass');
    checkWin(); syncData();
}

function callBluff() {
    if(gameState.pot.length === 0 || gameState.lastPlayer === -1 || gameState.lastPlayer === myIndex) return;
    
    let lastPlayedCards = gameState.pot.slice(-gameState.lastPlayCount);
    let isLying = lastPlayedCards.some(c => c !== gameState.currentClaim);
    let targetIndex = isLying ? gameState.lastPlayer : myIndex;
    
    gameState.players[myIndex].lastAction = { text: "كذّب 🚨", type: "bluff" };

    let bigText = `🚨 ${myName}\nكذّب ${gameState.players[gameState.lastPlayer].name}!`;
    sendBigEventToAll(bigText, '#ff2a2a', 'big_bluff');

    setTimeout(() => {
        if(isLying) {
            gameState.currentPlayer = myIndex; 
            gameState.players[targetIndex].lastAction = { text: "انقفط 🤥", type: "caught" };
            gameState.actionLog = `💥 ${myName} كشف كذبة ${gameState.players[targetIndex].name} بنجاح! الدور يرجع لـ ${myName}.`;
        } else {
            gameState.currentPlayer = gameState.lastPlayer; 
            gameState.players[gameState.lastPlayer].lastAction = { text: "صادق 😇", type: "play" };
            gameState.actionLog = `🤦‍♂️ ${myName} ظلم ${gameState.players[gameState.lastPlayer].name}.. ${myName} بياكل الورق والصادق يكمل!`;
        }
        
        // تصفير الحالات لمنع بقاء (انقفط) للأبد
        gameState.players.forEach(p => { if(p.index !== myIndex && p.index !== gameState.lastPlayer) p.lastAction = null; });

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
    }, 2500); 
}

function syncData() {
    if(isHost) { connections.forEach(c => { try { c.send({ type: 'UPDATE', state: gameState }); } catch(e){} }); } 
    else { try { conn.send({ type: 'UPDATE', state: gameState }); } catch(e){} }
    render();
}

function playAgain() {
    if(!isHost) return;
    gameState.gameStarted = false; broadcastLobby(); resetToLobby(lobbyNames);
    connections.forEach(c => { try { c.send({ type: 'BACK_TO_LOBBY', names: lobbyNames }); } catch(e){} });
}

function resetToLobby(names) {
    lobbyNames = names;
    document.getElementById('win-modal').style.display = 'none'; document.getElementById('table-area').style.display = 'none'; document.getElementById('hand-container').style.display = 'none'; document.getElementById('status-bar').style.display = 'none'; document.getElementById('action-log').style.display = 'none';
    document.getElementById('lobby').style.display = 'flex'; document.getElementById('initial-setup').style.display = 'none'; document.getElementById('waiting-area').style.display = 'block';
    if(isHost) { document.getElementById('start-game-btn').style.display = 'block'; document.getElementById('start-game-btn').disabled = false; }
    updateLobbyUI();
}

function render() {
    if(gameState.winner) {
        playSound('win'); document.getElementById('win-body').innerText = `${gameState.winner} خلص أوراقه وفاز باللعبة! 🎉`; document.getElementById('win-modal').style.display = 'flex';
        if(isHost) { document.getElementById('btn-play-again').style.display = 'block'; document.getElementById('wait-host-msg').style.display = 'none'; } 
        else { document.getElementById('btn-play-again').style.display = 'none'; document.getElementById('wait-host-msg').style.display = 'block'; }
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
    if(gameState.currentPlayer === myIndex) { if(status.innerText !== "🔥 دورك! اختر ونزل الورق 🔥") playSound('turn'); status.innerText = "🔥 دورك! اختر ونزل الورق 🔥"; status.style.color = "#00ff00"; } 
    else { status.innerText = `⏳ بانتظار ${gameState.players[gameState.currentPlayer]?.name} ⏳`; status.style.color = "white"; }

    const claimHolo = document.getElementById('claim-hologram');
    const claimSelect = document.getElementById('claim-val');
    
    if(gameState.currentClaim) { claimSelect.style.display = "none"; document.getElementById('claim-target-number').innerText = gameState.currentClaim; claimHolo.style.display = "block"; } 
    else { claimHolo.style.display = "none"; if(gameState.currentPlayer === myIndex) claimSelect.style.display = "inline-block"; else claimSelect.style.display = "none"; }
    
    const bluffBtn = document.getElementById('btn-bluff'); const passBtn = document.getElementById('btn-pass');
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
        
        let x = 50 + 45 * Math.cos(angleRad); let y = 50 + 40 * Math.sin(angleRad); 

        const div = document.createElement('div'); div.className = `avatar ${gameState.currentPlayer === p.index ? 'active' : ''}`;
        div.style.left = `${x}%`; div.style.top = `${y}%`;
        
        // إضافة شارة الحالة (Status Tag)
        let statusTag = '';
        if(p.lastAction) {
            statusTag = `<div class="player-status status-${p.lastAction.type}">${p.lastAction.text}</div>`;
        }

        div.innerHTML = `<div class="name">${p.name}</div><div class="cards">🎴 ${p.cardCount}</div>${statusTag}`;
        avatarsCont.appendChild(div);
    });
}