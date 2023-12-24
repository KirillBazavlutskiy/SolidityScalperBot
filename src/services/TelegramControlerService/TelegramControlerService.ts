import TelegramBot, {InlineKeyboardMarkup, Message, CallbackQuery, ReplyKeyboardMarkup, KeyboardButton} from 'node-telegram-bot-api';
import fs from "fs";
import {text} from "stream/consumers";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";

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

    private CreateKeyBoard = (): ReplyKeyboardMarkup => ({
        keyboard: [
            [
                {
                    text: this.TradingAccess ?
                        'Stop searching' :
                        'Start searching'
                },
                {
                    text: 'Ping'
                },
            ],
            [
                {
                    text: 'Trades Info'
                }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    });

    private onStart = (msg: Message) => {
        const chatId = msg.chat.id;
        this.Bot.sendMessage(chatId, 'Hello! Now you subscribed for live trades!', {
            reply_markup:  {
                ...this.CreateKeyBoard(),
            },
        });
        const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
        const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

        fs.writeFileSync(this.dataPath, JSON.stringify([ ...subscribedUsers, chatId ]), 'utf-8');
    }

    private onMessage = (msg: Message) => {
        const chatId: number = msg.chat.id || 0;
        const data: string = msg.text || '';

        switch (data) {
            case 'Start searching':
                this.TradingAccess = true;
                this.SendMessage('Bot stopped searching!');
                break;
            case 'Stop searching':
                this.TradingAccess = false;
                this.SendMessage('Bot stopped searching!');
                break;
            case 'Ping':
                this.Bot.sendMessage(chatId, 'Program is active!', { reply_markup: this.CreateKeyBoard() });
                break;
            case 'Trades Info':
                this.Bot.sendMessage(chatId, TradingPairsService.LogTradingPairs(), { reply_markup: this.CreateKeyBoard() })
        }
    }

    private onCallbackQuery = (callbackQuery: CallbackQuery) => {
        // const chatId: number = callbackQuery.message?.chat.id || 0;
        // const data: string = callbackQuery.data || '';
        //
        // switch (data) {
        //     case 'startSearching':
        //         this.TradingAccess = true;
        //         this.Bot.sendMessage(chatId, 'Bot started searching!', { reply_markup: this.CreateKeyBoard() });
        //         this.chatId = chatId;
        //         break;
        //     case 'stopSearching':
        //         this.TradingAccess = false;
        //         this.Bot.sendMessage(chatId, 'Bot stopped searching!', { reply_markup: this.CreateKeyBoard() });
        //         break;
        //     case 'Ping':
        //         this.Bot.sendMessage(chatId, 'Program is active!', { reply_markup: this.CreateKeyBoard() });
        //         break;
        // }
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