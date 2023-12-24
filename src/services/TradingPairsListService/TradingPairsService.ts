import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import {BinanceOrdersCalculatingKit} from "../BinanceTradesService/BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {OpenTradesManager} from "../BinanceTradesService/OpenTradesManager/OpenTradesManager";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: SolidityModel[] = [];

    static LogTradingPairs = (): string => {
        const TradingPairsUpToPrice = this.TPWithSolidityInTrade.map(TradingPair => OpenTradesManager.ShowProfit(TradingPair.Solidity.UpToPrice));
        let result;

        if (this.TPWithSolidityInTrade.length !== 0) {
            result = `${TradingPairsService.TPWithSolidityInTrade.map(TradingPair => `${TradingPair.Symbol}\n${BinanceOrdersCalculatingKit.RoundUp(BinanceOrdersCalculatingKit.CalcSimplifiedRatio(TradingPair.Solidity.UpToPrice, TradingPair.Solidity.Type) * 100, 4)}%`).join('\n\n')}`;
        } else {
            result = 'No trading pairs active!';
        }

        return result;
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