import TelegramBot, {
    CallbackQuery,
    InlineKeyboardMarkup,
    Message,
    ReplyKeyboardMarkup
} from 'node-telegram-bot-api';
import fs from "fs";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {dls} from "../../index";
import {Binance} from "binance-api-node";
import {OptionsManager} from "../OptionsManager/OptionsManager";

export class TelegramControllerService {
    private Bot: TelegramBot;
    client: Binance;
    private TradingAccess: boolean = true;
    private dataPath = './data/TelegramUsers.json';

    private _state: string;

    private SetState = (state: string) => {
        this._state = state;
    }

    private GetState = () => {
        return this._state;
    }

    constructor(token: string, client: Binance) {
        this.client = client;
        this.Bot = new TelegramBot(token, { polling: true });
        this.setupBotListeners();
    }

    private setupBotListeners(): void {
        this.Bot.onText(/\/start/, this.onStart.bind(this));
        this.Bot.on('message', this.onMessage.bind(this));
        this.Bot.on('callback_query', this.OnCallbackQuery.bind(this));
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
            ],
            [
                {
                    text: 'Solidity Finder Options'
                }
            ],
            [
                {
                    text: 'Trading Options'
                }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    });

    private CreateReplySolidityFinderOptionsButtons = (empty: boolean = false): InlineKeyboardMarkup => ({
        inline_keyboard: empty ? [] : [
            [{ text: 'Top price change percent count', callback_data: 'ChangeTopPriceChangePercentCount' }],
            [{ text: 'Check reaching price duration value', callback_data: 'ChangeCheckReachingPriceDuration' }]
        ].filter(option => option[0].callback_data !== this.GetState())
    })

    private CreateReplyTradeOptionsButtons = (empty: boolean = false): InlineKeyboardMarkup => ({
        inline_keyboard: empty ? [] : [
            [{ text: 'Stop loss percent value', callback_data: 'ChangeStopLossPercentValue' }],
            [{ text: 'Stop loss trailing value', callback_data: 'ChangeStopLossTrailingValue' }],
            [{ text: 'Take profit percent value', callback_data: 'ChangeTakeProfitPercentValue' }]
        ].filter(option => option[0].callback_data !== this.GetState())
    });

    private onStart = (msg: Message) => {
        const chatId = msg.chat.id;
        this.Bot.sendMessage(chatId, 'Hello! Now you subscribed for live trades!', {
            reply_markup:  {
                ...this.CreateKeyBoard(),
            },
        });
        this.AddSubscriber(chatId);
    }

    private AddSubscriber = (id: number) => {
        const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
        const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

        fs.writeFileSync(this.dataPath, JSON.stringify([ ...subscribedUsers, id ]), 'utf-8');
    }

    private DeleteSubscriber = (id: number) => {
        const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
        const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

        fs.writeFileSync(this.dataPath, JSON.stringify(subscribedUsers.filter(userId => userId !== id)), 'utf-8');
    }

    private onMessage = async (msg: Message) => {
        try {
            const chatId: number = msg.chat.id || 0;
            const data: string = msg.text || '';

            switch (data) {
                case 'Start searching':
                    this.TradingAccess = true;
                    this.SendMessage('Bot started searching!');
                    break;
                case 'Stop searching':
                    this.TradingAccess = false;
                    this.SendMessage('Bot stopped searching!');
                    break;

                case 'Ping':
                    const ping = await this.client.ping();
                    this.Bot.sendMessage(chatId, `Program is active!\n${ping ? 'Connection is active too!' : 'Isn`t connected to binance!'}`, { reply_markup: this.CreateKeyBoard() });
                    break;
                case 'Trades Info':
                    this.Bot.sendMessage(chatId, TradingPairsService.LogTradingPairs(), { reply_markup: this.CreateKeyBoard() });
                    break;

                case 'Solidity Finder Options':
                    this.Bot.sendMessage(chatId, 'Choose the option:', { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                    break;

                case 'Trading Options':
                    this.Bot.sendMessage(chatId, 'Choose the option:', { reply_markup: this.CreateReplyTradeOptionsButtons() });
                    break;

                default:
                    switch (this.GetState()) {
                        case 'ChangeTopPriceChangePercentCount': {
                            this.SetState('');
                            const OldOptions = OptionsManager.GetOptions();
                            const fixedValue = parseFloat(parseFloat(data).toFixed());
                            OldOptions.SolidityFinderOptions.TopPriceChangePercentCount = fixedValue;
                            OptionsManager.ChangeOptions(OldOptions);
                            const msg = `Top price change percent count value has been changed to ${fixedValue}`;
                            this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityFinderOptionsButtons(true) });
                            this.SendMessage(msg, chatId);
                            break;
                        }
                        case 'ChangeCheckReachingPriceDuration': {
                            this.SetState('');
                            const OldOptions = OptionsManager.GetOptions();
                            const fixedValue = parseFloat(parseFloat(data).toFixed());
                            OldOptions.SolidityFinderOptions.CheckReachingPriceDuration = fixedValue;
                            OptionsManager.ChangeOptions(OldOptions);
                            const msg = `Check reaching price duration value has been changed to ${fixedValue}`;
                            this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityFinderOptionsButtons(true) });
                            this.SendMessage(msg, chatId);
                            break;
                        }

                        case 'ChangeStopLossPercentValue': {
                            this.SetState('');
                            const OldOptions = OptionsManager.GetOptions();
                            const fixedValueFloat = parseFloat(data.replace(',', '.'));
                            OldOptions.TradingOptions.Stops.StopLoss.PercentValue = fixedValueFloat;
                            OptionsManager.ChangeOptions(OldOptions);
                            const msg = `Stop loss value has been changed to ${fixedValueFloat}`;
                            this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyTradeOptionsButtons(true) });
                            this.SendMessage(msg, chatId);
                            break;
                        }
                        case 'ChangeStopLossTrailingValue': {
                            this.SetState('');
                            const OldOptions = OptionsManager.GetOptions();
                            OldOptions.TradingOptions.Stops.StopLoss.IsTrailing = data === '1';
                            OptionsManager.ChangeOptions(OldOptions);
                            const msg = `Stop loss trailing status has been changed to ${data === '1'}`;
                            this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyTradeOptionsButtons(true) });
                            this.SendMessage(msg, chatId);
                            break;
                        }
                        case 'ChangeTakeProfitPercentValue': {
                            this.SetState('');
                            const OldOptions = OptionsManager.GetOptions();
                            const fixedValueFloat = parseFloat(data.replace(',', '.'));
                            OldOptions.TradingOptions.Stops.TakeProfit = fixedValueFloat;
                            OptionsManager.ChangeOptions(OldOptions);
                            const msg = `Take profit value has been changed to ${fixedValueFloat}`
                            this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyTradeOptionsButtons(true) });
                            this.SendMessage(msg, chatId);
                            break;
                        }
                        default: {
                            this.Bot.sendMessage(chatId, '?', { reply_markup: this.CreateReplyTradeOptionsButtons(true) });
                        }
                    }
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in telegram service: ${e.message}`, [dls], true);
        }
    }

    private OnCallbackQuery = (callbackQuery: CallbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;

        switch (data) {
            case 'ChangeTopPriceChangePercentCount':
                this.SetState(data);
                this.Bot.sendMessage(chatId, 'Type a new value for top price change percent count:\nTips: 20 is normal\nOr choose other option:', { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                break;
            case 'ChangeCheckReachingPriceDuration':
                this.SetState(data);
                this.Bot.sendMessage(chatId, 'Type a new value for check reaching price duration:\nTips: 1 means 1 minute\nOr choose other option:', { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                break;

            case 'ChangeStopLossPercentValue':
                this.SetState(data);
                this.Bot.sendMessage(chatId, 'Type a new value for Stop Loss Percent Value:\nTips: 1 is 1%\nOr choose other option:', { reply_markup: this.CreateReplyTradeOptionsButtons() });
                break;
            case 'ChangeStopLossTrailingValue':
                this.SetState(data);
                this.Bot.sendMessage(chatId, 'Type a new condition for trailing Stop Loss:\nTips: 0(false) or 1(true)\nOr choose other option:', { reply_markup: this.CreateReplyTradeOptionsButtons() });
                break;
            case 'ChangeTakeProfitPercentValue':
                this.SetState(data);
                this.Bot.sendMessage(chatId, 'Type a new value for Take Profit Percent Value:\nTips: 1 is 1% | 0 means disabled\nOr choose other option:', { reply_markup: this.CreateReplyTradeOptionsButtons() });
                break;
        }
    }

    GetTradeStatus = (): boolean => {
        return this.TradingAccess;
    }

    SendMessage = (message: string, sendingUser?: number) => {
        try {
            const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
            const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

            subscribedUsers.filter(user => user !== sendingUser).forEach(userId => {
                try {
                    this.Bot.sendMessage(userId, message, { reply_markup: this.CreateKeyBoard() });
                } catch (e) {
                    this.DeleteSubscriber(userId);
                }
            })
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in telegram service: ${e.message}`, [dls], true);
        }
    }
}