import Binance from 'binance-api-node';
import SolidityFinderService from "./services/SolidityFinderService/SolidityFinderService";
import TradingPairsService from "./services/TradingPairsListService/TradingPairsService";
import {BinanceTradesService} from "./services/BinanceTradesService/BinanceTradesService";
import DocumentLogService, {DocumentLogger} from "./services/DocumentLogService/DocumentLogService";
import {FontColor} from "./services/FontStyleObjects";
import beep from 'beepbeep';
import * as fs from "fs";
import {SolidityFinderOptions} from "../Options/SolidityFInderOptions/SolidityFinderOptionsModels";
import {TradingStopOptions} from "../Options/TradeStopsOptions/TradeStopsOptionsModels";

const apiKey = "PmEpiESene4CCbHpmjHO8Uz7hKqc9u57bEla9ibkP14ZmXIdtf8QAsqBcFt15YKB";
const secretKey = "5f97dmaPN48kNXYmcdEBtNKRwopfsaDWogJ9btKE1gCAIKO4z0q2IhLb4m1MfKxE";

const soundFilePath = './dist/sounds/notification-sound.mp3';

const client = Binance({
    apiKey: apiKey,
    apiSecret: secretKey,
    getTime: () => new Date().getTime(),
});

const SoldityOptionsJson = fs.readFileSync('./Options/SolidityFinderOptions/SolidityFinderOptions.json', 'utf-8');
export const SolidityFinderOption: SolidityFinderOptions = JSON.parse(SoldityOptionsJson);

const TradeStopsOptionsJson = fs.readFileSync('./Options/TradeStopsOptions/TradeStopsOptions.json', 'utf-8');
export const TradeStopsOptions: TradingStopOptions = JSON.parse(TradeStopsOptionsJson);

export const sfs = new SolidityFinderService(client);
const bts = new BinanceTradesService(client);
export const dls = new DocumentLogger('./Logs/Logs.txt');
export const tls = new DocumentLogger('./Logs/TradeLogs.txt')

const fetchSolidity = async (): Promise<void> => {
    TradingPairsService.TPWithSolidity = await sfs.FindAllSolidity(SolidityFinderOption.minVolume, SolidityFinderOption.ratioAccess, SolidityFinderOption.upToPriceAccess);
    DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `Found solidity: ${TradingPairsService.TPWithSolidity.length}`, [ dls ]);
    TradingPairsService.TPWithSolidity.forEach(tp => { if (!TradingPairsService.CheckTPInTrade(tp, true)) bts.TradeSymbol(tp) } );
}

fetchSolidity()

setInterval(async () => {
    await fetchSolidity();
}, 60000);
