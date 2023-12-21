import {LimitType} from "../../SolidityFinderService/SolidityFinderModels";
import {TradeType} from "../BinanceTradesModels";

export class BinanceOrdersCalculatingKit {
    static CheckReachingPrice = (price: number, targetPrice: number, tradeType: TradeType) => {
        if (tradeType === 'long') {
            return price >= targetPrice;
        } else {
            return price <= targetPrice;
        }
    }
    static CalcPriceByRatio = (price: number, ratio: number, limitType: LimitType, tickSize: number) => {
        const realRatio = this.CalcRealRatio(ratio, limitType);
        return this.FindClosestLimitOrder(price * realRatio, tickSize);
    }

    static CalcRatioChange = (ratio: number) => {
        if (ratio > 1) {
            return ratio - 1;
        } else if (ratio < 1) {
            return 1 - ratio;
        }
    }

    static CalcSimplifiedRatio = (UpToPrice: number, LimitType: LimitType): number => {
        if (LimitType === 'asks') {
            return 1 - UpToPrice;
        } else if (LimitType === 'bids') {
            return UpToPrice - 1;
        }
    }

    static CalcRealRatio = (UpToPrice: number, LimitType: LimitType): number => {
        if (LimitType === 'asks') {
            return 1 - UpToPrice;
        } else if (LimitType === 'bids') {
            return UpToPrice + 1;
        }
    }


    static FindClosestLimitOrder = (price: number, tickSize: number): number => {
        const numIndex = tickSize.toFixed(15).lastIndexOf("1");
        const floatLenght = numIndex === 0 ? 0 : numIndex - 1;

        const floatMultiplier = 10 ** floatLenght;
        return Math.round(price * floatMultiplier) / floatMultiplier;
    }
}