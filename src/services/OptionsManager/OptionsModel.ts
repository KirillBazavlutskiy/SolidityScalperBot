export interface GeneraOptions {
    ScreenerMode: boolean;
}

export interface SolidityFinderOptionsModel {
    MinimalVolume: number;
    RatioAccess: number;
    UpToPriceAccess: number;
    PriceUninterruptedDuration: number;
    TopGainersCount: number;
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
    GeneralOptions: GeneraOptions;
    SolidityFinderOptions: SolidityFinderOptionsModel;
    TradingOptions: TradingOptionsModel;
}

export const DefaultOptionsValues: OptionsModel = {
    GeneralOptions: {
        ScreenerMode: false,
    },
    SolidityFinderOptions: {
        MinimalVolume: 1000000,
        RatioAccess: 20,
        UpToPriceAccess: 1.2,
        PriceUninterruptedDuration: 15,
        TopGainersCount: 20,
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