import { MockServer } from './core/server/mock_server';
import { SocketClient } from './core/server/socket_client'; // Clientのインポート
import type { ServerAPI } from './core/server/api';
import { CARDS } from './core/cards';
import type { CardId, BattleEvent } from './core/types';
import { generateBattleLog } from './ui_helpers';

// --- 状態 ---
let server: ServerAPI;
let isAnimating = false;
let playerName = "Player";
let myPlayerId: 'p1' | 'p2' = 'p1'; // デフォルトはp1 (CPUモード)
let isLeaving = false;

// --- 画面 ---
const screens = {
  title: document.getElementById('title-screen')!,
  lobby: document.getElementById('lobby-screen')!,
  game: document.getElementById('game-screen')!
};

// --- DOM要素 (ゲーム) ---
const p1HandEl = document.getElementById('p1-hand')!;
const p2HandEl = document.getElementById('p2-hand')!;
const p1SlotEl = document.getElementById('p1-slot')!;
const p2SlotEl = document.getElementById('p2-slot')!;
const p1GrailsEl = document.getElementById('p1-grails')!;
const p2GrailsEl = document.getElementById('p2-grails')!;
const turnCountEl = document.getElementById('turn-count')!;
const phaseTextEl = document.getElementById('phase-text')!;
const logContainerEl = document.getElementById('log-container')!;
const gameOverOverlay = document.getElementById('game-over-overlay')!;
const winnerText = document.getElementById('winner-text')!;
const restartBtn = document.getElementById('restart-btn')!;
const returnTitleBtn = document.getElementById('return-title-btn')!;
const battleResultText = document.getElementById('battle-result-text')!;

// --- DOM要素 (メニュー) ---
const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
const btnCpuBattle = document.getElementById('btn-cpu-battle')!;
const btnOnlineBattle = document.getElementById('btn-online-battle')!;
const btnCreateRoom = document.getElementById('btn-create-room')!;
const btnRefreshRooms = document.getElementById('btn-refresh-rooms')!;
const btnBackTitle = document.getElementById('btn-back-title')!;
const roomListEl = document.getElementById('room-list')!;
const waitingMessage = document.getElementById('waiting-message')!;

// --- 効果用オーバーレイ ---
let battleOverlayText: HTMLElement;

// --- ヘルパー: 画面遷移 ---
function showScreen(screenName: keyof typeof screens) {
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

// --- 初期化 ---
function initApp() {
  // イベントリスナー
  btnCpuBattle.onclick = startCpuBattle;
  btnOnlineBattle.onclick = showLobby;
  btnCreateRoom.onclick = createRoom;
  btnRefreshRooms.onclick = refreshRoomList;
  btnBackTitle.onclick = () => showScreen('title');
  
  restartBtn.onclick = () => {
    // オンラインの場合、再戦リクエスト
    if (server instanceof SocketClient) {
        restartBtn.setAttribute('disabled', 'true');
        restartBtn.textContent = '相手の応答を待っています... (30)';
        
        server.requestRematch();
        
        // 30秒カウントダウン開始
        const endTime = Date.now() + 30000;
        const interval = setInterval(() => {
            const remaining = Math.ceil((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                clearInterval(interval);
                 if (!restartBtn.disabled) return; // すでに開始済みの場合

                // タイムアウト
                alert("相手からの応答がありませんでした。タイトルに戻ります。");
                server.leaveRoom();
                showScreen('title');
            } else {
                restartBtn.textContent = `相手の応答を待っています... (${remaining})`;
            }
        }, 1000);

        // ゲーム開始時にインターバルをクリアするために、onGameStart内で処理が必要
        // 簡易的に restartBtn.dataset にIDを保存して管理
        restartBtn.dataset.intervalId = interval.toString();

    } else {
        // CPU戦は即座にリセット
        server.resetGame().then(() => initGame(undefined, myPlayerId));
    }
  };
  
  returnTitleBtn.onclick = () => {
      isLeaving = true;
      
      // インターバル停止
      if (restartBtn.dataset.intervalId) {
         clearInterval(Number(restartBtn.dataset.intervalId));
         restartBtn.dataset.intervalId = '';
      }
      
      if (server instanceof SocketClient) {
          server.leaveRoom();
      }
      showScreen('title');
  };
}

// Global listener helper
function setupSocketListeners(client: SocketClient) {
    client.onGameStart((data) => {
         console.log("ゲーム開始!", data);
         waitingMessage.classList.add('hidden');
         
         // リセットボタンの状態をクリア
         if (restartBtn.dataset.intervalId) {
             clearInterval(Number(restartBtn.dataset.intervalId));
             restartBtn.dataset.intervalId = '';
         }
         restartBtn.removeAttribute('disabled');
         restartBtn.textContent = 'もう一度勝負する';
         
         // 自分のIDを決定
         // data: { roomId, p1: socketId, p2: socketId, gameState }
         myPlayerId = client.getMyPlayerId(data.p1, data.p2);
         console.log(`私は ${myPlayerId} です`);

         initGame(data.gameState, myPlayerId); 
         showScreen('game');
    });

    client.onOpponentLeft(() => {
        if (isLeaving) return; // 自分が退出した場合は無視
        alert("対戦相手が退出しました。タイトルに戻ります。");
        showScreen('title');
        // 必要なら自分も退出処理
        client.leaveRoom(); 
    });
}

async function startCpuBattle() {
  playerName = nameInput.value || "Player";
  server = new MockServer();
  myPlayerId = 'p1'; // CPU戦は常にP1
  await initGame(undefined, 'p1');
  showScreen('game');
}

async function showLobby() {
  playerName = nameInput.value || "Player";
  // 必要に応じてSocket Clientを初期化
  if (!(server instanceof SocketClient)) {
     server = new SocketClient();
     // グローバルリスナーの設定
     setupSocketListeners(server as SocketClient);
  }
  showScreen('lobby');
  refreshRoomList();
}

async function refreshRoomList() {
    if (server instanceof SocketClient) {
        roomListEl.innerHTML = '<div class="room-item">ロード中...</div>';
        const rooms = await server.listRooms();
        renderRoomList(rooms);
    }
}

function renderRoomList(rooms: any[]) {
    roomListEl.innerHTML = '';
    if (rooms.length === 0) {
        roomListEl.innerHTML = '<div class="room-item empty-message">ルームが見つかりません。作成してください！</div>';
        return;
    }
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-item';
        // ホスト名とルームIDを表示
        item.innerHTML = `
            <span>${room.hostName || '不明'} (ID: ${room.id.substring(0, 4)})</span>
            <button class="menu-btn small" data-id="${room.id}">参加</button>
        `;
        item.querySelector('button')!.onclick = () => joinRoom(room.id);
        roomListEl.appendChild(item);
    });
}

async function createRoom() {
    if (server instanceof SocketClient) {
        btnCreateRoom.setAttribute('disabled', 'true'); // ボタンを無効化
        waitingMessage.textContent = 'ルームを作成中...';
        const roomId = await server.createRoom(playerName);
        waitingMessage.textContent = `対戦相手を待っています... (ルームID: ${roomId.substring(0, 4)})`;
        waitingMessage.classList.remove('hidden');
        // 待機中は操作不能にする
    }
}

function joinRoom(roomId: string) {
    if (server instanceof SocketClient) {
        server.joinRoom(roomId, playerName);
    }
}

// --- ゲームロジック (リファクタリング済み) ---
async function initGame(initialState?: any, playerId: 'p1' | 'p2' = 'p1') {
  isAnimating = false;
  isLeaving = false; 
  myPlayerId = playerId;
  
  // リセットボタンの初期化
  restartBtn.removeAttribute('disabled');
  restartBtn.textContent = 'もう一度勝負する';
  if (restartBtn.dataset.intervalId) {
      clearInterval(Number(restartBtn.dataset.intervalId));
      restartBtn.dataset.intervalId = '';
  }
  
  // オーバーレイの確認
  if (!document.getElementById('battle-overlay-text')) {
    const el = document.createElement('div');
    el.id = 'battle-overlay-text';
    document.querySelector('.battle-area')!.appendChild(el);
  }
  battleOverlayText = document.getElementById('battle-overlay-text')!;

  gameOverOverlay.classList.add('hidden');
  battleResultText.textContent = '';
  battleResultText.className = 'battle-result-text'; 
  
  p1SlotEl.innerHTML = '<div class="card-placeholder">あなたのスロット</div>';
  p2SlotEl.innerHTML = '<div class="card-placeholder">相手のスロット</div>';
  p1SlotEl.classList.remove('active');
  p2SlotEl.classList.remove('active');
  
  logContainerEl.innerHTML = ''; // 新しいゲームでログを消去

  let state = initialState;
  if (!state) {
      // 状態が提供されない場合、サーバーから取得を試みる (主にCPUモード用)
      state = await server.resetGame();
  }

  updateDisplay(state); 
}

function updateDisplay(state: any) {
  turnCountEl.textContent = state.turn.toString();
  phaseTextEl.textContent = state.phase.toUpperCase();

  // myPlayerIdに基づいてUIに状態をマッピング
  // 自分の状態
  const myState = state.players[myPlayerId];
  // 相手の状態
  const oppId = myPlayerId === 'p1' ? 'p2' : 'p1';
  const oppState = state.players[oppId];

  // 聖杯 (P1 UI要素 = 自分, P2 UI要素 = 相手)
  p1GrailsEl.textContent = myState.grails.toString();
  p2GrailsEl.textContent = oppState.grails.toString();

  // 自分の手札 (下側) -> p1HandEl
  p1HandEl.innerHTML = '';
  myState.hand.forEach((cardId: CardId) => {
    const cardEl = createCardElement(cardId, true);
    cardEl.onclick = () => onCardClick(cardId, cardEl);
    p1HandEl.appendChild(cardEl);
  });

  // 相手の手札 (上側) -> p2HandEl
  p2HandEl.innerHTML = '';
  oppState.hand.forEach(() => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card face-down';
    cardEl.textContent = '?'; 
    p2HandEl.appendChild(cardEl);
  });
}

function createCardElement(cardId: CardId, faceUp: boolean): HTMLElement {
  const cardData = CARDS[cardId];
  const el = document.createElement('div');
  el.className = `card ${faceUp ? 'face-up' : 'face-down'}`;

  if (faceUp) {
    el.innerHTML = `
      <div class="card-rank">${cardData.basePower}</div>
      <div class="card-name">${cardData.name}</div>
      <div class="card-desc">${cardData.description}</div>
    `;
  }
  return el;
}

function addLog(message: string, isImportant = false) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  if (isImportant) div.style.color = 'var(--accent-gold)';
  div.textContent = message;
  logContainerEl.insertBefore(div, logContainerEl.firstChild);
}

// --- カード操作 ---
async function onCardClick(cardId: CardId, cardEl: HTMLElement) {
  if (isAnimating) return;
  isAnimating = true;

  // 1. スロットへのアニメーション (自分のスロット = p1SlotEl, 下側のスロット)
  const rect = cardEl.getBoundingClientRect();
  const slotRect = p1SlotEl.getBoundingClientRect();
  
  const clone = cardEl.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.classList.add('animating-card');
  document.body.appendChild(clone);

  cardEl.style.opacity = '0';

  const tx = slotRect.left - rect.left + (slotRect.width - rect.width) / 2;
  const ty = slotRect.top - rect.top + (slotRect.height - rect.height) / 2;

  clone.style.transform = `translate(${tx}px, ${ty}px)`;

  await new Promise(r => setTimeout(r, 500));

  p1SlotEl.innerHTML = '';
  const slotCard = createCardElement(cardId, true);
  p1SlotEl.appendChild(slotCard);
  clone.remove();

  // 2. サーバーリクエスト
  phaseTextEl.textContent = "待機中...";
  
  // myPlayerId を使用
  const response = await server.playCard(myPlayerId, cardId);

  // 3. 相手のアニメーション (相手のスロット = p2SlotEl, 上側のスロット)
  const oppCardId = response.opponentCard;
  p2SlotEl.innerHTML = '';
  
  const enemyHandRect = p2HandEl.getBoundingClientRect();
  const enemySlotRect = p2SlotEl.getBoundingClientRect();

  const enemyClone = document.createElement('div');
  enemyClone.className = 'card face-down animating-card';
  enemyClone.textContent = '?';
  enemyClone.style.left = `${enemyHandRect.left + enemyHandRect.width / 2 - 50}px`; 
  enemyClone.style.top = `${enemyHandRect.top}px`;
  enemyClone.style.width = '110px';
  enemyClone.style.height = '170px';
  document.body.appendChild(enemyClone);

  const etx = enemySlotRect.left - parseFloat(enemyClone.style.left);
  const ety = enemySlotRect.top - parseFloat(enemyClone.style.top);
  
  requestAnimationFrame(() => {
      enemyClone.style.transform = `translate(${etx}px, ${ety}px)`;
  });

  await new Promise(r => setTimeout(r, 600));

  p2SlotEl.innerHTML = '';
  const p2SlotCard = createCardElement(oppCardId, true);
  p2SlotEl.appendChild(p2SlotCard);
  enemyClone.remove();

  // 4. バトル開始
  battleOverlayText.textContent = "BATTLE!";
  battleOverlayText.classList.add('show');
  await new Promise(r => setTimeout(r, 1000));
  battleOverlayText.classList.remove('show');

  // 5. イベント処理
  for (const event of response.events) {
    await processEvent(event);
  }

  // ログ
  // プレイヤー相対でログを出したい？
  // 現在 generateBattleLog は内部ロジックを使用しています。
  // 実際の p1/p2 カードを渡しましょう。
  const globalP1Card = myPlayerId === 'p1' ? cardId : oppCardId;
  const globalP2Card = myPlayerId === 'p2' ? cardId : oppCardId;

  const logMessages = generateBattleLog(response.battleResult, response.gameState.turn - 1, globalP1Card, globalP2Card);
  logMessages.forEach(msg => addLog(msg));

  // 6. 結果
  const winner = response.battleResult.winner;
  
  let resultText = '';
  let resultClass = '';
  
  if (winner === 'draw') {
      resultText = 'DRAW';
      resultClass = 'draw';
  } else if (winner === myPlayerId) {
      resultText = 'WIN!';
      resultClass = 'win';
  } else {
      resultText = 'LOSE...';
      resultClass = 'lose';
  }

  battleResultText.textContent = resultText;
  battleResultText.className = `battle-result-text ${resultClass} fade-in`;

  await new Promise(r => setTimeout(r, 1500));

  // 7. クリーンアップ
  battleResultText.classList.remove('fade-in');
  battleResultText.textContent = '';
  p1SlotEl.innerHTML = '<div class="card-placeholder">あなたのスロット</div>';
  p2SlotEl.innerHTML = '<div class="card-placeholder">相手のスロット</div>';

  updateDisplay(response.gameState);
  isAnimating = false;

  if (response.gameState.phase === 'gameover') {
    await new Promise(r => setTimeout(r, 1000));
    showGameOver(response.gameState);
  }
}

async function processEvent(event: BattleEvent) {
  if (event.type === 'effect_activation') {
    addLog(`[効果] ${event.message}`, true);
    p1SlotEl.classList.add('active');
    p2SlotEl.classList.add('active');
    await new Promise(r => setTimeout(r, 500));
    p1SlotEl.classList.remove('active');
    p2SlotEl.classList.remove('active');
  } else if (event.type === 'rule_change') {
    addLog(`[ルール] ${event.message}`, true);
    await new Promise(r => setTimeout(r, 500));
  } else if (event.type === 'grail_transfer') {
    // 移動の処理
    // payload.player === myPlayerId の場合 -> 対象は p1GrailsEl (自分)
    
    const isMe = event.payload.player === myPlayerId;
    const targetEl = isMe ? p1GrailsEl : p2GrailsEl;
    
    // アニメーションの発生源: 
    // 自分が得るなら相手のスロット、相手が得るなら自分のスロット
    // (奪うという演出)
    // ただし、単純化のため、増える時は相手側から飛んでくるようにする
    
    // 発生源:
    const startEl = isMe ? p2SlotEl : p1SlotEl; 
    
    if (event.payload.amount > 0) {
        flyGrail(startEl, targetEl);
    }
    
    await new Promise(r => setTimeout(r, 800));
  }
}

function flyGrail(fromEl: HTMLElement, toEl: HTMLElement) {
  const grail = document.createElement('div');
  grail.className = 'flying-grail';
  grail.textContent = '🏆';
  
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  grail.style.left = `${fromRect.left + 50}px`;
  grail.style.top = `${fromRect.top + 50}px`;
  document.body.appendChild(grail);

  requestAnimationFrame(() => {
    grail.style.top = `${toRect.top}px`;
    grail.style.left = `${toRect.left}px`;
    grail.style.opacity = '0';
  });

  setTimeout(() => grail.remove(), 1000);
}

function showGameOver(state: any) {
  gameOverOverlay.classList.remove('hidden');
  const isWin = state.winner === myPlayerId;
  const isDraw = state.winner === 'draw';
  
  const winnerTextContent = isDraw ? '引き分け' : (isWin ? 'あなたの勝利！' : 'あなたの敗北...');
  
  const myGrails = state.players[myPlayerId].grails;
  const enemGrails = state.players[myPlayerId === 'p1' ? 'p2' : 'p1'].grails;
  
  winnerText.textContent = `${winnerTextContent} (あなた: ${myGrails} - 相手: ${enemGrails})`;
}

// 開始
initApp();
