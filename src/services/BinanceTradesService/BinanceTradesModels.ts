export type TradeStatus = 'watching' | 'reached' | 'inTrade' | 'disabled';
export type SolidityStatus = 'ready' | 'moved' | 'removed' | 'ends';
export type TradeType = 'long' | 'short';

export type StreamBid = [ number, number ];