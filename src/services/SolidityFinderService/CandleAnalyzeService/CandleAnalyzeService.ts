import {Binance, CandleChartInterval, CandleChartInterval_LT} from "binance-api-node";
import {
    SymbolDensityCoefficientInterface,
    SymbolVolatilityInterface
} from "./CalcCoefficientModels";

export class CandleAnalyzeService {
    private static client: Binance;

    private static coefficient: number;

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

    static getVolatility = async (symbol: string, interval: CandleChartInterval_LT = "1h", limit: number = 24) => {
        const candlesData = await this.client.candles({symbol: symbol, interval: interval, limit: limit});
        const closePrice_array = candlesData.map(candle => parseFloat(candle.close));

        const priceChange = [];
        for (let i = 0; i < closePrice_array.length; i++) {
            const tempPrice_change = ((closePrice_array[i + 1] - closePrice_array[i]) / closePrice_array[i]) * 100;
            priceChange.push(tempPrice_change)
        }

        const volatility = priceChange.reduce((a, b) => a + b, 0)

        const resultObject: SymbolVolatilityInterface = {
            symbol: symbol,
            volatility: volatility
        }

        return resultObject
    }

    static calcCoefficient = async (symbol: string, interval: CandleChartInterval_LT = "1h", limit: number = 24) => {
        const SymbolVolatilityObject = await this.getVolatility(symbol, interval, limit);

        const resultObject: SymbolDensityCoefficientInterface = {
            symbol: symbol,
            coefficient: (SymbolVolatilityObject.volatility * this.coefficient) + 20,
            volatility: SymbolVolatilityObject.volatility
        }

        return resultObject
    }
}