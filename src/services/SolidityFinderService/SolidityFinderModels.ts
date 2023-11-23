export type LimitType = 'bids' | 'asks';

export interface SolidityModel {
    symbol: string;
    price: number;
    quoteVolume: number;
    solidity?: SolidityTicket;
}

export interface SolidityTicket {
    type: LimitType;
    price: number;
    quantity: number;
    ratio: number;
    upToPrice: number;
}
