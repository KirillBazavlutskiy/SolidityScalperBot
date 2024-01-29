import {Binance, CandleChartInterval, CandleChartInterval_LT} from "binance-api-node";

import {
    SymbolDensityCoefficientInterface,
    SymbolVolatilityInterface
} from "./CalcCoefficientModels";

export class CandleAnalyzeService {
    private static client: Binance;
    private static coefficient: number = 0.5;

    static SetBinanceClient = (client: Binance) => {
        this.client = client;
    }

    static CheckPriceTouchingOnPeriod = async (symbol: string, targetPrice: number, durationMinutes: number) => {
        try {
            const candles = await this.client.candles({
                symbol,
                interval: CandleChartInterval.ONE_MINUTE,
                limit: durationMinutes,
            });

            let checkResult = false;

            candles.forEach(candle => {
                const result = parseFloat(candle.low) < targetPrice && targetPrice < parseFloat(candle.high);
                if (result) checkResult = true;
            });

            return checkResult;
        } catch (e) {
            throw e;
        }
    }

    static CheckForAcceptableAveragePriceChange = async (symbol: string, durationMinutes: number, acceptablePriceChange: number) => {
        const priceChange = await this.GetAveragePriceChange(symbol, durationMinutes);
        return ({ access: Math.abs(priceChange)  <= acceptablePriceChange, priceChange: priceChange });
    }

    static GetAveragePriceChange = async (symbol: string, durationMinutes: number): Promise<number> => {
        const candles = await this.client.candles({
            symbol,
            interval: CandleChartInterval.ONE_MINUTE,
            limit: durationMinutes
        });

        const sumOpenPrice = candles.reduce(
            (sum, candle) => sum + parseFloat(candle.open),
            0
        )
        const averageOpenPrice = sumOpenPrice / durationMinutes;
        const lastCandle = candles[0];

        return ((parseFloat(lastCandle.close) - averageOpenPrice) / averageOpenPrice) * 100;
    }


    static GetVolumeOnPeriod = async (symbol: string, durationMinutes) => {
        try {
            const candles = await this.client.candles({
                symbol,
                interval: CandleChartInterval.ONE_MINUTE,
                limit: durationMinutes,
            });

            return candles.reduce(
                (sumVolume, candle) => sumVolume + parseFloat(candle.volume),
                0
            )
        } catch (e) {
            throw e;
        }
    }

    static getVolume = async (symbol: string, interval: CandleChartInterval_LT = "1h", limit: number = 25) => {
        const candlesData = await this.client.candles({symbol: symbol, interval: interval, limit: limit});

        let tickerVolume:number = 0;
        candlesData.forEach(candle => tickerVolume += parseFloat(candle.volume));

        const lastCandleData = candlesData[candlesData.length - 1];
        const volume:number = parseFloat(lastCandleData.close) * tickerVolume

        const resultObject: SymbolVolatilityInterface = {
            symbol: symbol,
            volume: volume,
            current_price: parseFloat(lastCandleData.close)
        }

        return resultObject
    }

    static calcCoefficient = async (symbol: string, radioAccess:number, interval: CandleChartInterval_LT = "1h", limit: number = 24) => {
        const SymbolVolatilityObject = await this.getVolume(symbol, interval, limit + 1);

        const resultObject: SymbolDensityCoefficientInterface = {
            symbol: symbol,
            coefficient: (SymbolVolatilityObject.volume * this.coefficient) + radioAccess,
            volume: SymbolVolatilityObject.volume
        }

        return resultObject
    }
}