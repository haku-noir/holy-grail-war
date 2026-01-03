import { Server } from 'socket.io';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { GameEngine } from './core/engine'; 

// 型定義
interface Room {
    id: string;
    hostId: string;
    hostName: string;
    guestId?: string;
    guestName?: string;
    engine?: GameEngine; // 適切なEngineを使用
}

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms: Record<string, Room> = {};
const socketToRoom: Record<string, string> = {}; 

io.on('connection', (socket) => {
    console.log('クライアント接続:', socket.id);

    socket.on('create_room', (playerName: string) => {
        if (socketToRoom[socket.id]) {
            socket.emit('error', '既にルームに参加しています。');
            return;
        }

        const roomId = uuidv4();
        rooms[roomId] = {
            id: roomId,
            hostId: socket.id,
            hostName: playerName
        };
        socketToRoom[socket.id] = roomId;

        socket.join(roomId);
        socket.emit('room_created', roomId);
        console.log(`ルーム作成: ${roomId} 作成者: ${playerName} (${socket.id})`);
    });

    socket.on('list_rooms', () => {
        const availableRooms = Object.values(rooms)
            .filter(r => !r.guestId)
            .map(r => ({ 
                id: r.id, 
                name: `Room ${r.id.substring(0, 4)}`,
                hostName: r.hostName
            }));
        socket.emit('room_list', availableRooms);
    });

    socket.on('join_room', (roomId: string, playerName: string) => {
        if (socketToRoom[socket.id]) {
            socket.emit('error', '既にルームに参加しています。');
            return;
        }

        const room = rooms[roomId];
        if (room && !room.guestId) {
            room.guestId = socket.id;
            room.guestName = playerName;
            socketToRoom[socket.id] = roomId;

            socket.join(roomId);
            
            // エンジンの初期化
            room.engine = new GameEngine();
            const state = room.engine.gameState;
            
            // プレイヤーIDを含む開始イベントを送信
            io.to(roomId).emit('game_start', { 
                roomId: roomId,
                p1: room.hostId, // ホストがP1
                p2: room.guestId, // ゲストがP2
                gameState: state
            });
            console.log(`プレイヤー ${playerName} (${socket.id}) がルーム ${roomId} に参加しました`);
        } else {
            socket.emit('error', 'ルームが見つからないか、満員です');
        }
    });

    socket.on('play_card', (data: { roomId: string, cardId: string }) => {
        const room = rooms[data.roomId];
        if (!room || !room.engine) return;

        const engine = room.engine;
        const playerId = socket.id === room.hostId ? 'p1' : (socket.id === room.guestId ? 'p2' : null);
        
        if (!playerId) {
            console.log("不明なプレイヤーが操作しようとしました");
            return; 
        }

        // カードプレイ
        // 注意: Engineは数値のCardIdを期待しますが、文字列で受け取る可能性があります。キャストします。
        const cId = Number(data.cardId) as any;
        console.log(`[${data.roomId}] プレイヤー ${playerId} が ${cId} をプレイしました`);
        
        try {
            engine.playCard(playerId, cId);
        } catch (e) {
            console.error("カードプレイエラー", e);
            return;
        }
        
        // ターン解決の確認
        const p1Played = engine.gameState.players.p1.playedCard;
        const p2Played = engine.gameState.players.p2.playedCard;

        if (p1Played && p2Played) {
            console.log(`[${data.roomId}] ターン解決中...`);
            // 解決
            const resolution = engine.resolveTurn();

            // フェーズがまだ 'resolution' の場合、ターンが進んでいない（最大ターン到達）ことを意味します
            if (engine.gameState.phase === 'resolution') {
                engine.checkGameOver();
            }
            
            // 結果のブロードキャスト
            // 以下を送信する必要があります:
            // 1. 相手がプレイしたカード（これまでは非公開。Engineはログ出力しますが、明示的なフィールドが必要です）
            // 2. 解決結果
            // 3. 新しい状態
            
            // MockServerのレスポンス構造: { opponentCard, battleResult, events, gameState }
            // P1にとって、相手はP2。P2にとって、相手はP1。
            
            // P1へのレスポンス
            io.to(room.hostId).emit('turn_result', {
                opponentCard: p2Played,
                battleResult: resolution.result,
                events: resolution.events,
                gameState: engine.gameState
            });

            // P2へのレスポンス
            // battleResult.winner は 'p1'/'p2'/'draw' です。クライアントが処理します。
            // しかし 'opponentCard' はP1のカードである必要があります。
            if (room.guestId) {
                io.to(room.guestId).emit('turn_result', {
                    opponentCard: p1Played,
                    battleResult: resolution.result,
                    events: resolution.events,
                    gameState: engine.gameState
                });
            }
        } else {
             console.log(`[${data.roomId}] 相手プレイヤーを待っています...`);
        }
    });

    socket.on('disconnect', () => {
        console.log('クライアント切断:', socket.id);
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            const room = rooms[roomId];
            if (room) {
                // ホストが切断した場合、ルームを破棄
                if (room.hostId === socket.id) {
                    console.log(`ホストが切断しました。ルーム ${roomId} を破棄します`);
                    io.to(roomId).emit('room_closed', 'ホストが切断しました');
                    // ゲストの追跡を削除
                    if (room.guestId) delete socketToRoom[room.guestId];
                    delete rooms[roomId];
                } else if (room.guestId === socket.id) {
                    // ゲストが切断した場合
                    console.log(`ゲストがルーム ${roomId} から切断しました`);
                    room.guestId = undefined;
                    room.guestName = undefined;
                    io.to(roomId).emit('player_disconnected', 'ゲストが切断しました');
                }
            }
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
