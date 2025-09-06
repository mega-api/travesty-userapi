import axios from 'axios';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import FormData from 'form-data';

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

  channelId?: string;
}

export interface TypingEvent {
  action: 'startTyping' | 'stopTyping';
  room: string;
  message: string; // username
}

export interface NotificationEvent {
  id: string; // channelId
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

//////////////////////////
// Event typing
//////////////////////////

interface TravestyClientEvents {
  messageCreate: (msg: MessageEvent) => void;
  messageDelete: (msgId: string) => void;
  typing: (evt: TypingEvent) => void;
  reactionAdd: (evt: ReactionEvent) => void;
  reactionRemove: (evt: ReactionEvent) => void;
  memberRolesUpdate: (evt: MemberRolesUpdateEvent) => void;
  raw: (evt: TravestyRawEvent) => void;
  logout: () => void;
}

//////////////////////////
// Travesty Client
//////////////////////////
export interface TravestyClientOptions {
  debug?: boolean;
}

export class TravestyClient extends EventEmitter {
  private axios: ReturnType<typeof axios.create>;
  private ws: WebSocket | null = null;
  private cookie: string | null = null;
  private email: string | null = null;
  private password: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private debug: boolean;

  private lastMessage: MessageEvent | null = null;

  constructor(
    private baseUrl: string = 'https://api.travesty.chat',
    options: TravestyClientOptions = {}
  ) {
    super();
    this.axios = axios.create({ baseURL: this.baseUrl });
    this.debug = options.debug ?? false;
  }

  private log(...args: any[]) {
    if (this.debug) console.log('[WS]', ...args);
  }

  private warn(...args: any[]) {
    if (this.debug) console.warn('[WS]', ...args);
  }

  // Override `on` and `emit` for typed events
  public on<K extends keyof TravestyClientEvents>(
    event: K,
    listener: TravestyClientEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof TravestyClientEvents>(
    event: K,
    ...args: Parameters<TravestyClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  //////////////////////
  // Login and WS connect
  //////////////////////
  async login(email: string, password: string) {
    this.email = email;
    this.password = password;

    const res = await this.axios.post('api/account/login', { email, password });
    const cookieHeader = res.headers['set-cookie']?.find((c: string) =>
      c.startsWith('vlk=')
    );
    if (!cookieHeader)
      throw new Error('Login failed, no session cookie received');

    this.cookie = cookieHeader.split(';')[0]; // vlk=...
    await this.connectWS();
  }

  //////////////////////
  // Logout
  //////////////////////
  logout() {
    this.cookie = null;
    this.email = null;
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
  // WebSocket connect
  //////////////////////
  private async connectWS() {
    if (!this.cookie) throw new Error('You must login first');

    this.ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws`, {
      headers: { Cookie: this.cookie }
    });

    this.ws.on('open', async () => {
      console.log('WS connected');

      // Fetch guilds & channels
      try {
        const guildsRes = await this.axios.get('/api/guilds', {
          headers: { Cookie: this.cookie }
        });
        const guilds = guildsRes.data as { id: string }[];

        for (const guild of guilds) {
          this.ws!.send(
            JSON.stringify({ action: 'joinGuild', room: guild.id })
          );
          await this.delay(150);

          const channelsRes = await this.axios.get(
            `/api/channels/${guild.id}`,
            { headers: { Cookie: this.cookie } }
          );
          const channels = channelsRes.data as { id: string }[];

          for (const channel of channels) {
            this.ws!.send(
              JSON.stringify({ action: 'joinChannel', room: channel.id })
            );
            await this.delay(150);
          }
        }
      } catch (err) {
        console.error('Failed to auto-join channels/guilds:', err);
      }
    });

    this.ws.on('close', () => {
      console.log('WS disconnected, reconnecting in 5s...');
      this.reconnectTimeout = setTimeout(() => this.reconnect(), 5000);
    });

    this.ws.on('message', (raw) => {
      this.handleWSMessage(raw.toString());
    });

    this.ws.on('error', (err) => {
      console.error('WS error:', err.message);
    });
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  //////////////////////
  // Reconnect
  //////////////////////
  private async reconnect() {
    try {
      if (!this.cookie && this.email && this.password) {
        console.log('Session expired, re-logging in...');
        await this.login(this.email, this.password);
      } else {
        await this.connectWS();
      }
    } catch (err) {
      console.error('Reconnect failed:', err);
      this.reconnectTimeout = setTimeout(() => this.reconnect(), 5000);
    }
  }

  //////////////////////
  // Handle WS messages
  //////////////////////
  private handleWSMessage(raw: string) {
    let event: TravestyRawEvent;
    try {
      event = JSON.parse(raw);
    } catch (err) {
      this.warn('Failed to parse message:', raw, err);
      return;
    }

    this.log('Event received:', event.action, event.data);

    switch (event.action) {
      case 'new_message': {
        const msg = event.data as MessageEvent;
        this.log(
          `[new_message] Message ID: ${msg.id}, Text: "${msg.text}"`
        );
        this.lastMessage = msg; // wait for channelId
        break;
      }

      case 'new_notification': {
        const notif = event.data as NotificationEvent;
        this.log('[new_notification]', notif);

        if (this.lastMessage) {
          this.lastMessage.channelId = notif.id; // channelId
          this.log(
            `[messageCreate] Emitting message ID: ${this.lastMessage.id}, Channel: ${this.lastMessage.channelId}`
          );
          this.emit('messageCreate', this.lastMessage);
          this.lastMessage = null;
        } else {
          this.warn('Notification received but no lastMessage to attach');
        }
        break;
      }

      case 'delete_message':
        this.log('[delete_message]', event.data);
        this.emit('messageDelete', event.data as string);
        break;

      case 'startTyping':
      case 'stopTyping':
        this.log('[typing]', event);
        this.emit('typing', event as TypingEvent);
        break;

      case 'add_reaction':
        this.log('[reactionAdd]', event.data);
        this.emit('reactionAdd', event.data as ReactionEvent);
        break;

      case 'delete_reaction':
        this.log('[reactionRemove]', event.data);
        this.emit('reactionRemove', event.data as ReactionEvent);
        break;

      case 'update_member_roles':
        this.log('[memberRolesUpdate]', event.data);
        this.emit('memberRolesUpdate', event.data as MemberRolesUpdateEvent);
        break;

      default:
        this.log('[raw]', event);
        this.emit('raw', event);
        break;
    }
  }

  //////////////////////
  // Send message
  //////////////////////
  async sendMessage(channelId: string, text: string) {
    if (!this.cookie) throw new Error('You must login first');

    await axios.post(
      `${this.baseUrl}/api/channels/${channelId}/messages`,
      { text },
      {
        headers: {
          Cookie: this.cookie,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
