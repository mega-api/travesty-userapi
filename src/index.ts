import axios from 'axios';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

//////////////////////////
// Interfaces
//////////////////////////

export interface MessageEvent {
  id: string;
  text: string;
  attachment: any | null;
  createdAt: string;
  updatedAt: string;
  reactions: any | null;
  tags: any | null;
  user: User;
}

export interface TypingEvent {
  action: 'startTyping' | 'stopTyping';
  room: string;
  message: string; // username
}

export interface NotificationEvent {
  id: string;
  tags: any | null;
}

export interface Emote {
  id: string;
  name: string;
  url: string;
  guild_id: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  image: string;
  isOnline: boolean;
  isFriend: boolean;
  nickname: string | null;
  roles: string[] | null;
  createdAt: string;
  updatedAt: string;
  color: string | null;
}

export interface ReactionEvent {
  id: string;
  messageId: string;
  user: User;
  emote: Emote;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
}

export interface MemberRolesUpdateEvent {
  id: string;
  username: string;
  image: string;
  isOnline: boolean;
  isFriend: boolean;
  nickname: string | null;
  roles: Role[];
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TravestyRawEvent {
  action: string;
  data?: any;
  [key: string]: any;
}

interface LoginResponse {
  sessionCookie: string; // the 'vlk' cookie value
}

//////////////////////////
// Travesty Client
//////////////////////////

export class TravestyClient extends EventEmitter {
  private axios: ReturnType<typeof axios.create>;
  private ws: WebSocket | null = null;
  private cookie: string | null = null;
  private username: string | null = null;
  private password: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  // Explicitly declare emit to satisfy TypeScript
  public emit: EventEmitter['emit'];

  constructor(private baseUrl: string = 'https://api.travesty.chat') {
    super();
    this.axios = axios.create({ baseURL: this.baseUrl });
    this.emit = super.emit;
  }

  //////////////////////
  // Login and auto-connect WS
  //////////////////////
  async login(username: string, password: string) {
    this.username = username;
    this.password = password;

    const res = await this.axios.post('/account/login', { username, password });
    const cookieHeader = res.headers['set-cookie']?.find((c: string) => c.startsWith('vlk='));
    if (!cookieHeader) throw new Error('Login failed, no session cookie received');

    this.cookie = cookieHeader.split(';')[0]; // vlk=...
    this.connectWS();
  }

  //////////////////////
  // Logout
  //////////////////////
  logout() {
    this.cookie = null;
    this.username = null;
    this.password = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.emit('logout');
  }

  //////////////////////
  // Connect WS
  //////////////////////
  private connectWS() {
    if (!this.cookie) throw new Error('You must login first');

    this.ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws`, {
      headers: { Cookie: this.cookie }
    });

    this.ws.on('open', () => {
      console.log('WS connected');
    });

    this.ws.on('close', async () => {
      console.log('WS disconnected, attempting reconnect in 5s...');
      this.reconnectTimeout = setTimeout(() => this.reconnect(), 5000);
    });

    this.ws.on('message', (raw) => {
      this.handleWSMessage(raw.toString());
    });

    this.ws.on('error', (err) => {
      console.error('WS error:', err.message);
    });
  }

  //////////////////////
  // Automatic reconnect
  //////////////////////
  private async reconnect() {
    try {
      if (!this.cookie && this.username && this.password) {
        console.log('Session expired, re-logging in...');
        await this.login(this.username, this.password);
      } else {
        this.connectWS();
      }
    } catch (err) {
      console.error('Reconnect failed:', err);
      this.reconnectTimeout = setTimeout(() => this.reconnect(), 5000);
    }
  }

  //////////////////////
  // Handle incoming WS messages
  //////////////////////
  private handleWSMessage(raw: string) {
    const event: TravestyRawEvent = JSON.parse(raw);

    switch (event.action) {
      case 'new_message': this.emit('message', event.data as MessageEvent); break;
      case 'delete_message': this.emit('messageDelete', event.data as string); break;
      case 'startTyping': case 'stopTyping': this.emit('typing', event as TypingEvent); break;
      case 'new_notification': this.emit('notification', event.data as NotificationEvent); break;
      case 'add_reaction': this.emit('reactionAdd', event.data as ReactionEvent); break;
      case 'delete_reaction': this.emit('reactionRemove', event.data as ReactionEvent); break;
      case 'update_member_roles': this.emit('memberRolesUpdate', event.data as MemberRolesUpdateEvent); break;
      default: this.emit('raw', event); break;
    }
  }

  //////////////////////
  // Send message
  //////////////////////
  async sendMessage(channelId: string, text: string) {
    if (!this.cookie) throw new Error('You must login first');

    await this.axios.post(
      `/channels/${channelId}/messages`,
      { content: text },
      { headers: { Cookie: this.cookie } }
    );
  }
}
