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
import {
    GeneraOptionsModel,
    SolidityFinderOptionsModel,
    SolidityWatchingOptionsModel,
    TradingOptionsModel
} from "../OptionsManager/OptionsModel";

export class TelegramControllerService {
    private Bot: TelegramBot;
    client: Binance;
    private TradingAccess: boolean = true;
    private dataPath = './data/TelegramUsers.json';

    private _state: string;
    static ignoreCommands: boolean = false;

    private SetState = (state: string) => {
        this._state = state;
    }

    private GetState = () => {
        return this._state;
    }

    constructor(token: string, client: Binance) {
        this.client = client;
        try {
            this.Bot = new TelegramBot(token, { polling: true });
            this.setupBotListeners();
        } catch (e) {
            TelegramControllerService.ignoreCommands = true;
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Telegram bot wasn't authenticated!`);
        }
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
                    text: 'Active Trading Pairs',
                }
            ],
            [
                {
                    text: 'Solidity Watching Options'
                },
                {
                    text: 'General Options'
                }
            ],
            [
                {
                    text: 'Solidity Finder Options'
                },
                {
                    text: 'Trading Options'
                }
            ],
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    });
    private CreateReplyGeneralOptionsButtons = (empty: boolean = false): InlineKeyboardMarkup => {
        const Options = OptionsManager.GetOptions();
        return ({
            inline_keyboard: empty ? [] : [
                [{ text: `ScreenerMode: ${Options.GeneralOptions.ScreenerMode}`, callback_data: 'ChangeScreenerMode' }],
            ].filter(option => option[0].callback_data !== this.GetState())
        })
    }
    private CreateReplySolidityFinderOptionsButtons = (empty: boolean = false): InlineKeyboardMarkup => {
        const Options = OptionsManager.GetOptions();
        return ({
            inline_keyboard: empty ? [] : [
                [{ text: `MinimalVolume: ${Options.SolidityFinderOptions.MinimalVolume}`, callback_data: 'ChangeMinimalVolume' }],
                [{ text: `RatioAccess: ${Options.SolidityFinderOptions.RatioAccess}`, callback_data: 'ChangeRatioAccess' }],
                [{ text: `PriceUninterruptedDuration: ${Options.SolidityFinderOptions.PriceUninterruptedDuration}`, callback_data: 'ChangePriceUninterruptedDuration' }],
                [{ text: `TopGainersCount: ${Options.SolidityFinderOptions.TopGainersCount}`, callback_data: 'ChangeTopGainersCount' }]
            ].filter(option => option[0].callback_data !== this.GetState())
        })
    }
    private CreateReplySolidityWatchingOptionsButtons = (empty: boolean = false): InlineKeyboardMarkup => {
        const Options = OptionsManager.GetOptions();
        return ({
            inline_keyboard: empty ? [] : [
                [{ text: `SolidityRemainderForTrade: ${Options.SolidityWatchingOptions.SolidityRemainderForTrade}`, callback_data: 'ChangeSolidityRemainderForTrade' }],
                [{ text: `AllowSharpBreakout: ${Options.SolidityWatchingOptions.AllowSharpBreakout}`, callback_data: 'ChangeAllowSharpBreakout' }],
                [{ text: `AcceptablePriceChange >> PriceChange: ${Options.SolidityWatchingOptions.AcceptablePriceChange.PriceChange}`, callback_data: 'AcceptablePriceChange.PriceChange' }],
                [{ text: `AcceptablePriceChange >> Period: ${Options.SolidityWatchingOptions.AcceptablePriceChange.Period}`, callback_data: 'AcceptablePriceChange.Period' }],
            ].filter(option => option[0].callback_data !== this.GetState())
        })
    }
    private CreateReplyTradeOptionsButtons = (empty: boolean = false): InlineKeyboardMarkup => {
        const Options = OptionsManager.GetOptions();
        return ({
            inline_keyboard: empty ? [] : [
                [{ text: `StopLossPercentValue: ${Options.TradingOptions.Stops.StopLoss.PercentValue}`, callback_data: 'ChangeStopLossPercentValue' }],
                [{ text: `StopLossTrailingValue: ${Options.TradingOptions.Stops.StopLoss.IsTrailing}`, callback_data: 'ChangeStopLossTrailingValue' }],
                [{ text: `TakeProfitPercentValue: ${Options.TradingOptions.Stops.TakeProfit}`, callback_data: 'ChangeTakeProfitPercentValue' }]
            ].filter(option => option[0].callback_data !== this.GetState())
        })
    }

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
                case 'Active Trading Pairs':
                    this.Bot.sendMessage(chatId, TradingPairsService.LogTradingPairs(), { reply_markup: this.CreateKeyBoard() });
                    break;

                case 'General Options':
                    this.Bot.sendMessage(chatId, 'Choose the option:', { reply_markup: this.CreateReplyGeneralOptionsButtons() });
                    break;
                case 'Solidity Finder Options':
                    this.Bot.sendMessage(chatId, 'Choose the option:', { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                    break;
                case 'Solidity Watching Options':
                    this.Bot.sendMessage(chatId, 'Choose the option:', { reply_markup: this.CreateReplySolidityWatchingOptionsButtons() });
                    break;
                case 'Trading Options':
                    this.Bot.sendMessage(chatId, 'Choose the option:', { reply_markup: this.CreateReplyTradeOptionsButtons() });
                    break;

                default:
                    const state = this.GetState();
                    this.ChangeTradingOptions(state, data, chatId);
                    this.ChangeSolidityFinderOptions(state, data, chatId);
                    this.ChangeSolidityWatchingOptions(state, data, chatId);
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in telegram service: ${e.message}`, [dls], true);
        }
    }

    private OnCallbackQuery = (callbackQuery: CallbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const Options = OptionsManager.GetOptions();

        this.HandleGeneralOptionsChange(data, chatId, Options.GeneralOptions);
        this.HandleSolidityFinderOptionsChange(data, chatId, Options.SolidityFinderOptions);
        this.HandleSolidityWatchingOptions(data, chatId, Options.SolidityWatchingOptions);
        this.HandleTradingOptionsChange(data, chatId, Options.TradingOptions);
    }

    // General Options
    HandleGeneralOptionsChange = (data: string, chatId: number, GeneralOptions: GeneraOptionsModel): void => {
        switch (data) {
            case 'ChangeScreenerMode': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                OldOptions.GeneralOptions.ScreenerMode = !OldOptions.GeneralOptions.ScreenerMode;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"ScreenerMode" value has been changed to ${OldOptions.GeneralOptions.ScreenerMode}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyGeneralOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
        }
    }

    // Solidity Finder Options
    HandleSolidityFinderOptionsChange = (data: string, chatId: number, SolidityFinderOptions: SolidityFinderOptionsModel): void => {
        switch (data) {
            case 'ChangeMinimalVolume': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "RatioAccess":\nOld value: ${SolidityFinderOptions.MinimalVolume}\nTips: 2mil (2000000) is normal\nOr choose other option:`, { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                break;
            }
            case 'ChangeRatioAccess': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "RatioAccess":\nOld value: ${SolidityFinderOptions.RatioAccess}\nTips: 20 is normal\nOr choose other option:`, { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                break;
            }
            case 'ChangePriceUninterruptedDuration': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "PriceUninterruptedDuration":\nOld value: ${SolidityFinderOptions.PriceUninterruptedDuration}\nTips: 20 is normal\nOr choose other option:`, { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                break;
            }
            case 'ChangeTopGainersCount': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "TopGainersCount":\nOld value: ${SolidityFinderOptions.TopGainersCount}\nTips: 1 means 1 minute\nOr choose other option:`, { reply_markup: this.CreateReplySolidityFinderOptionsButtons() });
                break;
            }
        }
    }
    ChangeSolidityFinderOptions = (optionName: string, value: string, chatId: number) => {
        switch (optionName) {
            case 'ChangeMinimalVolume': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValue = parseFloat(parseFloat(value).toFixed());
                OldOptions.SolidityFinderOptions.MinimalVolume = fixedValue;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"MinimalVolume" value has been changed to ${fixedValue}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityFinderOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'ChangeRatioAccess': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValue = parseFloat(parseFloat(value).toFixed());
                OldOptions.SolidityFinderOptions.RatioAccess = fixedValue;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"RatioAccess" value has been changed to ${fixedValue}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityFinderOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'ChangePriceUninterruptedDuration': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValue = parseFloat(parseFloat(value).toFixed());
                OldOptions.SolidityFinderOptions.PriceUninterruptedDuration = fixedValue;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"PriceUninterruptedDuration" value has been changed to ${fixedValue}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityFinderOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'ChangeTopGainersCount': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValue = parseFloat(parseFloat(value).toFixed());
                OldOptions.SolidityFinderOptions.TopGainersCount = fixedValue;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"TopGainersCount" value has been changed to ${fixedValue}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityFinderOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
        }
    }

    //Solidity Watching Options
    HandleSolidityWatchingOptions = (data: string,  chatId: number, SolidityWatchingOptions: SolidityWatchingOptionsModel) => {
        switch (data) {
            case 'ChangeSolidityRemainderForTrade': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "SolidityRemainderForTrade":\nOld value: ${SolidityWatchingOptions.SolidityRemainderForTrade}\nTips: 0.5 is 50%\nOr choose other options:`, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons() });
                break;
            }
            case 'ChangeAllowSharpBreakout': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                OldOptions.SolidityWatchingOptions.AllowSharpBreakout = !OldOptions.SolidityWatchingOptions.AllowSharpBreakout;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"AllowSharpBreakout" has been changed to ${OldOptions.SolidityWatchingOptions.AllowSharpBreakout }`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'AcceptablePriceChange.PriceChange': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "AcceptablePriceChange >> PriceChange":\nOld value: ${SolidityWatchingOptions.AcceptablePriceChange.PriceChange}\nTips: 1 is 1%\nOr choose other options:`, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons() });
                break;
            }
            case 'AcceptablePriceChange.Period': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "AcceptablePriceChange >> Period":\nOld value: ${SolidityWatchingOptions.AcceptablePriceChange.Period}\nTips: 1 is 1 minute\nOr choose other options:`, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons() });
                break;
            }
        }
    }
    ChangeSolidityWatchingOptions = (optionName: string, value: string, chatId: number) => {
        switch (optionName) {
            case 'ChangeSolidityRemainderForTrade': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValueFloat = parseFloat(value.replace(',', '.'));
                OldOptions.SolidityWatchingOptions.SolidityRemainderForTrade = fixedValueFloat;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"SolidityRemainderForTrade" value has been changed to ${fixedValueFloat}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'AcceptablePriceChange.PriceChange': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValueFloat = parseFloat(value.replace(',', '.'));
                OldOptions.SolidityWatchingOptions.AcceptablePriceChange.PriceChange = fixedValueFloat;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"AcceptablePriceChange >> PriceChange" value has been changed to ${fixedValueFloat}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'AcceptablePriceChange.Period': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValueFloat = parseFloat(value.replace(',', '.'));
                OldOptions.SolidityWatchingOptions.AcceptablePriceChange.Period = fixedValueFloat;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"AcceptablePriceChange >> Period" value has been changed to ${fixedValueFloat}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplySolidityWatchingOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
        }
    }

    // Trading Options
    HandleTradingOptionsChange = (data: string,  chatId: number, TradingOptions: TradingOptionsModel): void => {
        switch (data) {
            case 'ChangeStopLossPercentValue': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "StopLossPercentValue":\nOld value: ${TradingOptions.Stops.StopLoss.PercentValue}\nTips: 1 is 1%\nOr choose other option:`, { reply_markup: this.CreateReplyTradeOptionsButtons() });
                break;
            }
            case 'ChangeStopLossTrailingValue': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                OldOptions.TradingOptions.Stops.StopLoss.IsTrailing = !OldOptions.TradingOptions.Stops.StopLoss.IsTrailing;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"StopLossTrailingValue" has been changed to ${OldOptions.TradingOptions.Stops.StopLoss.IsTrailing }`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyGeneralOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'ChangeTakeProfitPercentValue': {
                this.SetState(data);
                this.Bot.sendMessage(chatId, `Type a new value for "TakeProfitPercentValue":\nOld value: ${TradingOptions.Stops.TakeProfit}\nTips: 1 is 1% | 0 means disabled\nOr choose other option:`, { reply_markup: this.CreateReplyTradeOptionsButtons() });
                break;
            }
        }
    }
    ChangeTradingOptions = (optionName: string, value: string, chatId: number) => {
        switch (optionName) {
            case 'ChangeStopLossPercentValue': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValueFloat = parseFloat(value.replace(',', '.'));
                OldOptions.TradingOptions.Stops.StopLoss.PercentValue = fixedValueFloat;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"StopLossPercentValue" value has been changed to ${fixedValueFloat}`;
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyTradeOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
            case 'ChangeTakeProfitPercentValue': {
                this.SetState('');
                const OldOptions = OptionsManager.GetOptions();
                const fixedValueFloat = parseFloat(value.replace(',', '.'));
                OldOptions.TradingOptions.Stops.TakeProfit = fixedValueFloat;
                OptionsManager.ChangeOptions(OldOptions);
                const msg = `"TakeProfitPercent" value has been changed to ${fixedValueFloat}`
                this.Bot.sendMessage(chatId, msg, { reply_markup: this.CreateReplyTradeOptionsButtons(true) });
                this.SendMessage(msg, chatId);
                break;
            }
        }
    }

    GetTradeStatus = (): boolean => {
        return this.TradingAccess;
    }

    SendMessage = (message: string, sendingUser?: number) => {
        try {
            if (!TelegramControllerService.ignoreCommands) {
                const subscribedUsersJson = fs.readFileSync(this.dataPath, 'utf-8');
                const subscribedUsers: number[] = JSON.parse(subscribedUsersJson);

                subscribedUsers.filter(user => user !== sendingUser).forEach(userId => {
                    try {
                        this.Bot.sendMessage(userId, message, { reply_markup: this.CreateKeyBoard() });
                    } catch (e) {
                        if (e.message !== "ETELEGRAM: 403 Forbidden: bot was blocked by the user") {
                            throw  e;
                        }
                        this.DeleteSubscriber(userId);
                    }
                })
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error with sending message: ${e.message}`, [dls], true);
        }
    }

}