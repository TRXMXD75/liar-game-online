function showModal(title, msg, type = "info") {
    const modal = document.getElementById('custom-modal'); const titleEl = document.getElementById('modal-title');
    titleEl.innerText = title; document.getElementById('modal-body').innerText = msg;
    if(type === 'error') titleEl.style.color = 'var(--accent-red)'; else if(type === 'success') titleEl.style.color = 'var(--success-green)'; else titleEl.style.color = 'var(--gold-primary)';
    modal.style.display = 'flex';
}
function closeModal() { document.getElementById('custom-modal').style.display = 'none'; }

const selectOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function buildClaimGrid() {
    const grid = document.getElementById('claim-grid'); grid.innerHTML = '';
    selectOrder.forEach(rank => {
        let btn = document.createElement('button');
        btn.className = 'claim-btn'; btn.innerText = rank;
        btn.onclick = () => finalizePlay(rank);
        grid.appendChild(btn);
    });
}
buildClaimGrid();

function closeClaimModal() { document.getElementById('claim-modal').style.display = 'none'; }

function showBigAction(text, color) {
    const overlay = document.getElementById('action-overlay'); const textEl = document.getElementById('action-text');
    textEl.innerText = text; textEl.style.textShadow = `0 10px 30px rgba(0,0,0,0.9), 0 0 50px ${color}`;
    overlay.style.display = 'flex'; textEl.style.animation = 'none'; void textEl.offsetWidth;
    textEl.style.animation = 'smashIn 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    setTimeout(() => { overlay.style.display = 'none'; }, 1000);
}

const AudioContext = window.AudioContext || window.webkitAudioContext; let audioCtx;
function initAudio() { if(!audioCtx) audioCtx = new AudioContext(); if(audioCtx.state === 'suspended') audioCtx.resume(); }

function playSound(type) {
    if(!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        if(type === 'play') { osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); }
        else if(type === 'turn') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3); }
        else if(type === 'big_bluff') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.5); gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); osc.start(); osc.stop(audioCtx.currentTime + 0.5); }
        else if(type === 'big_pass') { osc.type = 'triangle'; osc.frequency.setValueAtTime(500, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5); gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); osc.start(); osc.stop(audioCtx.currentTime + 0.5); }
        else if(type === 'win') { osc.type = 'square'; osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.setValueAtTime(554, audioCtx.currentTime + 0.2); osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.4); gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1); osc.start(); osc.stop(audioCtx.currentTime + 1); }
    } catch(e) {}
}

const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function sortMyHand() { myHand.sort((a,b) => rankOrder.indexOf(a) - rankOrder.indexOf(b)); }

function generateShortCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = '';
    for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

let myToken; try { myToken = sessionStorage.getItem('kaddab_token'); if(!myToken) { myToken = Math.random().toString(36).substr(2); sessionStorage.setItem('kaddab_token', myToken); } } catch(e) { myToken = Math.random().toString(36).substr(2); }

// تمت إضافة roundPotCount لتتبع الجولة الحالية
let peer, conn, connections = [];
let gameState = { players: [], currentPlayer: 0, pot: [], currentClaim: "", lastPlayer: -1, lastPlayCount: 0, actionLog: "", winner: null, bluffEventId: 0, gameStarted: false, roundPotCount: 0 };
let hostHandBackup = {}; let isHost = false, myHand = [], selected = [], myIndex = 0, myName = ""; let processedBluffIds = []; let lobbyPlayers = [];

function getPlayerName() { return document.getElementById('player-name').value.trim() || `لاعب ${Math.floor(Math.random() * 100)}`; }

function updateLobbyUI() {
    document.getElementById('peer-count').innerText = lobbyPlayers.length;
    const listEl = document.getElementById('lobby-players-list'); listEl.innerHTML = '';
    lobbyPlayers.forEach(p => {
        let tag = document.createElement('div'); tag.className = 'lobby-player-tag'; tag.innerText = p.name;
        if(isHost && p.token !== myToken) {
            let kick = document.createElement('span'); kick.className = 'kick-btn'; kick.innerText = '✕';
            kick.onclick = () => kickPlayer(p.token); tag.appendChild(kick);
        }
        listEl.appendChild(tag);
    });
}

function kickPlayer(token) {
    let connToKick = connections.find(c => c.playerToken === token);
    if(connToKick) { connToKick.send({ type: 'KICKED' }); setTimeout(() => { connToKick.close(); connections = connections.filter(c => c.playerToken !== token); broadcastLobby(); }, 500); }
}

function broadcastLobby() {
    if(isHost) {
        connections = connections.filter(c => c.open);
        lobbyPlayers = [{name: myName, token: myToken}, ...connections.map(c => ({name: c.playerName, token: c.playerToken}))];
        updateLobbyUI(); connections.forEach(c => { try { c.send({ type: 'LOBBY_UPDATE', players: lobbyPlayers }); } catch(e){} });
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
        else if (data.type === 'LOBBY_UPDATE') { lobbyPlayers = data.players; updateLobbyUI(); }
        else if (data.type === 'REJECTED') { showModal("مغلقة 🔒", "اللعبة بدأت بالفعل وما تقدر تدخل الحين", "error"); if(peer) peer.destroy(); }
        else if (data.type === 'KICKED') { showModal("مطرود 👢", "تم طردك من الغرفة.", "error"); setTimeout(()=>location.reload(), 2000); }
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
        else if (data.type === 'BIG_EVENT') { playSound(data.sound); showBigAction(data.text, data.color); closeClaimModal(); }
        else if (data.type === 'BACK_TO_LOBBY') { resetToLobby(data.players); }
    });
    c.on('close', () => { connections = connections.filter(cli => cli !== c); if(!gameState.gameStarted) broadcastLobby(); });
}

function startHost() { 
    initAudio(); myName = getPlayerName(); isHost = true; lobbyPlayers = [{name: myName, token: myToken}]; updateLobbyUI(); 
    document.getElementById('initial-setup').style.display = 'none'; document.getElementById('waiting-area').style.display = 'block'; document.getElementById('start-game-btn').style.display = 'block'; 
    const shortId = generateShortCode(); peer = new Peer(shortId); peer.on('open', id => { document.getElementById('room-code').innerText = id; }); peer.on('connection', c => setupConn(c)); 
}
function joinRoom() { 
    initAudio(); myName = getPlayerName(); const hostId = document.getElementById('join-id').value.trim().toUpperCase(); 
    if(!hostId) return showModal("تنبيه", "أدخل الكود!", "error"); document.getElementById('initial-setup').innerHTML = "<h2>جاري البحث... ⏳</h2>"; 
    peer = new Peer(); peer.on('open', id => { conn = peer.connect(hostId); setupConn(conn); conn.on('open', () => conn.send({ type: 'HELLO_HOST', name: myName, token: myToken })); }); peer.on('error', () => { showModal("خطأ", "الكود خطأ!", "error"); setTimeout(()=>location.reload(), 2000); }); 
}

function broadcastStart() {
    if(!isHost) return; playSound('play'); gameState.gameStarted = true;
    let playersArr = [{ name: myName, token: myToken, conn: null }]; connections.forEach(c => playersArr.push({ name: c.playerName, token: c.playerToken, conn: c })); playersArr.sort(() => Math.random() - 0.5);
    gameState.players = playersArr.map((p, i) => ({ index: i, name: p.name, token: p.token, cardCount: 0, lastAction: null }));
    
    let deck = []; rankOrder.forEach(r => { for(let i=0; i<8; i++) deck.push(r); }); deck.sort(() => Math.random() - 0.5);
    let hands = Array.from({length: playersArr.length}, () => []); let pIdx = 0; while(deck.length > 0) { hands[pIdx % playersArr.length].push(deck.pop()); pIdx++; }
    playersArr.forEach((p, i) => gameState.players[i].cardCount = hands[i].length);

    gameState.pot = []; gameState.currentClaim = ""; gameState.lastPlayer = -1; gameState.actionLog = "بدأت اللعبة! 🃏"; gameState.winner = null; gameState.roundPotCount = 0;
    playersArr.forEach((p, i) => { hostHandBackup[p.token] = hands[i]; if(p.conn) { try { p.conn.send({ type: 'START', hand: hands[i], state: gameState, yourIndex: i }); } catch(e){} } else { myHand = hands[i]; myIndex = i; sortMyHand(); } });
    
    document.getElementById('lobby').style.display = 'none'; document.getElementById('table-area').style.display = 'flex'; document.getElementById('hand-container').style.display = 'flex'; document.getElementById('status-bar').style.display = 'block'; document.getElementById('action-log').style.display = 'block'; document.getElementById('win-modal').style.display = 'none';
    render();
}

function checkWin() { let winnerPlayer = gameState.players.find(p => p.cardCount === 0 && gameState.lastPlayer !== p.index); if(winnerPlayer) gameState.winner = winnerPlayer.name; }

function sendBigEventToAll(text, color, sound) {
    let eventData = { type: 'BIG_EVENT', text, color, sound }; closeClaimModal();
    if(isHost) { playSound(sound); showBigAction(text, color); connections.forEach(c => { try { c.send(eventData); } catch(e){} }); } 
    else { playSound(sound); showBigAction(text, color); try { conn.send(eventData); } catch(e){} }
}

function clearNextPlayerAction() { let nextIdx = (gameState.currentPlayer + 1) % gameState.players.length; gameState.players[nextIdx].lastAction = null; }

function initiatePlay() {
    if(gameState.currentPlayer !== myIndex) return showModal("تنبيه", "مب دورك يا بطل!", "error");
    if(selected.length === 0) return showModal("تنبيه", "اختر ورقة على الأقل!", "error");
    if(!gameState.currentClaim) { document.getElementById('claim-modal').style.display = 'flex'; } 
    else { finalizePlay(gameState.currentClaim); }
}

function finalizePlay(claimRank) {
    closeClaimModal();
    if(!gameState.currentClaim) {
        gameState.currentClaim = claimRank;
        gameState.roundPotCount = selected.length;
    } else {
        gameState.roundPotCount += selected.length;
    }

    playSound('play');
    let played = []; selected.sort((a,b)=>b-a).forEach(idx => played.push(myHand.splice(idx, 1)[0]));
    
    gameState.players[myIndex].cardCount -= played.length;
    gameState.players[myIndex].lastAction = { text: "نزل " + played.length + " 🎴", type: "play" };
    gameState.pot.push(...played); gameState.lastPlayer = myIndex; gameState.lastPlayCount = played.length; 
    let nextPlayerName = gameState.players[(myIndex + 1) % gameState.players.length].name;
    gameState.actionLog = `🃏 ${myName} نزل [${played.length}] أوراق على أنها (${gameState.currentClaim}) ➡️ الدور عند ${nextPlayerName}`;
    
    clearNextPlayerAction(); gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length; selected = []; 
    checkWin(); try { if(!isHost) conn.send({ type: 'BACKUP_HAND', token: myToken, hand: myHand }); else hostHandBackup[myToken] = myHand; } catch(e){} syncData();
}

function passTurn() {
    if(gameState.currentPlayer !== myIndex) return;
    if(gameState.lastPlayer === -1 || gameState.pot.length === 0) return showModal("تنبيه", "الطاولة فاضية، ما تقدر تسوي Pass!", "error");
    let nextPlayerName = gameState.players[(myIndex + 1) % gameState.players.length].name;
    gameState.actionLog = `💨 ${myName} سوّى PASS ➡️ الدور عند ${nextPlayerName}`;
    gameState.players[myIndex].lastAction = { text: "Pass 💨", type: "pass" };
    
    gameState.currentClaim = ""; gameState.lastPlayer = -1; gameState.roundPotCount = 0;
    
    clearNextPlayerAction();
    gameState.currentPlayer = (gameState.currentPlayer + 1) % gameState.players.length; selected = []; closeClaimModal();
    sendBigEventToAll(`💨 ${myName}\nسوّى PASS!`, '#00f3ff', 'big_pass');
    checkWin(); syncData();
}

function callBluff() {
    if(gameState.pot.length === 0 || gameState.lastPlayer === -1 || gameState.lastPlayer === myIndex) return;
    let lastPlayedCards = gameState.pot.slice(-gameState.lastPlayCount); let isLying = lastPlayedCards.some(c => c !== gameState.currentClaim); let targetIndex = isLying ? gameState.lastPlayer : myIndex;
    gameState.players[myIndex].lastAction = { text: "كذّب 🚨", type: "bluff" };
    sendBigEventToAll(`🚨 ${myName}\nكذّب ${gameState.players[gameState.lastPlayer].name}!`, '#ff2a2a', 'big_bluff');

    setTimeout(() => {
        if(isLying) { gameState.currentPlayer = myIndex; gameState.players[targetIndex].lastAction = { text: "انقفط 🤥", type: "caught" }; gameState.actionLog = `💥 ${myName} كشف كذبة ${gameState.players[targetIndex].name} بنجاح!`; } 
        else { gameState.currentPlayer = gameState.lastPlayer; gameState.players[gameState.lastPlayer].lastAction = { text: "صادق 😇", type: "play" }; gameState.actionLog = `🤦‍♂️ ${myName} ظلم ${gameState.players[gameState.lastPlayer].name} والصادق يكمل!`; }
        gameState.players.forEach(p => { if(p.index !== myIndex && p.index !== gameState.lastPlayer) p.lastAction = null; });
        gameState.bluffEventId = Math.random(); gameState.potToGive = { target: targetIndex, cards: [...gameState.pot] }; gameState.players[targetIndex].cardCount += gameState.pot.length;
        
        gameState.pot = []; gameState.currentClaim = ""; gameState.lastPlayer = -1; gameState.roundPotCount = 0;
        
        if(targetIndex === myIndex) { myHand.push(...gameState.potToGive.cards); sortMyHand(); processedBluffIds.push(gameState.bluffEventId); try { if(!isHost) conn.send({ type: 'BACKUP_HAND', token: myToken, hand: myHand }); else hostHandBackup[myToken] = myHand; } catch(e){} }
        closeClaimModal(); checkWin(); syncData();
    }, 1200); 
}

function syncData() { if(isHost) { connections.forEach(c => { try { c.send({ type: 'UPDATE', state: gameState }); } catch(e){} }); } else { try { conn.send({ type: 'UPDATE', state: gameState }); } catch(e){} } render(); }

function playAgain() { if(!isHost) return; gameState.gameStarted = false; broadcastLobby(); resetToLobby(lobbyPlayers); connections.forEach(c => { try { c.send({ type: 'BACK_TO_LOBBY', players: lobbyPlayers }); } catch(e){} }); }

function resetToLobby(players) {
    lobbyPlayers = players; document.getElementById('win-modal').style.display = 'none'; document.getElementById('table-area').style.display = 'none'; document.getElementById('hand-container').style.display = 'none'; document.getElementById('status-bar').style.display = 'none'; document.getElementById('action-log').style.display = 'none';
    document.getElementById('lobby').style.display = 'flex'; document.getElementById('initial-setup').style.display = 'none'; document.getElementById('waiting-area').style.display = 'block';
    if(isHost) { document.getElementById('start-game-btn').style.display = 'block'; document.getElementById('start-game-btn').disabled = false; }
    updateLobbyUI();
}

function render() {
    if(gameState.winner) {
        playSound('win'); document.getElementById('win-body').innerText = `${gameState.winner} خلص أوراقه وفاز باللعبة! 🎉`; document.getElementById('win-modal').style.display = 'flex';
        if(isHost) { document.getElementById('btn-play-again').style.display = 'block'; document.getElementById('wait-host-msg').style.display = 'none'; } else { document.getElementById('btn-play-again').style.display = 'none'; document.getElementById('wait-host-msg').style.display = 'block'; }
        return;
    }

    document.getElementById('action-log').innerText = gameState.actionLog || "بانتظار الحركة الأولى...";
    document.getElementById('my-count-val').innerText = myHand.length;

    const handEl = document.getElementById('my-hand'); handEl.innerHTML = '';
    myHand.forEach((card, idx) => {
        const c = document.createElement('div'); c.className = `card ${selected.includes(idx)?'selected':''}`;
        c.innerHTML = `<span>${card}</span><span style="align-self:flex-end; transform:rotate(180deg)">${card}</span>`;
        c.onclick = () => { playSound('pass'); selected.includes(idx) ? selected.splice(selected.indexOf(idx), 1) : selected.push(idx); render(); };
        handEl.appendChild(c);
    });

    const status = document.getElementById('status-bar');
    if(gameState.currentPlayer === myIndex) { 
        let statusText = gameState.currentClaim ? "🔥 دورك! نزل الورق أو سوّ Pass 🔥" : "🔥 دورك! ابدأ لفة جديدة واختر بطاقة 🔥";
        if(status.innerText !== statusText) playSound('turn'); 
        status.innerText = statusText; status.style.color = "#00ff00"; 
    } else { 
        status.innerText = `⏳ بانتظار ${gameState.players[gameState.currentPlayer]?.name} ⏳`; status.style.color = "white"; 
    }

    const claimHolo = document.getElementById('claim-hologram');
    if(gameState.currentClaim) { document.getElementById('claim-target-number').innerText = gameState.currentClaim; claimHolo.style.display = "block"; } else { claimHolo.style.display = "none"; }
    
    const bluffBtn = document.getElementById('btn-bluff'); const passBtn = document.getElementById('btn-pass');
    bluffBtn.disabled = (gameState.pot.length === 0 || gameState.lastPlayer === -1 || gameState.lastPlayer === myIndex);
    passBtn.disabled = (gameState.pot.length === 0 || gameState.lastPlayer === -1); 

    // تفصيل الكومة
    let basePot = gameState.pot.length - gameState.roundPotCount;
    if (gameState.currentClaim && gameState.roundPotCount > 0) {
        if (basePot > 0) {
            document.getElementById('pot-count-badge').innerText = `الكومة: ${basePot} + ${gameState.roundPotCount}`;
        } else {
            document.getElementById('pot-count-badge').innerText = `الكومة: ${gameState.roundPotCount}`;
        }
    } else {
        document.getElementById('pot-count-badge').innerText = `الكومة: ${gameState.pot.length}`;
    }
    
    const potCont = document.getElementById('pot-container'); potCont.innerHTML = '';
    gameState.pot.forEach((_, i) => { const p = document.createElement('div'); p.className = 'pot-card'; p.style.setProperty('--r', `${(i * 17) % 360}deg`); potCont.appendChild(p); });

    const avatarsCont = document.getElementById('avatars-container'); avatarsCont.innerHTML = '';
    let total = gameState.players.length;
    gameState.players.forEach(p => {
        if(p.index === myIndex) return; 
        let relIndex = (p.index - myIndex + total) % total; let angleRad = (90 - (360 / total) * relIndex) * (Math.PI / 180);
        let x = 50 + 45 * Math.cos(angleRad); let y = 50 + 40 * Math.sin(angleRad); 

        const div = document.createElement('div'); div.className = `avatar ${gameState.currentPlayer === p.index ? 'active' : ''}`;
        div.style.left = `${x}%`; div.style.top = `${y}%`;
        let statusTag = p.lastAction ? `<div class="player-status status-${p.lastAction.type}">${p.lastAction.text}</div>` : '';
        div.innerHTML = `<div class="name">${p.name}</div><div class="cards">🎴 ${p.cardCount}</div>${statusTag}`;
        avatarsCont.appendChild(div);
    });
}