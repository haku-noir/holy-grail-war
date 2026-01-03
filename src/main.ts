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
let currentGameState: any = null;
let isHandOpenLocal = true; // CPU戦用の設定

// --- 画面 ---
const screens = {
  title: document.getElementById('title-screen')!,
  lobby: document.getElementById('lobby-screen')!,
  cpuSetup: document.getElementById('cpu-setup-screen')!,
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
const btnToCpuSetup = document.getElementById('btn-to-cpu-setup')!;
const btnOnlineBattle = document.getElementById('btn-online-battle')!;
const btnCreateRoom = document.getElementById('btn-create-room')!;
const btnRefreshRooms = document.getElementById('btn-refresh-rooms')!;
const btnBackTitle = document.getElementById('btn-back-title')!;
const roomListEl = document.getElementById('room-list')!;
const waitingMessage = document.getElementById('waiting-message')!;
const chkHandOpenCpu = document.getElementById('chk-hand-open-cpu') as HTMLInputElement;
const chkHandOpenOnline = document.getElementById('chk-hand-open-online') as HTMLInputElement;

// --- DOM要素 (CPU設定) ---
const btnStartCpuBattle = document.getElementById('btn-start-cpu-battle')!;
const btnBackFromCpu = document.getElementById('btn-back-from-cpu')!;
const levelBtns = document.querySelectorAll('.level-btn');
const levelDesc = document.getElementById('level-desc')!;

// --- 設定 ---
let selectedCpuLevel: any = 1; // 1 | 2 | 3 (Type to be imported)

// --- 効果用オーバーレイ ---
let battleOverlayText: HTMLElement;

// --- ヘルパー: 画面遷移 ---
function showScreen(screenName: keyof typeof screens) {
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

// --- ツールチップ要素 ---
let tooltipEl: HTMLElement;

// --- 初期化 ---
function initApp() {
  // ツールチップ作成
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'card-preview-tooltip hidden';
  document.body.appendChild(tooltipEl);

  // ログコンテナでのイベントデリゲーション (ツールチップ用)
  logContainerEl.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('log-card-name')) {
      const cardId = Number(target.dataset.cardId) as CardId;
      showTooltip(cardId, e.clientX, e.clientY);
    }
  });

  logContainerEl.addEventListener('mouseout', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('log-card-name')) {
      hideTooltip();
    }
  });

  logContainerEl.addEventListener('mousemove', (e) => {
     if (!tooltipEl.classList.contains('hidden')) {
        updateTooltipPosition(e.clientX, e.clientY);
     }
  });

  // イベントリスナー
  btnToCpuSetup.onclick = () => showScreen('cpuSetup');
  btnStartCpuBattle.onclick = startCpuBattle;
  btnBackFromCpu.onclick = () => showScreen('title');

  btnOnlineBattle.onclick = showLobby;
  btnCreateRoom.onclick = createRoom;
  btnRefreshRooms.onclick = refreshRoomList;
  btnBackTitle.onclick = () => showScreen('title');
  
  // CPUレベル選択
  levelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
          levelBtns.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedCpuLevel = Number((btn as HTMLElement).dataset.level);
          
          // 説明更新
          let desc = "";
          if (selectedCpuLevel === 1) desc = "Level 1: 完全ランダムに行動します。";
          else if (selectedCpuLevel === 2) desc = "Level 2: その時点で最も勝率の高いカードを選択します。";
          else if (selectedCpuLevel === 3) desc = "Level 3: ゲーム終了までを読み切り、最善手を打ちます。";
          levelDesc.textContent = desc;
      });
  });

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

function showTooltip(cardId: CardId, x: number, y: number) {
  const card = CARDS[cardId];
  // 簡易カード表示
  tooltipEl.innerHTML = `
    <div class="card face-up" style="transform: scale(1); margin: 0;">
      <div class="card-rank">${card.basePower}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${card.description}</div>
    </div>
  `;
  tooltipEl.classList.remove('hidden');
  updateTooltipPosition(x, y);
}

function hideTooltip() {
  tooltipEl.classList.add('hidden');
}

function updateTooltipPosition(x: number, y: number) {
  // 右下に表示するようにオフセット
  const offsetX = 15;
  const offsetY = 15;
  
  // 画面はみ出し防止ロジックを入れると良きだが、まずは簡易実装
  tooltipEl.style.left = `${x + offsetX}px`;
  tooltipEl.style.top = `${y + offsetY}px`;
}

async function startCpuBattle() {
  playerName = nameInput.value || "Player";
  isHandOpenLocal = chkHandOpenCpu.checked; // 設定を反映
  // MockServer creation will be updated to accept level
  // @ts-ignore
  server = new MockServer(selectedCpuLevel);
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
        const status = room.isHandOpen ? '<span style="color:var(--accent-gold)">[Open]</span>' : '<span style="color:var(--text-secondary)">[Blind]</span>';
        item.innerHTML = `
            <span>${room.hostName || '不明'} (ID: ${room.id.substring(0, 4)}) ${status}</span>
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
        const isHandOpen = chkHandOpenOnline.checked;
        const roomId = await server.createRoom(playerName, isHandOpen);
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

// --- ヘルパー: 表示用パワー計算 ---
function getDisplayPower(cardId: CardId, state: any, ownerId: 'p1' | 'p2'): number {
  if (!state) return CARDS[cardId].basePower;

  // サーバーからのレスポンスで型が文字列になっている可能性を考慮して緩い比較を使用、またはキャスト
  const cId = Number(cardId);
  const turn = Number(state.turn);

  if (cId === 5) { // ガウェイン
    // 3ターン目は15
    if (turn === 3) return 15;
  }
  if (cId === 8) { // パロミデス
    // 聖杯が相手より少ない場合 13
    const myGrails = Number(state.players[ownerId].grails);
    const oppId = ownerId === 'p1' ? 'p2' : 'p1';
    const oppGrails = Number(state.players[oppId].grails);
    if (myGrails < oppGrails) return 13;
  }
  return CARDS[cardId].basePower;
}

function updateDisplay(state: any) {
  currentGameState = state;
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
  // 現在のバフ値を取得（本来は「次のターン」用変数だが、解決フェーズ前なのでこのターン適用分）
  const currentBuff = myState.nextTurnBuff || 0;

  myState.hand.forEach((cardId: CardId) => {
    // 状況によるバフ計算
    const displayPower = getDisplayPower(cardId, state, myPlayerId);
    const condBuff = displayPower - CARDS[cardId].basePower;
    const totalBuff = condBuff + currentBuff;

    // バフを渡す
    const cardEl = createCardElement(cardId, true, totalBuff);
    cardEl.onclick = () => onCardClick(cardId, cardEl);
    p1HandEl.appendChild(cardEl);
  });

  // 相手の手札 (上側) -> p2HandEl
  p2HandEl.innerHTML = '';
  
  // 公開設定チェック
  // SocketClient(オンライン)ならstate.configを参照、そうでなければローカル設定
  let shouldShowHand = true; // デフォルト
  if (server instanceof SocketClient) {
      // サーバーからのGameStateにconfigが含まれている場合
      shouldShowHand = state.config?.isHandOpen ?? true;
  } else {
      shouldShowHand = isHandOpenLocal;
  }

  oppState.hand.forEach((cardId: CardId) => {
    if (shouldShowHand) {
        // 公開モード
        const displayPower = getDisplayPower(cardId, state, oppId);
        const condBuff = displayPower - CARDS[cardId].basePower;
        const totalBuff = condBuff + (oppState.nextTurnBuff || 0);

        // バフ表示付きで描画 (操作不可)
        const cardEl = createCardElement(cardId, true, totalBuff);
        // クリック無効化 (念のためスタイルも調整可)
        cardEl.style.cursor = 'default';
        cardEl.dataset.cardId = cardId.toString(); // アニメーション用にIDを付与
        p2HandEl.appendChild(cardEl);
    } else {
        // 非公開モード
        const cardEl = document.createElement('div');
        cardEl.className = 'card face-down';
        cardEl.textContent = '?'; 
        p2HandEl.appendChild(cardEl);
    }
  });
}

function createCardElement(cardId: CardId, faceUp: boolean, buff: number = 0): HTMLElement {
  const cardData = CARDS[cardId];
  const el = document.createElement('div');
  el.className = `card ${faceUp ? 'face-up' : 'face-down'}`;

  if (faceUp) {
    const finalPower = cardData.basePower + buff;
    let rankHtml = `<div class="card-rank">${cardData.basePower}</div>`;
    
    // バフがある場合の表示変更
    if (buff !== 0) {
        const color = buff > 0 ? '#4caf50' : '#ff5252'; // 緑 or 赤
        // レイアウト調整: メイン数値を大きく、元の数値を小さく
        rankHtml = `
            <div class="card-rank" style="color: ${color}; display: flex; align-items: baseline; justify-content: center; gap: 4px;">
                ${finalPower}
                <span style="font-size: 0.6em; color: var(--text-secondary); font-weight: normal;">(${cardData.basePower})</span>
            </div>
        `;
    }

    el.innerHTML = `
      ${rankHtml}
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
  // innerHTMLに変更してリッチテキスト（カード名色付けなど）を許可
  div.innerHTML = message;
  logContainerEl.insertBefore(div, logContainerEl.firstChild);
}

// --- カード操作 ---
async function onCardClick(cardId: CardId, cardEl: HTMLElement) {
  if (isAnimating) return;
  isAnimating = true;

  // バフ値の事前取得 (サーバーリクエストでstateが更新される前に確保)
  const myStateBuff = currentGameState?.players[myPlayerId]?.nextTurnBuff || 0;
  const oppId = myPlayerId === 'p1' ? 'p2' : 'p1';
  const oppStateBuff = currentGameState?.players[oppId]?.nextTurnBuff || 0;

  console.log('Buff Debug:', { 
    turn: currentGameState?.turn,
    myPlayerId, 
    myStateBuff, 
    oppStateBuff
  });

  // 自分のカードの表示用パワー計算
  const myDisplayPower = getDisplayPower(cardId, currentGameState, myPlayerId);
  const myCondBuff = myDisplayPower - CARDS[cardId].basePower;
  const myTotalBuff = myCondBuff + myStateBuff;

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
  // スロットのカードにバフを適用
  const slotCard = createCardElement(cardId, true, myTotalBuff);
  p1SlotEl.appendChild(slotCard);
  clone.remove();

  // 2. サーバーリクエスト
  phaseTextEl.textContent = "待機中...";
  
  // myPlayerId を使用
  const response = await server.playCard(myPlayerId, cardId);

  // 3. 相手のアニメーション (相手のスロット = p2SlotEl, 上側のスロット)
  const oppCardId = response.opponentCard;
  p2SlotEl.innerHTML = '';
  
  // 相手のカードの表示用パワー計算
  const oppDisplayPower = getDisplayPower(oppCardId, currentGameState, oppId);
  const oppCondBuff = oppDisplayPower - CARDS[oppCardId].basePower;
  const oppTotalBuff = oppCondBuff + oppStateBuff;

  const enemySlotRect = p2SlotEl.getBoundingClientRect();

  // 公開設定チェック
  let isOpponentHandOpen = true;
  if (server instanceof SocketClient) {
      isOpponentHandOpen = currentGameState.config?.isHandOpen ?? true;
  } else {
      isOpponentHandOpen = isHandOpenLocal;
  }

  let enemyClone: HTMLElement;

  if (isOpponentHandOpen) {
       // 公開モード: 手札にある該当カードを探してアニメーション
       const sourceCardEl = p2HandEl.querySelector(`[data-card-id="${oppCardId}"]`) as HTMLElement;
       
       if (sourceCardEl) {
           const rect = sourceCardEl.getBoundingClientRect();
           enemyClone = sourceCardEl.cloneNode(true) as HTMLElement;
           
           // 位置合わせ
           enemyClone.style.position = 'fixed';
           enemyClone.style.left = `${rect.left}px`;
           enemyClone.style.top = `${rect.top}px`;
           enemyClone.style.width = `${rect.width}px`;
           enemyClone.style.height = `${rect.height}px`;
           enemyClone.style.margin = '0';
           enemyClone.classList.add('animating-card');
           document.body.appendChild(enemyClone);
           
           // 元のカードを隠す
           sourceCardEl.style.opacity = '0';
       } else {
           // フォールバック: 万が一見つからない場合は以前のロジック
           // (例えば初期状態などで同期ずれがある場合など)
           console.warn("Opponent card element not found for animation fallback.");
           const enemyHandRect = p2HandEl.getBoundingClientRect();
           enemyClone = createCardElement(oppCardId, true, oppTotalBuff);
           enemyClone.style.position = 'fixed'; // createCardElementはstyle返さないのでここで
           enemyClone.classList.add('animating-card'); // fixedはcssで管理されているが念のため
           // 簡易的に手札エリア中央から
           enemyClone.style.left = `${enemyHandRect.left + enemyHandRect.width / 2 - 50}px`;
           enemyClone.style.top = `${enemyHandRect.top}px`;
           document.body.appendChild(enemyClone);
       }
  } else {
      // 非公開モード: 裏向きカードのアニメーション (既存ロジック)
      const enemyHandRect = p2HandEl.getBoundingClientRect();
      enemyClone = document.createElement('div');
      enemyClone.className = 'card face-down animating-card';
      enemyClone.textContent = '?';
      enemyClone.style.left = `${enemyHandRect.left + enemyHandRect.width / 2 - 50}px`; 
      enemyClone.style.top = `${enemyHandRect.top}px`;
      enemyClone.style.width = '110px';
      enemyClone.style.height = '170px';
      document.body.appendChild(enemyClone);
  }

  // アニメーション実行
  // enemyCloneは既にbodyに追加され、初期位置にある状態
  
  // createCardElementで作成した場合のCSS補正が必要な場合があるが、
  // animating-cardクラスでfixedがついているはず。
  
  const etx = enemySlotRect.left - parseFloat(enemyClone.style.left || '0') + (enemySlotRect.width - enemyClone.getBoundingClientRect().width) / 2;
  const ety = enemySlotRect.top - parseFloat(enemyClone.style.top || '0') + (enemySlotRect.height - enemyClone.getBoundingClientRect().height) / 2;
  
  // requestAnimationFrameで確実にスタイル適用後にtransform
  requestAnimationFrame(() => {
     enemyClone.style.transform = `translate(${etx}px, ${ety}px)`;
  });

  await new Promise(r => setTimeout(r, 600));

  p2SlotEl.innerHTML = '';
  const p2SlotCard = createCardElement(oppCardId, true, oppTotalBuff);
  p2SlotCard.classList.add('face-up');
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
  } else if (event.type === 'buff_gain') {
    // バフイベント
    const pid = event.payload.player;
    const amount = event.payload.amount;
    const playerName = pid === myPlayerId ? 'あなた' : '相手';
    const sign = amount > 0 ? '+' : '';
    addLog(`[効果] ${playerName}: 次のターン数値 ${sign}${amount}`);
    await new Promise(r => setTimeout(r, 500));
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
