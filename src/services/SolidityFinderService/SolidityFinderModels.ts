export type LimitType = 'bids' | 'asks';

export interface SolidityModel {
    Symbol: string;
    Price: number;
    QuoteVolume: number;
    Solidity?: SolidityTicket;
}

export interface SolidityTicket {
    Type: LimitType;
    Price: number;
    Quantity: number;
    MaxQuantity: number;
    Ratio: number;
    UpToPrice: number;
}