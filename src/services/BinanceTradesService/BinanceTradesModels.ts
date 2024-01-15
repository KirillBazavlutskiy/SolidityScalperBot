import {PartialDepth, WSTrade} from "binance-api-node";

export type TradeStatus = 'watching' | 'reached' | 'inTrade' | 'disabled';
export type SolidityStatus = 'ready' | 'moved' | 'removed' | 'ends';
export type TradeType = 'long' | 'short';

export type StreamBid = [ string, string ];

export type UpdateMessage = BookDepthUpdate | TradeUpdate;

export type BookDepthUpdate = {
    Message: PartialDepth;
    Type: 'BookDepthUpdate';
}

export type TradeUpdate = {
    Message: WSTrade;
    Type: 'TradeUpdate';
}