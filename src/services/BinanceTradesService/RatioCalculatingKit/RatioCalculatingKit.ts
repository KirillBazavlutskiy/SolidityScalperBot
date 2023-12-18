import {LimitType} from "../../SolidityFinderService/SolidityFinderModels";

export class RatioCalculatingKit {
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
}