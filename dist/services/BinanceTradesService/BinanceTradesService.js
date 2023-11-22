"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceTradesService = void 0;
const TradingPairsService_1 = __importDefault(require("../TradingPairsListService/TradingPairsService"));
const index_1 = require("../../index");
const ws_1 = __importDefault(require("ws"));
const DocumentLogService_1 = __importDefault(require("../DocumentLogService/DocumentLogService"));
class BinanceTradesService {
    constructor(client) {
        this.TradeSymbol = async (solidityModel) => {
            const exchangeInfoSpot = await this.client.exchangeInfo();
            const exchangeInfoFutures = await this.client.futuresExchangeInfo();
            let tickSizeSpot = this.FetchTickSize(exchangeInfoSpot, solidityModel.symbol);
            let tickSizeFutures = this.FetchTickSize(exchangeInfoFutures, solidityModel.symbol);
            const UP_TO_PRICE_ACCESS_SPOT_THRESHOLD = index_1.solidityFinderParams.upToPriceAccess + 0.01;
            const UP_TO_PRICE_ACCESS_FUTURES_THRESHOLD = index_1.solidityFinderParams.upToPriceAccess - 0.01;
            let openOrderPrice;
            let futuresLastPrice;
            let futuresWebsocketLastTradeTime;
            let TradeStatus = 'watching';
            let TPSL;
            let minPriceFuturesInTrade = Number.MAX_VALUE;
            let maxPriceFuturesInTrade = Number.MIN_VALUE;
            DocumentLogService_1.default.MadeTheNewLog(`New Solidity on ${solidityModel.symbol} | Solidity Price: ${solidityModel.solidity.price} | Solidity Ratio: ${solidityModel.solidity.ratio} | Up To Price: ${solidityModel.solidity.upToPrice} | Last Price: ${solidityModel.price}`, [index_1.dls, index_1.tls], true);
            const WebSocketSpot = new ws_1.default(`wss://stream.binance.com:9443/ws/${solidityModel.symbol.toLowerCase()}@trade`);
            const WebSocketFutures = new ws_1.default(`wss://fstream.binance.com/ws/${solidityModel.symbol.toLowerCase()}@trade`);
            try {
                WebSocketSpot.on('message', async (data) => {
                    const processStartData = new Date();
                    const strData = data.toString();
                    const trade = JSON.parse(strData);
                    const tradePrice = parseFloat(trade.p);
                    const upToPrice = tradePrice / solidityModel.solidity.price;
                    switch (TradeStatus) {
                        case "watching":
                            if (upToPrice === 1) {
                                const lastSolidity = await index_1.sfs.FindSolidity(solidityModel.symbol, index_1.solidityFinderParams.ratioAccess, index_1.solidityFinderParams.upToPriceAccess);
                                let solidityStatus;
                                if (lastSolidity.solidity?.type === solidityModel.solidity.type) {
                                    if (lastSolidity.solidity.price === solidityModel.solidity.price) {
                                        solidityStatus = 'ready';
                                        solidityModel = lastSolidity;
                                    }
                                    else {
                                        solidityStatus = 'moved';
                                        solidityModel = lastSolidity;
                                        DocumentLogService_1.default.MadeTheNewLog(`Solidity on ${solidityModel.symbol} has been moved to ${solidityModel.solidity.price} | Ratio: ${solidityModel.solidity.ratio}!`, [index_1.dls], true);
                                    }
                                }
                                else {
                                    solidityStatus = 'removed';
                                    TradeStatus = 'disabled';
                                    DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} Solidity on ${solidityModel.solidity.price} has been removed!`, [index_1.dls], true);
                                    WebSocketSpot.close();
                                }
                                if (solidityStatus === 'ready') {
                                    const solidityPrice = solidityModel.solidity.price;
                                    openOrderPrice = solidityModel.solidity.type === 'asks'
                                        ? solidityPrice + tickSizeSpot
                                        : solidityPrice - tickSizeSpot;
                                    const processEndData = new Date();
                                    const processTime = new Date(processEndData.getTime() - processStartData.getTime());
                                    DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} | Solidity on ${solidityPrice} was reached! Waiting for price ${openOrderPrice} | Process Time: ${processTime.getSeconds()}s`, [index_1.dls], true);
                                    TradeStatus = 'broken';
                                }
                            }
                            else if ((upToPrice > 1 && solidityModel.solidity.type === 'asks') || (upToPrice < 1 && solidityModel.solidity.type === 'bids')) {
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} Solidity on ${solidityModel.solidity.price} has been removed! | Up to price: ${upToPrice}`, [index_1.dls], true);
                                TradeStatus = 'disabled';
                                WebSocketSpot.close();
                            }
                            else if (index_1.sfs.CalcUpToPrice(upToPrice) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} is too far!`, [index_1.dls], true);
                                WebSocketSpot.close();
                            }
                            else {
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} | Up to price: ${upToPrice} | Spot Last Price: ${tradePrice} | Futures Last Price: ${futuresLastPrice}`, [], true);
                            }
                            break;
                        case "broken":
                            DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} | Up to price: ${tradePrice / openOrderPrice} | Spot Last Price: ${tradePrice} | Futures Last Price: ${futuresLastPrice}`, [], true);
                            if (tradePrice === openOrderPrice) {
                                TPSL = this.CalcTPSL(futuresLastPrice, solidityModel.solidity.type, 0.01, 0.003, tickSizeFutures);
                                const currentTime = new Date();
                                const futuresWebsocketFreezeTime = new Date(currentTime.getTime() - futuresWebsocketLastTradeTime.getTime());
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} | Order Type: ${solidityModel.solidity.type === 'asks' ? 'long' : 'short'} | TP: ${TPSL.TakeProfit} LP: ${futuresLastPrice} SL: ${TPSL.StopLoss} | Futures Websocket Freeze Time: ${futuresWebsocketFreezeTime.getSeconds()}s`, [index_1.dls, index_1.tls], true);
                                TradeStatus = 'inTrade';
                            }
                            else if (index_1.sfs.CalcUpToPrice(upToPrice) > UP_TO_PRICE_ACCESS_FUTURES_THRESHOLD) {
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} is too far!`, [index_1.dls], true);
                                WebSocketSpot.close();
                            }
                            break;
                    }
                });
                const tradeType = solidityModel.solidity.type === 'asks' ? 'long' : 'short';
                WebSocketFutures.on('message', (data) => {
                    const strData = data.toString();
                    const trade = JSON.parse(strData);
                    futuresLastPrice = parseFloat(trade.p);
                    futuresWebsocketLastTradeTime = new Date();
                    if (TradeStatus === 'inTrade') {
                        if (futuresLastPrice > maxPriceFuturesInTrade)
                            maxPriceFuturesInTrade = futuresLastPrice;
                        else if (futuresLastPrice < minPriceFuturesInTrade)
                            minPriceFuturesInTrade = futuresLastPrice;
                        const status = this.CheckTPSL(futuresLastPrice, TPSL.TakeProfit, TPSL.StopLoss, tradeType);
                        switch (status) {
                            case "TP":
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} | Take Profit price has been reached on price ${futuresLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [index_1.dls, index_1.tls], true);
                                TradeStatus = 'disabled';
                                WebSocketSpot.close();
                                break;
                            case "SL":
                                DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} | Stop Loss price has been reached on price ${futuresLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [index_1.dls, index_1.tls], true);
                                TradeStatus = 'disabled';
                                WebSocketSpot.close();
                                break;
                        }
                    }
                });
                setTimeout(() => {
                    if (futuresLastPrice === undefined) {
                        DocumentLogService_1.default.MadeTheNewLog(`${solidityModel.symbol} is out of websocket connection! Not on futures!`, [index_1.dls], true);
                        WebSocketSpot.close();
                    }
                }, 60000);
                WebSocketSpot.on('close', () => {
                    DocumentLogService_1.default.MadeTheNewLog(`Websockets on ${solidityModel.symbol} has been disabled!`, [index_1.dls], true);
                    TradingPairsService_1.default.DeleteTPInTrade(solidityModel.symbol);
                    TradeStatus = 'disabled';
                    WebSocketFutures.close();
                });
            }
            catch (e) {
                index_1.dls.WriteLine(`${solidityModel.symbol} | ${e.message}`);
            }
        };
        this.CalcTPSL = (currentPrice, limitType, upToPriceTP, upToPriceSL, tickSize) => {
            let currentUpToPriceTP = index_1.sfs.CalcRealUpToPrice(upToPriceTP, limitType === 'asks' ? 'bids' : 'asks');
            let currentUpToPriceSL = index_1.sfs.CalcRealUpToPrice(upToPriceSL, limitType);
            let currentTakeProfit = currentPrice * currentUpToPriceTP;
            let currentStopLoss = currentPrice * currentUpToPriceSL;
            const fixedTakeProfit = this.FindClosestLimitOrder(currentTakeProfit, tickSize);
            const fixedStopLoss = this.FindClosestLimitOrder(currentStopLoss, tickSize);
            return {
                TakeProfit: fixedTakeProfit,
                StopLoss: fixedStopLoss,
            };
        };
        this.CheckTPSL = (currentPrice, tpPrice, slPrice, tradeType) => {
            let result;
            if (tradeType === 'long') {
                if (currentPrice >= tpPrice)
                    result = 'TP';
                else if (currentPrice <= slPrice)
                    result = 'SL';
                else
                    result = 'InTrade';
            }
            else {
                if (currentPrice <= tpPrice)
                    result = 'TP';
                else if (currentPrice >= slPrice)
                    result = 'SL';
                else
                    result = 'InTrade';
            }
            return result;
        };
        this.FetchTickSize = (exchangeInfo, symbol) => {
            for (const pair of exchangeInfo.symbols) {
                if (pair.symbol === symbol) {
                    for (const filter of pair.filters) {
                        if (filter.filterType === 'PRICE_FILTER') {
                            return parseFloat(filter.tickSize);
                        }
                    }
                }
            }
        };
        this.FindClosestLimitOrder = (price, tickSize) => {
            const numIndex = tickSize.toString().lastIndexOf('1');
            const floatLenght = numIndex === 0 ? 0 : numIndex - 1;
            return parseFloat(price.toFixed(floatLenght));
        };
        this.client = client;
    }
}
exports.BinanceTradesService = BinanceTradesService;
//# sourceMappingURL=BinanceTradesService.js.map