import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import {BinanceOrdersCalculatingKit} from "../BinanceTradesService/BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {BinanceTradesService} from "../BinanceTradesService/BinanceTradesService";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: BinanceTradesService[] = [];

    static LogTradingPairs = (): string => {
        let result;

        if (this.TPWithSolidityInTrade.length !== 0) {
            result =
                `${this.TPWithSolidityInTrade.map(BinanceTrader => {
                    const TradingPair = BinanceTrader.GetTradingPairData();
                    return (
                        `${TradingPair.Symbol}\n` +
                        `Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(TradingPair.Solidity.UpToPrice, TradingPair.Solidity.Type, 4)}\n` +
                        `Trade type: ${TradingPair.Solidity.Type === 'asks' ? 'Long' : 'Short'}\n` +
                        `Solidity Quantity: ${TradingPair.Solidity.Quantity}\n` +
                        `Max Solidity Quantity: ${TradingPair.Solidity.MaxQuantity}\n` +
                        `Waiting for price: ${TradingPair.Solidity.Price}$\n` + 
                        `Last price: ${TradingPair.Price}$`
                    );
                }).join('\n\n')
            }`
        } else {
            result = 'No trading pairs active!';
        }

        return result;
    }

    static AddTPInTrade = (BinanceTrader: BinanceTradesService) => {
        this.TPWithSolidityInTrade.push(BinanceTrader);
    }

    static DeleteTPInTrade = (symbol: string) => {
        this.TPWithSolidityInTrade = this.TPWithSolidityInTrade.filter(BinanceTrader => BinanceTrader.Symbol !== symbol);
    }

    static CheckTPInTrade = (Symbol: string): boolean => {
        const TradingPairIndex = this.TPWithSolidityInTrade.findIndex(BinanceTraderInWork =>
            BinanceTraderInWork.Symbol === Symbol);

        return TradingPairIndex !== -1;
    };
}

export default TradingPairsService;