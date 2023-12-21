import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {sfs} from "../../index";
import {TradeType} from "../BinanceTradesService/BinanceTradesModels";
import solidityFinderService from "../SolidityFinderService/SolidityFinderService";
import {BinanceOrdersCalculatingKit} from "../BinanceTradesService/BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {OpenTradesManager} from "../BinanceTradesService/OpenTradesManager/OpenTradesManager";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: SolidityModel[] = [];

    static LogTradingPairs = (): void => {
        const TradingSymbols = this.TPWithSolidityInTrade.map(TradingPair => TradingPair.Symbol.padEnd(16, ' '));
        const TradingPairsUpToPrice = this.TPWithSolidityInTrade.map(TradingPair => OpenTradesManager.ShowProfit(TradingPair.Solidity.UpToPrice));

        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `\t${TradingSymbols.join('\t')}\n` +
                                                            `\t\t\t\t${TradingPairsUpToPrice.join('\t\t')}`
        , [], true);
    }

    static ChangeTPInTrade = (solidityModel: SolidityModel) => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(TradingPair => TradingPair.Symbol === solidityModel.Symbol);

        if (TradingPairIndex === -1) {
            this.TPWithSolidityInTrade.push(solidityModel);
        } else {
            this.TPWithSolidityInTrade[TradingPairIndex] = solidityModel;
        }
    }

    static DeleteTPInTrade = (symbol: string) => {
        this.TPWithSolidityInTrade = this.TPWithSolidityInTrade.filter(e => e.Symbol !== symbol);
    }

    static CheckTPInTrade = (solidityModel: SolidityModel, addToList: boolean = false): boolean => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(TradingPair => TradingPair.Symbol === solidityModel.Symbol);

        if (TradingPairIndex === -1) {
            if (addToList) this.ChangeTPInTrade(solidityModel);
            return false;
        } else {
            return true
        }
    };
}

export default TradingPairsService;