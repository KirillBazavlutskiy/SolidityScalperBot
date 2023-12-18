import TelegramBot, { InlineKeyboardMarkup, Message, CallbackQuery } from 'node-telegram-bot-api';
import fs from "fs";

export class TelegramControllerService {
    private Bot: TelegramBot;
    private chatId: number;
    private TradingAccess: boolean = true;
    private dataPath = './data/TelegramUsers.json';

    constructor(token: string) {
        this.Bot = new TelegramBot(token, { polling: true });
        this.setupBotListeners();
    }

    private setupBotListeners(): void {
        this.Bot.onText(/\/start/, this.onStart.bind(this));
        this.Bot.on('message', this.onMessage.bind(this));
        this.Bot.on('callback_query', this.onCallbackQuery.bind(this));
    }

    private CreateKeyBoard = (): InlineKeyboardMarkup => ({
        inline_keyboard: [
            this.TradingAccess ?
                [{ text: 'Stop searching', callback_data: 'stopSearching' }] :
                [{ text: 'Start searching', callback_data: 'startSearching' }]
        ]
    })

    private onStart = (msg: Message) => {
        const chatId = msg.chat.id;
        this.Bot.sendMessage(chatId, 'Hello! Now you subscribed for live trades!', { reply_markup: this.CreateKeyBoard() });
        const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
        const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

        fs.writeFileSync(this.dataPath, JSON.stringify([ ...subscribedUsers, chatId ]), 'utf-8');
    }

    private onMessage = (msg: Message) => {
        // Обработка текстовых сообщений, если необходимо
    }

    private onCallbackQuery = (callbackQuery: CallbackQuery) => {
        const chatId: number = callbackQuery.message?.chat.id || 0;
        const data: string = callbackQuery.data || '';

        if (data === 'startSearching') {
            this.TradingAccess = true;
            this.Bot.sendMessage(chatId, 'Bot started searching!', { reply_markup: this.CreateKeyBoard() });
            this.chatId = chatId;
        } else if (data === 'stopSearching') {
            this.TradingAccess = false;
            this.Bot.sendMessage(chatId, 'Bot stopped searching!', { reply_markup: this.CreateKeyBoard() });
        }
    }

    GetTradeStatus = (): boolean => {
        return this.TradingAccess;
    }

    SendMessage = (message: string) => {
        const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
        const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

        subscribedUsers.forEach(userId => {
            this.Bot.sendMessage(userId, message, { reply_markup: this.CreateKeyBoard() });
        })
    }
}