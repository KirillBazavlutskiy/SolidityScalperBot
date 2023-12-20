import {LimitType, SolidityModel, SolidityTicket} from "./SolidityFinderModels";
import {Bid, Binance, CandleChartInterval, DailyStatsResult} from "binance-api-node";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {RatioCalculatingKit} from "../BinanceTradesService/RatioCalculatingKit/RatioCalculatingKit";
import {SolidityFinderOption} from "../../index";

class SolidityFinderService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    CheckPriceAtTargetTime = async (symbol: string, targetPrice: number, durationHours: number) => {
            try {
                const endDate = Date.now();
                const startDate = endDate - durationHours * 60 * 60 * 1000;

                const candles = await this.client.candles({
                    symbol,
                    interval: CandleChartInterval.THIRTY_MINUTES,
                    startTime: startDate,
                    endTime: endDate,
                    limit: durationHours * 2,
                });

                return candles.some(candle => parseFloat(candle.low) < targetPrice && targetPrice < parseFloat(candle.high));
            } catch (e) {
                throw e;
            }
    }

    FetchAllSymbols = async (minVolume: number) => {
        try {
            const tickers = await this.client.dailyStats();
            const futuresSymbolsInfo = await this.client.futuresExchangeInfo();
            const futuresSymbols = futuresSymbolsInfo.symbols.map(symbolInfo => symbolInfo.symbol);
            const tickersFixed: DailyStatsResult[] = JSON.parse(JSON.stringify(tickers));

            return tickersFixed
                .filter(tradingPair => !(tradingPair.symbol.includes('BTC') || tradingPair.symbol.includes('ETH') || tradingPair.symbol.includes('USDC') || tradingPair.symbol.includes('FTT')))
                .filter(tradingPair => futuresSymbols.includes(tradingPair.symbol))
                .filter(tradingPair => {
                    return tradingPair.symbol.substring(tradingPair.symbol.length - 4, tradingPair.symbol.length) === "USDT"
                })
                .filter(tradingPair => parseFloat(tradingPair.quoteVolume) > minVolume)
                .map(tradingPair => tradingPair.symbol);
        } catch (e) {
            throw e;
        }
    };

    FindSolidity = async (symbol: string, ratioAccess: number, upToPriceAccess: number): Promise<SolidityModel | null> => {
        try {
            const orderBook = await this.client.book({ symbol });
            const ticker = await this.client.dailyStats({ symbol });

            const price = "lastPrice" in ticker ? parseFloat(ticker.lastPrice) : 0;

            const calculateMaxValue = (orders: Bid[]) => {
                return orders.reduce((acc, order) => {
                    const volume = parseFloat(order.quantity);
                    acc.sum += volume;
                    if (acc.max < volume) {
                        acc.max = volume;
                        acc.maxPrice = parseFloat(order.price);
                    }
                    return acc;
                }, { sum: 0, max: 0, maxPrice: 0 });
            };

            const bindNAsks = [ ...orderBook.asks, ...orderBook.bids ];

            const { sum: sumOrders, max: maxOrder, maxPrice: maxOrderPrice } = calculateMaxValue(bindNAsks);

            const upToPrice = price / maxOrderPrice;

            const solidityRatio = maxOrder / (sumOrders / 100);

            let solidityType: LimitType = 'bids';

            if (orderBook.asks.findIndex(bid => parseFloat(bid.price) === maxOrderPrice) !== -1) {
                solidityType = 'asks';
            }

            const solidityTicket: SolidityTicket = { Type: solidityType, Price: maxOrderPrice, Quantity: maxOrder, Ratio: solidityRatio, UpToPrice: upToPrice };

            return {
                Symbol: symbol,
                Price: price,
                QuoteVolume: "quoteVolume" in ticker ? parseFloat(ticker.quoteVolume) : 0,
                Solidity: solidityTicket
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error with ${symbol}! ${e.message}`);
            return null;
        }
    };

    FindAllSolidity = async (minVolume: number, ratioAccess: number, upToPriceAccess: number) => {
        const symbolsWithSolidity: SolidityModel[] = [];

        try {
            const symbols = await this.FetchAllSymbols(minVolume);
            const symbolsGroupLength = 30;

            for (let i = 0; i < symbols.length; i += symbolsGroupLength) {
                const symbolsGroup =
                    symbols.length - i > symbolsGroupLength ? symbols.slice(i, i + symbolsGroupLength) : symbols.slice(i, symbols.length);

                await Promise.all(
                    symbolsGroup.map(async (symbol) => {
                        const solidityInfo = await this.FindSolidity(symbol, ratioAccess, upToPriceAccess);
                        if (solidityInfo.Solidity.Ratio > ratioAccess &&
                            RatioCalculatingKit.CalcSimplifiedRatio(solidityInfo.Solidity.UpToPrice, solidityInfo.Solidity.Type) < upToPriceAccess) {
                            symbolsWithSolidity.push(solidityInfo);
                        }
                    })
                );
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `Error with fetching symbols! ${e.message}`, [], true);
        }

        return symbolsWithSolidity
            .filter(symbolWithSolidity => this.CheckPriceAtTargetTime(symbolWithSolidity.Symbol, symbolWithSolidity.Solidity.Price, SolidityFinderOption.checkReachingPriceDuration));
    };
}

export default SolidityFinderService;