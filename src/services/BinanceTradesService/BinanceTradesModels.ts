export interface CalcTPSLOutput {
    TakeProfit: number;
    StopLoss: number;
}

export type CheckTPSLOutput = 'InTrade' | 'TP' | 'SL';

export type TradeStatus = 'watching' | 'reached' | 'inTrade' | 'disabled';
export type SolidityStatus = 'ready' | 'moved' | 'removed' | 'ends';
export type TradeType = 'long' | 'short';

export type StreamBid = [ number, number ];