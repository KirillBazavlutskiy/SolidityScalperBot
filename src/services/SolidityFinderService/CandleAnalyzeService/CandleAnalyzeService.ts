import {Binance, CandleChartInterval} from "binance-api-node";

export class CandleAnalyzeService {
    private static client: Binance;

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
}