export type TradeStatus = 'Active' | 'Closed';
export interface UpdateLastPriceOutput {
    TradeStatus: TradeStatus;
    CurrentProfit: number;
}