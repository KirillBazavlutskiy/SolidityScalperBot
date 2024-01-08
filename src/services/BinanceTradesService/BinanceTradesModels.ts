export type TradeStatus = 'watching' | 'reached' | 'inTrade' | 'disabled';
export type SolidityStatus = 'ready' | 'moved' | 'removed' | 'ends';
export type TradeType = 'long' | 'short';

export type StreamBid = [ string, string ];
export interface UpdateMessage {
    Message: Buffer;
    Type: 'Trade' | 'BookDepth';
}