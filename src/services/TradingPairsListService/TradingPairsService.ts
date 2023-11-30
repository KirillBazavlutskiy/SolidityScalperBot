import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {sfs} from "../../index";

class TradingPairsService {
    static TPWithSolidity: SolidityModel[] = [];
    private static TPWithSolidityInTrade: SolidityModel[] = [];

    static LogTradingPairs = (): void => {
        const TradingSymbols = this.TPWithSolidityInTrade.map(TradingPair => TradingPair.symbol);
        const TradingPairsUpToPrice = this.TPWithSolidityInTrade.map(TradingPair => this.ShowUpToPrice(TradingPair.solidity.upToPrice));

        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `\t${TradingSymbols.join('\t\t')}`, [], true);
        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `\t${TradingPairsUpToPrice.join('\t\t')}`, [], true);
    }

    static ShowUpToPrice = (UpToPrice: number) => {
        return `${UpToPrice > 1 ? '-' : '+'}${(parseFloat(sfs.CalcRatio(UpToPrice).toFixed(3)) * 100).toFixed(3)}%`;
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
        if (!this.TPWithSolidityInTrade.includes(solidityModel)) {
            if (addToList) this.ChangeTPInTrade(solidityModel);
            return false;
        } else {
            return true
        }
    };
}

export default TradingPairsService;
