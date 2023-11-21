import Binance from 'binance-api-node';
import SolidityFinderService from "./services/SolidityFinderService/SolidityFinderService";
import TradingPairsService from "./services/TradingPairsListService/TradingPairsService";
import {BinanceTradesService} from "./services/BinanceTradesService/BinanceTradesService";
import DocumentLogService, {DocumentLogger} from "./services/DocumentLogService/DocumentLogService";
import Speaker from "speaker";
import * as fs from "fs";

const apiKey = "PmEpiESene4CCbHpmjHO8Uz7hKqc9u57bEla9ibkP14ZmXIdtf8QAsqBcFt15YKB";
const secretKey = "5f97dmaPN48kNXYmcdEBtNKRwopfsaDWogJ9btKE1gCAIKO4z0q2IhLb4m1MfKxE";

const soundFilePath = 'C:/Users/BAZIK/Documents/work/NodeJS/ScalperBot/dist/sounds/notification-sound.mp3';

const speaker = new Speaker({
    channels: 2,
    bitDepth: 16,
    sampleRate: 44100
});

const audioFileStream = fs.createReadStream(soundFilePath);

export const PlaySound = () => {
    audioFileStream.pipe(speaker);
}

const client = Binance({
    apiKey: apiKey,
    apiSecret: secretKey,
    getTime: () => new Date().getTime(),
});

export const solidityFinderParams = {
    minVolume: 50000,
    ratioAccess: 20,
    upToPriceAccess: 0.015,
}

export const sfs = new SolidityFinderService(client);
const bts = new BinanceTradesService(client);
export const dls = new DocumentLogger('C:/Users/BAZIK/Documents/work/NodeJS/ScalperBot/src/Logs.txt');
export const tls = new DocumentLogger('C:/Users/BAZIK/Documents/work/NodeJS/ScalperBot/src/TradeLogs.txt')

const fetchSolidity = async (): Promise<void> => {
    // PlaySound();
    TradingPairsService.TPWithSolidity = await sfs.FindAllSolidity(solidityFinderParams.minVolume, solidityFinderParams.ratioAccess, solidityFinderParams.upToPriceAccess);
    DocumentLogService.MadeTheNewLog(`Found solidity: ${TradingPairsService.TPWithSolidity.length}`, [ dls ]);
    TradingPairsService.TPWithSolidity.forEach(tp => { if (!TradingPairsService.CheckTPInTrade(tp.symbol, true)) bts.TradeSymbol(tp) } );
}

fetchSolidity()

setInterval(async () => {
    await fetchSolidity();
}, 60000);
