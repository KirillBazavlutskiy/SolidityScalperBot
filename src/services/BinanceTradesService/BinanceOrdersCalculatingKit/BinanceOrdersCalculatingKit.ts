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

    static CalcSimplifiedRatio = (UpToPrice: number, fractionDigits: number = 0,  LimitType?: LimitType, ): number => {
        let ratio;
        if (LimitType) {
            if (LimitType === 'asks') {
                ratio = 1 - UpToPrice;
            } else if (LimitType === 'bids') {
                ratio = UpToPrice - 1;
            }
        } else {
            if (UpToPrice < 1) {
                ratio = 1 - UpToPrice;
            } else {
                ratio = UpToPrice - 1;
            }
        }

        if (fractionDigits !== 0) ratio = this.RoundUp(ratio, fractionDigits);
        return ratio;
    }

    static ShowUptoPrice = (UpToPrice: number, LimitType: LimitType, fractionDigits: number = 0) => {
        return `${LimitType === 'asks' ? '+' : '-'}${this.RoundUp(this.CalcSimplifiedRatio(UpToPrice, fractionDigits, LimitType) * 100, fractionDigits)}%`;
    }

    static CalcRealRatio = (UpToPrice: number, LimitType: LimitType): number => {
        if (LimitType === 'asks') {
            return 1 - UpToPrice;
        } else if (LimitType === 'bids') {
            return UpToPrice + 1;
        }
    }

    static RoundUp = (num: number, fractionDigits: number) => {
        const floatMultiplier = 10 ** fractionDigits;
        return Math.round(num * floatMultiplier) / floatMultiplier;
    }

    static GetFractionDigitsLength = (number: number) => {
        const numIndex = number.toFixed(15).lastIndexOf("1");
        return numIndex === 0 ? 0 : numIndex - 1;
    }

    static FindClosestLimitOrder = (price: number, tickSize: number): number => {
        const floatLength = this.GetFractionDigitsLength(tickSize);
        return this.RoundUp(price, floatLength);
    }
}