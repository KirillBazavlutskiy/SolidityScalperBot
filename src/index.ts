import Binance from 'binance-api-node';
import SolidityFinderService from "./services/SolidityFinderService/SolidityFinderService";
import TradingPairsService from "./services/TradingPairsListService/TradingPairsService";
import {BinanceTradesService} from "./services/BinanceTradesService/BinanceTradesService";
import DocumentLogService, {DocumentLogger} from "./services/DocumentLogService/DocumentLogService";
import {FontColor} from "./services/FontStyleObjects";
import {TelegramControllerService} from "./services/TelegramControlerService/TelegramControlerService";
import {OptionsManager} from "./services/OptionsManager/OptionsManager";

const apiKey = "PmEpiESene4CCbHpmjHO8Uz7hKqc9u57bEla9ibkP14ZmXIdtf8QAsqBcFt15YKB";
const secretKey = "5f97dmaPN48kNXYmcdEBtNKRwopfsaDWogJ9btKE1gCAIKO4z0q2IhLb4m1MfKxE";
const soundFilePath = './dist/sounds/notification-sound.mp3';
const TelegramBotKey = "6829379412:AAEYaXtF0T4aBZk4RSQyjbbpmRKcTkaHDgc";

const client = Binance({
    apiKey: apiKey,
    apiSecret: secretKey,
    getTime: () => new Date().getTime(),
});

export const sfs = new SolidityFinderService(client);
const bts = new BinanceTradesService(client);
export const dls = new DocumentLogger('./Logs/Logs.txt');
export const tls = new DocumentLogger('./Logs/TradeLogs.txt')
export const tcs = new TelegramControllerService(TelegramBotKey, client);

tcs.SendMessage('Bot has started!');

const fetchSolidity = async (): Promise<void> => {
    if (tcs.GetTradeStatus()) {
        const Options = OptionsManager.GetOptions();
        TradingPairsService.TPWithSolidity = await sfs.FindAllSolidity(Options.SolidityFinderOptions.MinimalVolume, Options.SolidityFinderOptions.RatioAccess, Options.SolidityFinderOptions.UpToPriceAccess, Options.SolidityFinderOptions.PriceUninterruptedDuration, Options.SolidityFinderOptions.TopGainersCount);
        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `Found solidity: ${TradingPairsService.TPWithSolidity.length}`, [ dls ]);
        TradingPairsService.TPWithSolidity.forEach(tp => { if (!TradingPairsService.CheckTPInTrade(tp, true)) bts.TradeSymbol(tp, Options.SolidityFinderOptions, Options.TradingOptions) } );
    } else {
        DocumentLogService.MadeTheNewLog([FontColor.FgGray], 'Search was canceled! Start id with telegram chat!', [ dls ], true);
    }
}

fetchSolidity()

setInterval(async () => {
    await fetchSolidity();
}, 60000);