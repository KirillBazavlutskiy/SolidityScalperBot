export interface GeneraOptionsModel {
    ScreenerMode: boolean;
}

export interface SolidityFinderOptionsModel {
    MinimalVolume: number;
    RatioAccess: number;
    UpToPriceAccess: number;
    PriceUninterruptedDuration: number;
    TopGainersCount: number;
}

export interface SolidityWatchingOptionsModel {
    SolidityRemainderForTrade: number;
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
    GeneralOptions: GeneraOptionsModel;
    SolidityFinderOptions: SolidityFinderOptionsModel;
    SolidityWatchingOptions: SolidityWatchingOptionsModel;
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
    SolidityWatchingOptions: {
        SolidityRemainderForTrade: 0.4
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