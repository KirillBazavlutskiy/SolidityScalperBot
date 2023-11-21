export interface CalcTPSLOutput {
    TakeProfit: number;
    StopLoss: number;
}

export type CheckTPSLOutput = 'InTrade' | 'TP' | 'SL';

export type TradeStatus = 'watching' | 'broken' | 'inTrade' | 'disabled';
export type SolidityStatus = 'ready' | 'moved' | 'removed';
export type TradeType = 'long' | 'short';
