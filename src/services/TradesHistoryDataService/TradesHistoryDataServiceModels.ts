import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";

export interface StopParams {
    price: number;
    upToPrice: number;
}

export interface TradeModel extends SolidityModel{
    Stops: {
        TakeProfit: StopParams;
        StopLoss: StopParams;
    }
    Profit: string;
    DealTime: string;
}
