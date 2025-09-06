"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravestyClient = void 0;
const axios_1 = __importDefault(require("axios"));
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
//////////////////////////
// Travesty Client
//////////////////////////
class TravestyClient extends events_1.EventEmitter {
    constructor(baseUrl = 'https://api.travesty.chat') {
        super();
        this.baseUrl = baseUrl;
        this.ws = null;
        this.cookie = null;
        this.username = null;
        this.password = null;
        this.reconnectTimeout = null;
        this.axios = axios_1.default.create({ baseURL: this.baseUrl });
        this.emit = super.emit;
    }
    //////////////////////
    // Login and auto-connect WS
    //////////////////////
    async login(username, password) {
        this.username = username;
        this.password = password;
        const res = await this.axios.post('/account/login', { username, password });
        const cookieHeader = res.headers['set-cookie']?.find((c) => c.startsWith('vlk='));
        if (!cookieHeader)
            throw new Error('Login failed, no session cookie received');
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
    connectWS() {
        if (!this.cookie)
            throw new Error('You must login first');
        this.ws = new ws_1.default(`${this.baseUrl.replace(/^http/, 'ws')}/ws`, {
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
    async reconnect() {
        try {
            if (!this.cookie && this.username && this.password) {
                console.log('Session expired, re-logging in...');
                await this.login(this.username, this.password);
            }
            else {
                this.connectWS();
            }
        }
        catch (err) {
            console.error('Reconnect failed:', err);
            this.reconnectTimeout = setTimeout(() => this.reconnect(), 5000);
        }
    }
    //////////////////////
    // Handle incoming WS messages
    //////////////////////
    handleWSMessage(raw) {
        const event = JSON.parse(raw);
        switch (event.action) {
            case 'new_message':
                this.emit('message', event.data);
                break;
            case 'delete_message':
                this.emit('messageDelete', event.data);
                break;
            case 'startTyping':
            case 'stopTyping':
                this.emit('typing', event);
                break;
            case 'new_notification':
                this.emit('notification', event.data);
                break;
            case 'add_reaction':
                this.emit('reactionAdd', event.data);
                break;
            case 'delete_reaction':
                this.emit('reactionRemove', event.data);
                break;
            case 'update_member_roles':
                this.emit('memberRolesUpdate', event.data);
                break;
            default:
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
        await this.axios.post(`/channels/${channelId}/messages`, { content: text }, { headers: { Cookie: this.cookie } });
    }
}
exports.TravestyClient = TravestyClient;
