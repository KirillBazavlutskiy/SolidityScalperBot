import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: string[] = [];

    static LogTPWithSolidity = (): void => {
        this.TPWithSolidity.forEach(solidityModel => {
            console.log(
                `Symbol: ${solidityModel.symbol}\tLast Price: ${solidityModel.price}\n` +
                'Solidity:\n' +
                    `Limit Type: ${solidityModel.solidity.type}\tLimit price: ${solidityModel.solidity.price}\tLimit Volume: ${solidityModel.solidity.quantity}\n` +
                    `Solidity Ratio: ${solidityModel.solidity.ratio.toFixed(3)}\tUp to price: ${(solidityModel.solidity.upToPrice * 100).toFixed(2)}%\n`
            );
        })
    }

    static AddTPInTrade = (symbol: string) => this.TPWithSolidityInTrade.push(symbol)

    static DeleteTPInTrade = (symbol: string) => {
        this.TPWithSolidityInTrade = this.TPWithSolidityInTrade.filter(e => e !== symbol);
    }

    static CheckTPInTrade = (symbol: string, addToList: boolean = false): boolean => {
        if (!this.TPWithSolidityInTrade.includes(symbol)) {
            if (addToList) this.AddTPInTrade(symbol);
            return false;
        } else {
            return true
        }
    };
}

export default TradingPairsService;
