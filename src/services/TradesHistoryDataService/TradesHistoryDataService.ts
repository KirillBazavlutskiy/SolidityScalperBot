import {TradeModel} from "./TradesHistoryDataServiceModels";
import * as fs from "fs";

export class TradesHistoryDataService {
    static TradesDataSrc = './data/Trades.json';

    static AddTradeInfo = (TradeModel: TradeModel) => {
        const OldDataJson = fs.readFileSync(this.TradesDataSrc, 'utf-8');
        const OldData: TradeModel[] = JSON.parse(OldDataJson);

        const newData = [ ...OldData, TradeModel ];
        fs.writeFileSync(this.TradesDataSrc, JSON.stringify(newData));
    }
}
