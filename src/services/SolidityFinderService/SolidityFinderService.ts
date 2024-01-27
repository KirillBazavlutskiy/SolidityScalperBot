import {LimitType, SolidityModel, SolidityTicket} from "./SolidityFinderModels";
import {
    Bid,
    Binance,
    CandleChartInterval,
    DailyStatsResult,
    ExchangeInfo,
    FuturesOrderType_LT,
    OrderBook
} from "binance-api-node";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {
    BinanceOrdersCalculatingKit
} from "../BinanceTradesService/BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {CandleAnalyzeService} from "./CandleAnalyzeService/CandleAnalyzeService";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";

class SolidityFinderService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    FetchAllSymbols = async (minVolume: number, topPriceChangePercent: number) => {
        try {
            const tickers = await this.client.dailyStats().catch(error => {
                throw new Error('Failed to fetch daily stats');
            });

            const futuresSymbolsInfo: ExchangeInfo<FuturesOrderType_LT> = await this.client.futuresExchangeInfo().catch(error => {
                throw new Error('Failed to fetch futures exchange info');
            });
            const futuresSymbols = futuresSymbolsInfo.symbols.map(symbolInfo => symbolInfo.symbol);
            const tickersFixed: DailyStatsResult[] = JSON.parse(JSON.stringify(tickers));

            let filteredTickers = tickersFixed
                .filter(tradingPair => !TradingPairsService.BanListStatic.some(coin => tradingPair.symbol.includes(coin)))
                .filter(tradingPair => futuresSymbols.includes(tradingPair.symbol))
                .filter(tradingPair => {
                    return tradingPair.symbol.substring(tradingPair.symbol.length - 4, tradingPair.symbol.length) === "USDT"
                })
                .filter(tradingPair => Number(tradingPair.quoteVolume) > minVolume)
                .sort((a, b) => Number(b.priceChangePercent) - Number(a.priceChangePercent))

            if (topPriceChangePercent !== 0) {
                filteredTickers.filter(ticker => Number(ticker.priceChangePercent) > 0);
                if (filteredTickers.length > topPriceChangePercent) filteredTickers = filteredTickers.slice(0, topPriceChangePercent);
            }

            return filteredTickers.map(tradingPair => tradingPair.symbol);
        } catch (e) {
            throw e;
        }
    };

    FindSolidity = async (symbol: string, orderBookParams?: OrderBook, lastPriceParams?: number, quoteVolumeParams?: number): Promise<SolidityModel | null> => {
        try {
            const orderBook: OrderBook = orderBookParams || await this.client.book({ symbol });
            const ticker = await this.client.dailyStats({ symbol });
            const lastPrice = "lastPrice" in ticker ? Number(ticker.lastPrice) : 0;
            const quoteVolume = "quoteVolume" in ticker ? Number(ticker.quoteVolume) : 0;

            const calculateMaxValue = (orders: Bid[]) => {
                const initialValue = { sum: 0, max: 0, maxPrice: 0 };
                return orders.reduce((acc, order) => {
                    const volume = Number(order.quantity);
                    acc.sum += volume;
                    if (acc.max < volume) {
                        acc.max = volume;
                        acc.maxPrice = Number(order.price);
                    }
                    return acc;
                }, initialValue);
            };

            const bindNAsks = [ ...orderBook.asks, ...orderBook.bids ];
            const { sum: sumOrders, max: maxOrder, maxPrice: maxOrderPrice } = calculateMaxValue(bindNAsks);
            const upToPrice = lastPrice / maxOrderPrice;
            const solidityRatio = maxOrder / (sumOrders / 100);

            let solidityType: LimitType = 'bids';
            if (orderBook.asks.some(bid =>Number(bid.price) === maxOrderPrice)) {
                solidityType = 'asks';
            }

            const solidityTicket: SolidityTicket = { Type: solidityType, Price: maxOrderPrice, Quantity: maxOrder, MaxQuantity: maxOrder, Ratio: solidityRatio, UpToPrice: upToPrice };

            return {
                Symbol: symbol,
                Price: lastPrice,
                QuoteVolume: quoteVolume,
                Solidity: solidityTicket
            };
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error with ${symbol}! ${e.message}`, [], true, false);
            return null;
        }
    };

    FindAllSolidity = async (minVolume: number, ratioAccess: number, upToPriceAccess: number, checkReachingPriceDuration: number, topPriceChangePercent: number):  Promise<SolidityModel[]> => {
        let symbolsWithSolidity: SolidityModel[] = [];

        try {
            const symbols = await this.FetchAllSymbols(minVolume, topPriceChangePercent);
            const symbolsGroupLength = 10;

            for (let i = 0; i < symbols.length; i += symbolsGroupLength) {
                const symbolsGroup =
                    symbols.length - i > symbolsGroupLength ? symbols.slice(i, i + symbolsGroupLength) : symbols.slice(i, symbols.length);

                await Promise.all(
                    symbolsGroup.map(async (symbol) => {
                        const solidityInfo = await this.FindSolidity(symbol);
                        if (
                            solidityInfo.Solidity.Ratio > ratioAccess &&
                            BinanceOrdersCalculatingKit.CalcSimplifiedRatio(solidityInfo.Solidity.UpToPrice, 0, solidityInfo.Solidity.Type) < upToPriceAccess / 100
                        ) {
                            symbolsWithSolidity.push(solidityInfo);
                        }
                    })
                );
            }

            if (checkReachingPriceDuration !== 0) {
                let filteredSymbolsWithSolidity: SolidityModel[] = [];

                await Promise.all(
                    symbolsWithSolidity.map(async (symbolWithSolidity) => {
                        const result = !(await CandleAnalyzeService.CheckPriceTouchingOnPeriod(symbolWithSolidity.Symbol, symbolWithSolidity.Solidity.Price, checkReachingPriceDuration));
                        if (result) {
                            filteredSymbolsWithSolidity.push(symbolWithSolidity);
                        }
                    })
                );

                symbolsWithSolidity = filteredSymbolsWithSolidity;
            }

        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `${e.message}`, [], true);
        }
        return symbolsWithSolidity;
    };
}

export default SolidityFinderService;