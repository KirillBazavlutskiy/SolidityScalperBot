export interface SolidityFinderOptionsModel {
    MinimalVolume: number;
    RatioAccess: number;
    UpToPriceAccess: number;
    CheckReachingPriceDuration: number;
    TopPriceChangePercentCount: number;
}

export interface TradingOptionsModel {
    Stops: {
        TakeProfit: number;
        StopLoss: {
            IsTrailing: boolean;
            PercentValue: number;
        }
    },
    TradeOptions: {
        NominalQuantity: number;
    }
}

export interface OptionsModel {
    SolidityFinderOptions: SolidityFinderOptionsModel;
    TradingOptions: TradingOptionsModel;
}

export const DefaultOptionsValues: OptionsModel = {
    SolidityFinderOptions: {
        MinimalVolume: 1000000,
        RatioAccess: 20,
        UpToPriceAccess: 1.2,
        CheckReachingPriceDuration: 15,
        TopPriceChangePercentCount: 20,
    },
    TradingOptions: {
        Stops: {
            TakeProfit: 1,
            StopLoss: {
                IsTrailing: true,
                PercentValue: 0.3
            }
        },
        TradeOptions: {
            NominalQuantity: 20
        }
    }
}