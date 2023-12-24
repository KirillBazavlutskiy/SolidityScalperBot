import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import {BinanceOrdersCalculatingKit} from "../BinanceTradesService/BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: SolidityModel[] = [];

    static LogTradingPairs = (): string => {
        let result;

        if (this.TPWithSolidityInTrade.length !== 0) {
            result =
                `${TradingPairsService.TPWithSolidityInTrade.map(TradingPair => {
                    return (
                        `${TradingPair.Symbol}\n` +
                        `${BinanceOrdersCalculatingKit.RoundUp(BinanceOrdersCalculatingKit.CalcSimplifiedRatio(TradingPair.Solidity.UpToPrice, TradingPair.Solidity.Type) * 100, 4)}%\n` +
                        `Trade Type: ${TradingPair.Solidity.Type === 'asks' ? 'Long' : 'Short'}\n` +
                        `Waiting for price: ${TradingPair.Solidity.Price}\n` + 
                        `Last price: ${TradingPair.Price}`
                    );
                }).join('\n\n')
            }`
        } else {
            result = 'No trading pairs active!';
        }

        return result;
    }

    static AddTPInTrade = (solidityModel: SolidityModel) => {
        this.TPWithSolidityInTrade.push(solidityModel);
    }

    static ChangeTPInTrade = (solidityModel: SolidityModel) => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(TradingPair => TradingPair.Symbol === solidityModel.Symbol);

        if (TradingPairIndex !== -1) {
            this.TPWithSolidityInTrade[TradingPairIndex] = solidityModel;
        }
    }

    static DeleteTPInTrade = (symbol: string) => {
        this.TPWithSolidityInTrade = this.TPWithSolidityInTrade.filter(e => e.Symbol !== symbol);
    }

    static CheckTPInTrade = (solidityModel: SolidityModel, addToList: boolean = false): boolean => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(TradingPair => TradingPair.Symbol === solidityModel.Symbol);

        if (TradingPairIndex === -1) {
            if (addToList) this.AddTPInTrade(solidityModel);
            return false;
        } else {
            return true
        }
    };
}

export default TradingPairsService;