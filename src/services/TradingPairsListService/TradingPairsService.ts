import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {sfs} from "../../index";
import {TradeType} from "../BinanceTradesService/BinanceTradesModels";
import solidityFinderService from "../SolidityFinderService/SolidityFinderService";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: SolidityModel[] = [];

    static LogTradingPairs = (): void => {
        const TradingSymbols = this.TPWithSolidityInTrade.map(TradingPair => TradingPair.symbol.padEnd(16, ' '));
        const TradingPairsUpToPrice = this.TPWithSolidityInTrade.map(TradingPair => this.ShowProfit(TradingPair.solidity.upToPrice));

        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `\t${TradingSymbols.join('\t')}\n` +
                                                            `\t\t\t\t${TradingPairsUpToPrice.join('\t\t')}`
        , [], true);
    }

    static ShowProfit = (UpToPrice: number, TradeType?: TradeType) => {
        let Profit: string;
        if (TradeType !== undefined) {
            switch (TradeType) {
                case "long":
                    Profit = `${(parseFloat((1 - UpToPrice).toFixed(4)) * 100).toFixed(4)}%`;
                    break;
                case "short":
                    Profit = `${(parseFloat((UpToPrice - 1).toFixed(4)) * 100).toFixed(4)}%`;
                    break;
            }
        } else {
            Profit = `${UpToPrice > 1 ? '-' : '+'}${(parseFloat(sfs.CalcRatio(UpToPrice).toFixed(4)) * 100).toFixed(4)}%`;
        }
        return Profit;
    }

    static ChangeTPInTrade = (solidityModel: SolidityModel) => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(TradingPair => TradingPair.symbol === solidityModel.symbol);

        if (TradingPairIndex === -1) {
            this.TPWithSolidityInTrade.push(solidityModel);
        } else {
            this.TPWithSolidityInTrade[TradingPairIndex] = solidityModel;
        }
    }

    static DeleteTPInTrade = (symbol: string) => {
        this.TPWithSolidityInTrade = this.TPWithSolidityInTrade.filter(e => e.symbol !== symbol);
    }

    static CheckTPInTrade = (solidityModel: SolidityModel, addToList: boolean = false): boolean => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(TradingPair => TradingPair.symbol === solidityModel.symbol);

        if (TradingPairIndex === -1) {
            if (addToList) this.ChangeTPInTrade(solidityModel);
            return false;
        } else {
            return true
        }
    };
}

export default TradingPairsService;