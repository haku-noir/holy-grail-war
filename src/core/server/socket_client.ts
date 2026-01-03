import { io, Socket } from 'socket.io-client';
import type { ServerAPI, TurnResponse } from './api';
import type { CardId, GameState } from '../types';

export class SocketClient implements ServerAPI {
  private socket: Socket;
  private currentRoomId: string | null = null;
  private resolveTurnFn: ((response: TurnResponse) => void) | null = null;


  constructor(serverUrl: string = 'http://localhost:3000') {
    this.socket = io(serverUrl);

    this.socket.on('connect', () => {
      console.log('サーバーに接続しました:', this.socket.id);
    });

    this.socket.on('turn_result', (response: TurnResponse) => {
      if (this.resolveTurnFn) {
        this.resolveTurnFn(response);
        this.resolveTurnFn = null;
      }
    });

    this.socket.on('disconnect', () => {
        console.log('サーバーから切断されました');
    });
  }

  // ルーム管理メソッド
  async createRoom(playerName: string): Promise<string> {
    return new Promise((resolve) => {
      this.socket.emit('create_room', playerName);
      this.socket.once('room_created', (roomId: string) => {
        this.currentRoomId = roomId;
        resolve(roomId);
      });
    });
  }

  async listRooms(): Promise<any[]> {
    return new Promise((resolve) => {
      this.socket.emit('list_rooms');
      this.socket.once('room_list', (rooms: any[]) => {
        resolve(rooms);
      });
    });
  }

  joinRoom(roomId: string, playerName: string): void {
      this.socket.emit('join_room', roomId, playerName);
  }

  onGameStart(callback: (data: any) => void) {
      this.socket.on('game_start', (data) => {
          this.currentRoomId = data.roomId; // ルームIDが設定されていることを確認
          callback(data);
      });
  }

  // ゲームAPI
  async playCard(playerId: 'p1' | 'p2', cardId: CardId): Promise<TurnResponse> {
    if (!this.currentRoomId) throw new Error("ルームに入っていません");
    
    return new Promise((resolve) => {
        this.resolveTurnFn = resolve;
        this.socket.emit('play_card', {
            roomId: this.currentRoomId,
            cardId: cardId,
            playerId: playerId
        });
    });
  }

  async resetGame(): Promise<GameState> {
    // オンラインゲームのリセットは基本的にサーバーイベントで処理されますが、インターフェースの一貫性のために:
    return new Promise((resolve) => {
         // TODO: 再戦ロジックの実装
         resolve({} as GameState); // プレースホルダー
    });
  }

  getMyPlayerId(p1SocketId: string, p2SocketId: string): 'p1' | 'p2' {
      if (this.socket.id === p1SocketId) return 'p1';
      if (this.socket.id === p2SocketId) return 'p2';
      return 'p1'; // フォールバック? ロジックが正しければ発生しないはず
  }
}
