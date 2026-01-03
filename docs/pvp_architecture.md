# PvP アーキテクチャと通信フロー

## 1. 全体アーキテクチャ

本アプリケーションのPvP機能は、Docker環境上で動作するクライアント・サーバーモデルを採用しています。

### コンテナ構成
- **app (Client)**: Vite + TypeScriptで動作するフロントエンド。ポート5173。
- **server (Backend)**: Node.js + Socket.IOで動作するバックエンド。ポート3000。
- **Shared Core**: ゲームロジック（`src/core`）は両コンテナ間で共有（Docker Volumeマウント）されており、ロジックの二重管理を防いでいます。

```mermaid
graph LR
    User[ユーザー] --> App[App Container (Client)]
    App -- Socket.IO (ws://localhost:3000) --> Server[Server Container (Backend)]
    
    subgraph Docker Environment
        App
        Server
        Core[Shared Core Logic (src/core)]
        App -.-> Core
        Server -.-> Core
    end
```

## 2. モジュール構成

### クライアントサイド (`src/`)
- **`main.ts`**: UI操作、ゲーム進行のメインループ、SocketClientの呼び出し。
- **`core/server/socket_client.ts`**: Socket.IO通信のラッパー。`ServerAPI` インターフェースを実装し、通信詳細を隠蔽。

### サーバーサイド (`server/src/`)
- **`index.ts`**: エントリポイント。ルーム管理、Socketイベントのハンドリング、GameEngineの実行を担当。

### 共通ロジック (`src/core/`)
- **`engine.ts`**: `GameEngine` クラス。カード効果の適用、勝敗判定、状態遷移を行う純粋なTypeScriptロジック。
- **`types.ts`**: ゲームの状態 (`GameState`) やカードIDなどの型定義。

## 3. 通信フロー

### 3.1 ルーム作成と参加

```mermaid
sequenceDiagram
    participant P1 as Player 1 (Host)
    participant S as Server
    participant P2 as Player 2 (Guest)

    P1->>S: create_room(playerName)
    S-->>P1: room_created(roomId)
    Note over S: Roomオブジェクト作成<br>HostId記録

    P2->>S: list_rooms()
    S-->>P2: room_list([RoomInfo...])
    
    P2->>S: join_room(roomId, playerName)
    Note over S: ルームID照合<br>GuestId記録<br>GameEngine初期化
    
    S-->>P1: game_start({ p1, p2, gameState })
    S-->>P2: game_start({ p1, p2, gameState })
    
    Note over P1, P2: クライアントで `myPlayerId` を特定<br>('p1' or 'p2')
```

### 3.2 ターン進行 (カードプレイ)

以下のフローは、プレイヤーがカードを選択してから、結果が表示されるまでの流れです。

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant S as Server
    participant P2 as Player 2

    Note over P1: カード選択 (クリック)
    P1->>S: play_card({ roomId, cardId, playerId: 'p1' })
    Note over S: Engine.playCard('p1', cardId)<br>P2の行動待ち...

    Note over P2: カード選択 (クリック)
    P2->>S: play_card({ roomId, cardId, playerId: 'p2' })
    Note over S: Engine.playCard('p2', cardId)<br>両者プレイ完了！

    Note over S: Engine.resolveTurn()<br>1. 勝敗判定<br>2. 効果発動<br>3. 状態更新

    par Broadcast Results
        S-->>P1: turn_result({ opponentCard, result, events, newState })
        S-->>P2: turn_result({ opponentCard, result, events, newState })
    end

    Note over P1, P2: 結果アニメーション<br>状態同期
```

### 3.3 ゲーム終了判定

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    Note over S: resolveTurn() 完了
    
    alt 最終ターン (Max Turns) ?
        S->>S: Engine.checkGameOver()
        Note over S: Phase -> 'gameover'<br>Winner設定
    end

    S-->>C: turn_result (with phase: 'gameover')
    Note over C: 結果表示後<br>phaseを確認
    
    opt Phase is 'gameover'
        C->>C: showGameOver(state)
        Note over C: 勝敗画面オーバーレイ表示
    end
```

## 4. データ構造

### GameState
```typescript
interface GameState {
  turn: number;          // 現在のターン数
  phase: 'selection' | 'resolution' | 'gameover';
  players: {
    p1: PlayerState;
    p2: PlayerState;
  };
  winner: PlayerId | 'draw' | null;
}
```

### TurnResponse (サーバーからのレスポンス)
```typescript
interface TurnResponse {
  opponentCard: CardId;      // 相手が出したカード (この時点で公開)
  battleResult: BattleResult; // { winner, p1Power, p2Power ... }
  events: BattleEvent[];      // [ { type: 'effect', ... }, { type: 'grail', ... } ]
  gameState: GameState;       // 更新後の最新状態
}
```

## 5. 技術的なポイント

- **非同期解決**: クライアントは `await server.playCard(...)` でサーバーの応答（全員が出し終わるまで）を待ちます。この間、UIは「待機中」となります。
- **視点分離**: クライアントは `getMyPlayerId` を使用して、サーバーから送られてくる共通の `GameState` を「自分視点」に変換して描画します（例: p1ならp1Handを表示、p2ならp2Handを目隠し）。
- **共通ロジック**: `GameEngine` は純粋な関数として実装され、サーバー（本番）でもクライアント（CPU戦/モック）でも全く同じロジックが動作します。
