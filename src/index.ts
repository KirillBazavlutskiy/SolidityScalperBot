import Binance from 'binance-api-node';
import SolidityFinderService from "./services/SolidityFinderService/SolidityFinderService";
import TradingPairsService from "./services/TradingPairsListService/TradingPairsService";
import {BinanceTradesService} from "./services/BinanceTradesService/BinanceTradesService";
import DocumentLogService, {DocumentLogger} from "./services/DocumentLogService/DocumentLogService";
import {FontColor} from "./services/FontStyleObjects";
import * as fs from "fs";
import {SolidityFinderOptions} from "../Options/SolidityFInderOptions/SolidityFinderOptionsModels";
import {TradingStopOptions} from "../Options/TradeStopsOptions/TradeStopsOptionsModels";
import {TelegramControllerService} from "./services/TelegramControlerService/TelegramControlerService";

const apiKey = "PmEpiESene4CCbHpmjHO8Uz7hKqc9u57bEla9ibkP14ZmXIdtf8QAsqBcFt15YKB";
const secretKey = "5f97dmaPN48kNXYmcdEBtNKRwopfsaDWogJ9btKE1gCAIKO4z0q2IhLb4m1MfKxE";
const soundFilePath = './dist/sounds/notification-sound.mp3';
const TelegramBotKey = "6829379412:AAEYaXtF0T4aBZk4RSQyjbbpmRKcTkaHDgc";

const client = Binance({
    apiKey: apiKey,
    apiSecret: secretKey,
    getTime: () => new Date().getTime(),
});

const SolidityOptionsJson = fs.readFileSync('./Options/SolidityFinderOptions/SolidityFinderOptions.json', 'utf-8');
const TradeStopsOptionsJson = fs.readFileSync('./Options/TradeStopsOptions/TradeStopsOptions.json', 'utf-8');
export const SolidityFinderOption: SolidityFinderOptions = JSON.parse(SolidityOptionsJson);
export const TradeStopsOptions: TradingStopOptions = JSON.parse(TradeStopsOptionsJson);

export const sfs = new SolidityFinderService(client);
const bts = new BinanceTradesService(client);
export const dls = new DocumentLogger('./Logs/Logs.txt');
export const tls = new DocumentLogger('./Logs/TradeLogs.txt')
export const tcs = new TelegramControllerService(TelegramBotKey);

tcs.SendMessage('Bot has started!');

const fetchSolidity = async (): Promise<void> => {
    if (tcs.GetTradeStatus()) {
        TradingPairsService.TPWithSolidity = await sfs.FindAllSolidity(SolidityFinderOption.minVolume, SolidityFinderOption.ratioAccess, SolidityFinderOption.upToPriceAccess, SolidityFinderOption.checkReachingPriceDuration);
        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `Found solidity: ${TradingPairsService.TPWithSolidity.length}`, [ dls ]);
        TradingPairsService.TPWithSolidity.forEach(tp => { if (!TradingPairsService.CheckTPInTrade(tp, true)) bts.TradeSymbol(tp) } );
    } else {
        DocumentLogService.MadeTheNewLog([FontColor.FgGray], 'Search was canceled! Start id with telegram chat!', [ dls ], true);
    }
}

fetchSolidity()

setInterval(async () => {
    await fetchSolidity();
}, 60000);