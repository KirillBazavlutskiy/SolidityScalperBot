import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";

export interface StopParams {
    Price: number;
    UpToPrice: number;
}

export interface TradeModel extends SolidityModel{
    Stops: {
        TakeProfit: StopParams;
        StopLoss: StopParams;
    }
    Profit: number;
    InDealTime: string;
    TradeTime: Date;
    Edges: {
        MaxPrice: number;
        MinPrice: number;
    }
    SolidityQuantityHistory: number[]
}