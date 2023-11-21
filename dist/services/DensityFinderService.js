"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DensityFinderService {
    constructor(client) {
        this.FetchAllSymbols = async (minVolume) => {
            const tickers = await this.client.dailyStats();
            const tickersFixed = JSON.parse(JSON.stringify(tickers));
            return tickersFixed
                .filter(tradingPair => {
                return tradingPair.symbol.substring(tradingPair.symbol.length - 4, tradingPair.symbol.length) === "USDT";
            })
                .filter(tradingPair => parseFloat(tradingPair.quoteVolume) > minVolume)
                .map(tradingPair => tradingPair.symbol);
        };
        this.FindSolidity = async (symbol, ratioAccess) => {
            const orderBook = await this.client.book({ symbol });
            const ticker = await this.client.dailyStats({ symbol });
            const price = "lastPrice" in ticker ? parseFloat(ticker.lastPrice) : 0;
            const quoteVolume = "quoteVolume" in ticker ? parseFloat(ticker.quoteVolume) : 0;
            const calculateMaxValue = (orders) => {
                let sum = 0;
                let max = 0;
                let maxPrice = 0;
                orders.forEach(order => {
                    const volume = parseFloat(order.quantity);
                    sum += volume;
                    if (max < volume) {
                        max = volume;
                        maxPrice = parseFloat(order.price);
                    }
                });
                return { sum, max, maxPrice };
            };
            const { sum: sumAsks, max: maxAsk, maxPrice: maxAskPrice } = calculateMaxValue(orderBook.asks);
            const { sum: sumBids, max: maxBid, maxPrice: maxBidPrice } = calculateMaxValue(orderBook.bids);
            const solidityOnAsks = maxAsk / (sumAsks / 100) > ratioAccess;
            const solidityOnBids = maxBid / (sumBids / 100) > ratioAccess;
            const solidityModel = {
                symbol: symbol,
                price: price,
                quoteVolume: quoteVolume,
                buyVolume: sumAsks,
                sellVolume: sumBids,
            };
            if (solidityOnAsks)
                solidityModel.solidityLong = { price: maxAskPrice, volume: maxAsk, upToPrice: price / maxAskPrice };
            if (solidityOnBids)
                solidityModel.solidityShort = { price: maxBidPrice, volume: maxBid, upToPrice: price / maxBidPrice };
            return solidityModel;
        };
        this.FindAllSolidity = async (minVolume, ratioAccess) => {
            const symbols = await this.FetchAllSymbols(minVolume);
            const symbolsWithSolidity = [];
            const startTime = new Date();
            const symbolsGroupLength = 30;
            for (let i = 0; i < symbols.length; i += symbolsGroupLength) {
                const symbolsGroup = symbols.length - i > symbolsGroupLength ? symbols.slice(i, i + symbolsGroupLength) : symbols.slice(i, symbols.length);
                await Promise.all(symbolsGroup.map(async (symbol) => {
                    const solidityInfo = await this.FindSolidity(symbol, ratioAccess);
                    if (solidityInfo.solidityShort || solidityInfo.solidityLong) {
                        symbolsWithSolidity.push(solidityInfo);
                    }
                }));
            }
            const endTime = new Date();
            console.log(endTime.getTime() - startTime.getTime());
            return symbolsWithSolidity;
        };
        this.client = client;
    }
}
exports.default = DensityFinderService;
//# sourceMappingURL=SolidityFinderService.js.map
