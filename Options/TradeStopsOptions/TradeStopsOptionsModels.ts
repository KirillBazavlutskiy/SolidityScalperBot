export interface TradingStopOptions {
    Stops: {
        TakeProfit: number;
        TrailingStopLoss: number;
    },
    TradeOptions: {
        NominalQuantity: number;
    }
}