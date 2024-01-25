import Binance from 'binance-api-node';
import SolidityFinderService from "./services/SolidityFinderService/SolidityFinderService";
import TradingPairsService from "./services/TradingPairsListService/TradingPairsService";
import {BinanceTradesService} from "./services/BinanceTradesService/BinanceTradesService";
import DocumentLogService, {DocumentLogger} from "./services/DocumentLogService/DocumentLogService";
import {FontColor} from "./services/FontStyleObjects";
import {TelegramControllerService} from "./services/TelegramControlerService/TelegramControlerService";
import {OptionsManager} from "./services/OptionsManager/OptionsManager";
import {ApiKeysService} from "./services/ApiKeysService/ApiKeysService";
import {CandleAnalyzeService} from "./services/SolidityFinderService/CandleAnalyzeService/CandleAnalyzeService";

let client;
export let tcs;
const ApiKeys = ApiKeysService.FetchApiKeys();

try {
    client = Binance({
        apiKey: ApiKeys.BinanceKeys.apiKey,
        apiSecret: ApiKeys.BinanceKeys.apiSecret,
        getTime: () => new Date().getTime(),
    });
} catch (e) {
    client =Binance();
    DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Binance client wasn't authenticated!`);
}

tcs = new TelegramControllerService(
    OptionsManager.GetOptions().GeneralOptions.UseTelegramBot ? ApiKeys?.TelegramBotKey || '' : '', client
);

export const sfs = new SolidityFinderService(client);
export const dls = new DocumentLogger('./Logs/Logs.txt');
export const tls = new DocumentLogger('./Logs/TradeLogs.txt');

process.on('uncaughtException', function (err) {
  DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Unhandled error! | ${err.message}`, [ dls ], true, true);
});

CandleAnalyzeService.SetBinanceClient(client);

DocumentLogService.MadeTheNewLog([FontColor.FgGreen], `The bot was launched! | Version: ${process.env.npm_package_version}`,
    [dls], true, true);

const fetchSolidity = async (): Promise<void> => {
    if (tcs.GetTradeStatus()) {
        const Options = OptionsManager.GetOptions();
        TradingPairsService.TPWithSolidity = await sfs.FindAllSolidity(Options.SolidityFinderOptions.MinimalVolume, Options.SolidityFinderOptions.RatioAccess, Options.SolidityFinderOptions.UpToPriceAccess, Options.SolidityFinderOptions.PriceUninterruptedDuration, Options.SolidityFinderOptions.TopGainersCount);
        TradingPairsService.TPWithSolidity.forEach(tp => {
            if (!TradingPairsService.CheckTPInTrade(tp.Symbol)) {
                const BinanceTrader = new BinanceTradesService(client, tp, Options);
                BinanceTrader.StartWatching();
                TradingPairsService.AddTPInTrade(BinanceTrader);
            }
        } );
    } else {
        DocumentLogService.MadeTheNewLog([FontColor.FgGray], 'Search was canceled! Start id with telegram chat!', [ dls ], true);
    }
}

fetchSolidity()

setInterval(async () => {
    await fetchSolidity();
}, 60000);