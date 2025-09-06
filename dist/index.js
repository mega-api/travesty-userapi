"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravestyClient = void 0;
const axios_1 = __importDefault(require("axios"));
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
class TravestyClient extends events_1.EventEmitter {
    constructor(baseUrl = 'https://api.travesty.chat', options = {}) {
        super();
        this.baseUrl = baseUrl;
        this.ws = null;
        this.cookie = null;
        this.email = null;
        this.password = null;
        this.reconnectTimeout = null;
        this.lastMessage = null;
        this.axios = axios_1.default.create({ baseURL: this.baseUrl });
        this.debug = options.debug ?? false;
    }
    log(...args) {
        if (this.debug)
            console.log('[WS]', ...args);
    }
    warn(...args) {
        if (this.debug)
            console.warn('[WS]', ...args);
    }
    // Override `on` and `emit` for typed events
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    //////////////////////
    // Login and WS connect
    //////////////////////
    async login(email, password) {
        this.email = email;
        this.password = password;
        const res = await this.axios.post('api/account/login', { email, password });
        const cookieHeader = res.headers['set-cookie']?.find((c) => c.startsWith('vlk='));
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
    async connectWS() {
        if (!this.cookie)
            throw new Error('You must login first');
        this.ws = new ws_1.default(`${this.baseUrl.replace(/^http/, 'ws')}/ws`, {
            headers: { Cookie: this.cookie }
        });
        this.ws.on('open', async () => {
            console.log('WS connected');
            // Fetch guilds & channels
            try {
                const guildsRes = await this.axios.get('/api/guilds', {
                    headers: { Cookie: this.cookie }
                });
                const guilds = guildsRes.data;
                for (const guild of guilds) {
                    this.ws.send(JSON.stringify({ action: 'joinGuild', room: guild.id }));
                    await this.delay(150);
                    const channelsRes = await this.axios.get(`/api/channels/${guild.id}`, { headers: { Cookie: this.cookie } });
                    const channels = channelsRes.data;
                    for (const channel of channels) {
                        this.ws.send(JSON.stringify({ action: 'joinChannel', room: channel.id }));
                        await this.delay(150);
                    }
                }
            }
            catch (err) {
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
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    //////////////////////
    // Reconnect
    //////////////////////
    async reconnect() {
        try {
            if (!this.cookie && this.email && this.password) {
                console.log('Session expired, re-logging in...');
                await this.login(this.email, this.password);
            }
            else {
                await this.connectWS();
            }
        }
        catch (err) {
            console.error('Reconnect failed:', err);
            this.reconnectTimeout = setTimeout(() => this.reconnect(), 5000);
        }
    }
    //////////////////////
    // Handle WS messages
    //////////////////////
    handleWSMessage(raw) {
        let event;
        try {
            event = JSON.parse(raw);
        }
        catch (err) {
            this.warn('Failed to parse message:', raw, err);
            return;
        }
        this.log('Event received:', event.action, event.data);
        switch (event.action) {
            case 'new_message': {
                const msg = event.data;
                this.log(`[new_message] Message ID: ${msg.id}, Text: "${msg.text}"`);
                this.lastMessage = msg; // wait for channelId
                break;
            }
            case 'new_notification': {
                const notif = event.data;
                this.log('[new_notification]', notif);
                if (this.lastMessage) {
                    this.lastMessage.channelId = notif.id; // channelId
                    this.log(`[messageCreate] Emitting message ID: ${this.lastMessage.id}, Channel: ${this.lastMessage.channelId}`);
                    this.emit('messageCreate', this.lastMessage);
                    this.lastMessage = null;
                }
                else {
                    this.warn('Notification received but no lastMessage to attach');
                }
                break;
            }
            case 'delete_message':
                this.log('[delete_message]', event.data);
                this.emit('messageDelete', event.data);
                break;
            case 'startTyping':
            case 'stopTyping':
                this.log('[typing]', event);
                this.emit('typing', event);
                break;
            case 'add_reaction':
                this.log('[reactionAdd]', event.data);
                this.emit('reactionAdd', event.data);
                break;
            case 'delete_reaction':
                this.log('[reactionRemove]', event.data);
                this.emit('reactionRemove', event.data);
                break;
            case 'update_member_roles':
                this.log('[memberRolesUpdate]', event.data);
                this.emit('memberRolesUpdate', event.data);
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
    async sendMessage(channelId, text) {
        if (!this.cookie)
            throw new Error('You must login first');
        await axios_1.default.post(`${this.baseUrl}/api/channels/${channelId}/messages`, { text }, {
            headers: {
                Cookie: this.cookie,
                'Content-Type': 'application/json'
            }
        });
    }
}
exports.TravestyClient = TravestyClient;
