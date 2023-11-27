import Binance from 'binance-api-node';
import SolidityFinderService from "./services/SolidityFinderService/SolidityFinderService";
import TradingPairsService from "./services/TradingPairsListService/TradingPairsService";
import {BinanceTradesService} from "./services/BinanceTradesService/BinanceTradesService";
import DocumentLogService, {DocumentLogger} from "./services/DocumentLogService/DocumentLogService";
import {FontColor} from "./services/FontStyleObjects";
import beep from 'beepbeep';

const apiKey = "PmEpiESene4CCbHpmjHO8Uz7hKqc9u57bEla9ibkP14ZmXIdtf8QAsqBcFt15YKB";
const secretKey = "5f97dmaPN48kNXYmcdEBtNKRwopfsaDWogJ9btKE1gCAIKO4z0q2IhLb4m1MfKxE";

const soundFilePath = './dist/sounds/notification-sound.mp3';

const client = Binance({
    apiKey: apiKey,
    apiSecret: secretKey,
    getTime: () => new Date().getTime(),
});

export const solidityFinderParams = {
    minVolume: 50000,
    ratioAccess: 20,
    upToPriceAccess: 0.012,
}

export const sfs = new SolidityFinderService(client);
const bts = new BinanceTradesService(client);
export const dls = new DocumentLogger('./Logs/Logs.txt');
export const tls = new DocumentLogger('./Logs/TradeLogs.txt')

const fetchSolidity = async (): Promise<void> => {
    TradingPairsService.TPWithSolidity = await sfs.FindAllSolidity(solidityFinderParams.minVolume, solidityFinderParams.ratioAccess, solidityFinderParams.upToPriceAccess);
    DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `Found solidity: ${TradingPairsService.TPWithSolidity.length}`, [ dls ]);
    TradingPairsService.TPWithSolidity.forEach(tp => { if (!TradingPairsService.CheckTPInTrade(tp.symbol, true)) bts.TradeSymbol(tp) } );
}

fetchSolidity()

setInterval(async () => {
    await fetchSolidity();
}, 60000);
