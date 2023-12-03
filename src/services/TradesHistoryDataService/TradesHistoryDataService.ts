import {TradeModel} from "./TradesHistoryDataServiceModels";
import fs from "fs";
import path from "path";

export class TradesHistoryDataService {
    static TradesDataSrc = './data/Trades.json';

    static AddTradeInfo = async (TradeModel: TradeModel) => {
        const dirPath = path.dirname(this.TradesDataSrc);

        try {
            fs.existsSync(dirPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                fs.mkdirSync(dirPath, { recursive: true });
            } else {
                throw error;
            }
        }

        let OldData: TradeModel[];
        try {
            const OldDataJson = fs.readFileSync(this.TradesDataSrc, 'utf-8');
            OldData = JSON.parse(OldDataJson);
        } catch (e) {
            if (e.code === 'ENOENT') {
                OldData = [];
            } else {
                throw e;
            }
        }

        const newData = [ ...OldData, TradeModel ];
        fs.writeFileSync(this.TradesDataSrc, JSON.stringify(newData), { flag: 'w+' });
    }
}