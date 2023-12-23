import {
    Bid,
    Binance,
    ExchangeInfo,
    FuturesOrder,
    FuturesOrderType_LT,
    OrderBook,
    OrderType_LT,
    WSTrade
} from "binance-api-node";
import {SolidityModel, LimitType} from "../SolidityFinderService/SolidityFinderModels";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";
import {dls, sfs, SolidityFinderOptions, tcs, tls, TradeStopsOptions} from "../../index";
import {
    CalcTPSLOutput,
    CheckTPSLOutput,
    SolidityStatus,
    StreamBid,
    TradeStatus,
    TradeType
} from "./BinanceTradesModels";
import WebSocket from 'ws';
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import beep from 'beepbeep';
import {TradesHistoryDataService} from "../TradesHistoryDataService/TradesHistoryDataService";
import tradingPairsService from "../TradingPairsListService/TradingPairsService";
import {Mutex} from "async-mutex";
import {BinanceOrdersCalculatingKit} from "./BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {OpenTradesManager} from "./OpenTradesManager/OpenTradesManager";


export class BinanceTradesService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    SolidityQuantityHistory: number[];

    TradeSymbol = async (solidityModel: SolidityModel): Promise<void | 0> => {
        let exchangeInfoSpot;
        let exchangeInfoFutures;

        exchangeInfoSpot = await this.client.exchangeInfo();

        try {
            exchangeInfoFutures = await this.client.futuresExchangeInfo();
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is not on futures!`, [ dls], true);
            return 0;
        }

        let tickSizeSpot: number = BinanceTradesService.FetchTickSize(exchangeInfoSpot, solidityModel.Symbol);
        let tickSizeFutures: number = BinanceTradesService.FetchTickSize(exchangeInfoFutures, solidityModel.Symbol);

        let minNotionalFutures = parseFloat(BinanceTradesService.FetchMinNotionalFutures(exchangeInfoFutures, solidityModel.Symbol));
        let quantityPrecisionFutures: number = exchangeInfoFutures.quantityPrecision;

        const UP_TO_PRICE_ACCESS_SPOT_THRESHOLD: number = SolidityFinderOptions.upToPriceAccess + 0.01;

        let OpenOrderPrice: number;

        let UpToPriceSpot: number = solidityModel.Solidity.UpToPrice;

        let SolidityStatus: SolidityStatus;

        let FuturesOpenTradePrice: number;
        let FuturesLastPrice: number;
        let FuturesWebsocketLastTradeTime: Date;

        let orderQuantity: string;
        let orderQuantityNominal: number;

        let OpenOrderAccess: boolean = false;

        let TradeStatus: TradeStatus = 'watching';
        let TPSL: CalcTPSLOutput;
        let StopLossBreakpoint;

        let minPriceFuturesInTrade = Number.MAX_VALUE;
        let maxPriceFuturesInTrade = Number.MIN_VALUE;

        let OpenTradeTime: Date;
        let TradeType: TradeType = solidityModel.Solidity.Type === 'asks' ? 'long' : 'short';

        const otm = new OpenTradesManager(this.client, solidityModel.Symbol, TradeType, tickSizeFutures);

        DocumentLogService.MadeTheNewLog(
            [FontColor.FgGreen], `New Solidity on ${solidityModel.Symbol} | Solidity Price: ${solidityModel.Solidity.Price} | Solidity Ratio: ${solidityModel.Solidity.Ratio} | Up To Price: ${solidityModel.Solidity.UpToPrice} | Last Price: ${solidityModel.Price}`,
            [ dls ], true);

        const WebSocketSpot: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.Symbol.toLowerCase()}@trade`);
        const WebSocketFutures: WebSocket = new WebSocket(`wss://fstream.binance.com/ws/${solidityModel.Symbol.toLowerCase()}@trade`);
        const WebSocketSpotBookDepth: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.Symbol.toLowerCase()}@depth@1000ms`);

        const ProcessSpotTrade = async (data: Buffer) => {
            try {
                const processStartData = new Date();
                const strData = data.toString();
                const trade = JSON.parse(strData);

                const SpotLastPrice = parseFloat(trade.p);
                UpToPriceSpot = SpotLastPrice / solidityModel.Solidity.Price;
                solidityModel.Solidity.UpToPrice = UpToPriceSpot;
                solidityModel.Price = SpotLastPrice;
                TradingPairsService.ChangeTPInTrade(solidityModel);

                switch (TradeStatus) {
                    case "watching":
                        if (UpToPriceSpot === 1) {
                            if (SolidityStatus === 'ready') {
                                TradeStatus = 'reached';

                                const processEndData = new Date();
                                const processTime = new Date(processEndData.getTime() - processStartData.getTime());

                                OpenOrderPrice = BinanceOrdersCalculatingKit.FindClosestLimitOrder(solidityModel.Solidity.Type === 'asks'
                                    ? solidityModel.Solidity.Price + tickSizeSpot
                                    : solidityModel.Solidity.Price - tickSizeSpot, tickSizeSpot);

                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${solidityModel.Symbol} | Solidity on ${solidityModel.Solidity.Price} was reached! Waiting for price ${OpenOrderPrice} | Process Time: ${processTime.getSeconds()}s`, [dls, tls], true);
                                tcs.SendMessage(`${solidityModel.Symbol}\nSolidity on ${solidityModel.Solidity.Price} was reached!\nWaiting for price ${OpenOrderPrice}!`);
                            }
                        } else if ((UpToPriceSpot > 1 && solidityModel.Solidity.Type === 'asks') || (UpToPriceSpot < 1 && solidityModel.Solidity.Type === 'bids')) {
                            TradeStatus = 'disabled';
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price} has been removed! | Up to price: ${UpToPriceSpot} | Last Price: ${SpotLastPrice}`, [dls], true);
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, solidityModel.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            TradeStatus = 'disabled';
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is too far! Up to price: ${UpToPriceSpot}`, [dls], true);
                        }
                        break;
                    case "reached":
                        if ((SpotLastPrice >= OpenOrderPrice && solidityModel.Solidity.Type === 'asks') || (SpotLastPrice <= OpenOrderPrice && solidityModel.Solidity.Type === 'bids')) {
                            SolidityStatus = 'removed';
                            TradeStatus = 'inTrade';
                            beep();

                            const currentTime = new Date();
                            const futuresWebsocketFreezeTime: Date = new Date(currentTime.getTime() - FuturesWebsocketLastTradeTime.getTime());
                            OpenTradeTime = new Date();

                            orderQuantity = parseFloat((11 / FuturesLastPrice).toFixed(quantityPrecisionFutures)) > 0 ? (11 / FuturesLastPrice).toFixed(quantityPrecisionFutures) :'1';
                            orderQuantityNominal = parseFloat(orderQuantity) * FuturesLastPrice;
                            OpenOrderAccess = orderQuantityNominal <= 20;

                            if (OpenOrderAccess) {
                                FuturesOpenTradePrice = await otm.PlaceMarketOrder(orderQuantity);
                            } else {
                                TradeStatus = 'disabled';
                                WebSocketSpot.close();
                                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} | To high nominal quantity!`, [dls], true);
                            }
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, solidityModel.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            TradeStatus = 'disabled';
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is too far!`, [dls], true);
                        }
                        break;
                }
            } catch (e) {
                throw e;
            }
        }

        const ProcessSpotBookDepthUpdate = async (data: Buffer) => {
            try {
                const strData = data.toString();
                const parsedData = JSON.parse(strData);
                const Bids: StreamBid[] = parsedData[solidityModel.Solidity.Type === 'asks' ? 'a' : 'b'];

                const solidityChangeIndex = Bids.findIndex(bid => bid[0] == solidityModel.Solidity.Price);

                if (solidityChangeIndex !== -1 && SolidityStatus !== 'removed' && TradeStatus !== 'inTrade') {
                    const SolidityBid = Bids[solidityChangeIndex];
                    SolidityStatus = await this.CheckSolidity(solidityModel, SolidityBid, UpToPriceSpot, TradeStatus, solidityModel.Solidity.Type);
                    if (SolidityStatus === 'removed') {
                        WebSocketSpot.close();
                    }
                }
            } catch (e) {
                throw e;
            }
        }

        WebSocketFutures.on('message', (data) => {
            try {
                const strData = data.toString();
                const trade = JSON.parse(strData);
                FuturesLastPrice = parseFloat(trade.p);
                FuturesWebsocketLastTradeTime = new Date();

                if (TradeStatus === 'inTrade') {
                    if (FuturesLastPrice > maxPriceFuturesInTrade) maxPriceFuturesInTrade = FuturesLastPrice;
                    else if (FuturesLastPrice < minPriceFuturesInTrade) minPriceFuturesInTrade = FuturesLastPrice;

                    const TradeCondition = otm.UpdateLastPrice(FuturesLastPrice);

                    if (TradeCondition.TradeStatus === 'Closed') {
                        const EndTradeTime = new Date();
                        const TradeTime = EndTradeTime.getTime() - OpenTradeTime.getTime();

                        TradeStatus = 'disabled';
                        WebSocketSpot.close();
                        DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${solidityModel.Symbol} | Order was closed! | Profit: ${TradeCondition.CurrentProfit}%\nTrade Time: ${TradeTime.toString()}`, [ dls, tls ], true);
                        tcs.SendMessage(`${solidityModel.Symbol}\nOrder was closed!\nProfit: ${TradeCondition.CurrentProfit}%\nTrade Time: ${TradeTime.toString()}`);
                    }

                    // const AddTradeData = () => {
                    //     try {
                    //         TradesHistoryDataService.AddTradeInfo({
                    //             ...solidityModel,
                    //             Stops: {
                    //                 TakeProfit: {
                    //                     Price: TPSL.TakeProfit,
                    //                     UpToPrice: TradeStopsOptions.TakeProfit
                    //                 },
                    //                 StopLoss: {
                    //                     Price: TPSL.StopLoss,
                    //                     UpToPrice: TradeStopsOptions.StopLoss
                    //                 }
                    //             },
                    //             Profit: parseFloat(OpenTradesManager.ShowProfit(FuturesOpenTradePrice / FuturesLastPrice, false, TradeType)),
                    //             InDealTime: DocumentLogService.ShowTime(TradeTime),
                    //             TradeTime: new Date(),
                    //             Edges: {
                    //                 MaxPrice: maxPriceFuturesInTrade,
                    //                 MinPrice: minPriceFuturesInTrade,
                    //             },
                    //             SolidityQuantityHistory: this.SolidityQuantityHistory,
                    //         });
                    //     } catch (e) {
                    //         DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with futures trade message ${e.message}`, [dls], true);
                    //     }
                    // }
                    // switch (status) {
                    //     case "TP":
                    //         TradeStatus = 'disabled';
                    //         WebSocketSpot.close();
                    //         DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${solidityModel.Symbol} | Take Profit price has been reached on price ${FuturesLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [ dls, tls ], true);
                    //         tcs.SendMessage(`${solidityModel.Symbol}\nOrder was closed by Take Profit!\nProfit: ${tradingPairsService.ShowProfit(FuturesOpenTradePrice / FuturesLastPrice, false, TradeType)}`);
                    //         AddTradeData();
                    //         break;
                    //     case "SL":
                    //         TradeStatus = 'disabled';
                    //         WebSocketSpot.close();
                    //         if (parseFloat(tradingPairsService.ShowProfit(FuturesOpenTradePrice / FuturesLastPrice, false, TradeType)) > 0) {
                    //             DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${solidityModel.Symbol} | Order has been closed on price ${FuturesLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [ dls, tls ], true);
                    //             tcs.SendMessage(`${solidityModel.Symbol}\nOrder was closed by Stop Loss!]\nProfit: ${tradingPairsService.ShowProfit(FuturesOpenTradePrice / FuturesLastPrice, false, TradeType)}`);
                    //         } else {
                    //             DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} | Stop Loss price has been reached on price ${FuturesLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [ dls, tls ], true);
                    //             tcs.SendMessage(`${solidityModel.Symbol}\nOrder was closed by Stop Loss!\nProfit: ${tradingPairsService.ShowProfit(FuturesOpenTradePrice / FuturesLastPrice, false, TradeType)}`);
                    //         }
                    //         AddTradeData();
                    //         break;
                    // }
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in futures websocket with ${solidityModel.Symbol}! ${e.message}`);
            }
        });

        // Websocket Spot
        const messageSpotTradesQueue: Buffer[] = [];
        let isProcessingSpotTrades = false;
        const ProcessSpotTradeQueue = async () => {
            if (isProcessingSpotTrades) return;
            isProcessingSpotTrades = true;

            try {
                while (messageSpotTradesQueue.length > 0) {
                    const message = messageSpotTradesQueue.shift();
                    await ProcessSpotTrade(message);
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with spot trade message ${e.message}`, [dls], true);
                tcs.SendMessage(`Error with spot trade message ${e.message}`);
            }

            isProcessingSpotTrades = false;
        };

        WebSocketSpot.on('message', (data: Buffer) => {
            messageSpotTradesQueue.push(data);
            if (!isProcessingSpotTrades) {
                ProcessSpotTradeQueue();
            }
        });

        // Websocket Spot Book Depth
        const messageSpotBookDepthQueue: Buffer[] = [];
        let isProcessingSpotBookDepth = false;

        const ProcessSpotBookDepthQueue = async () => {
            if (isProcessingSpotBookDepth) return;
            isProcessingSpotBookDepth = true;

            try {
                while (messageSpotBookDepthQueue.length > 0) {
                    const message = messageSpotBookDepthQueue.shift();
                    await ProcessSpotBookDepthUpdate(message);
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with spot book depth update ${e.message}`, [dls], true);
                tcs.SendMessage(`Error with spot book depth update ${e.message}`);
            }

            isProcessingSpotTrades = false;
        };

        WebSocketSpotBookDepth.on('message', (data) => {
            messageSpotBookDepthQueue.push(data);
            if (!isProcessingSpotBookDepth) {
                ProcessSpotBookDepthQueue();
            }
        })

        WebSocketSpot.on('close', () => {
            WebSocketSpotBookDepth.close();
            WebSocketFutures.close();
            TradeStatus = 'disabled';
            TradingPairsService.DeleteTPInTrade(solidityModel.Symbol);
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Websockets on ${solidityModel.Symbol} has been disabled!`, [ dls ], true);
        });

        WebSocketSpot.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));
        WebSocketFutures.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));
        WebSocketSpotBookDepth.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));
    };

    CheckSolidity = async (solidityModel: SolidityModel, SolidityBid: StreamBid, UpToPriceSpot: number, TradeStatus: TradeStatus, LimitType: LimitType): Promise<SolidityStatus> => {
        const SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD: number = 0.15;

        let SolidityStatus: SolidityStatus;

        if (TradeStatus === 'reached') {
            this.SolidityQuantityHistory.push(SolidityBid[1]);
        }

        if (BinanceOrdersCalculatingKit.CalcRatioChange(solidityModel.Solidity.Quantity / SolidityBid[1]) < SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD) {
            solidityModel.Solidity.Quantity = SolidityBid[1];
            SolidityStatus = 'ready';
        } else if (UpToPriceSpot === 1) {
            solidityModel.Solidity.Quantity = SolidityBid[1];
            SolidityStatus = 'ready';
        } else {
            DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Trying to refresh solidity info on ${solidityModel.Symbol}...`, [ dls ], true);
            const lastSolidity = await sfs.FindSolidity(solidityModel.Symbol, SolidityFinderOptions.ratioAccess, SolidityFinderOptions.upToPriceAccess);

            if (lastSolidity.Solidity?.Type === solidityModel.Solidity.Type) {
                if (lastSolidity.Solidity.Price === solidityModel.Solidity.Price) {
                    SolidityStatus = 'ready';
                    solidityModel = lastSolidity;
                    DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Solidity on ${solidityModel.Symbol} in ${solidityModel.Solidity.Price}!`, [ dls ], true);
                } else {
                    SolidityStatus = 'moved';
                    solidityModel = lastSolidity;
                    DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `Solidity on ${solidityModel.Symbol} has been moved to ${solidityModel.Solidity.Price} | Ratio: ${solidityModel.Solidity.Ratio}!`, [ dls ], true);
                }
            } else {
                SolidityStatus = 'removed';
                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price} has been removed. The quantity on ${SolidityBid[0]} is ${SolidityBid[1]}!`, [ dls ], true);
            }
        }

        TradingPairsService.ChangeTPInTrade(solidityModel);
        return SolidityStatus;
    }

    static FetchTickSize = (exchangeInfo: ExchangeInfo<OrderType_LT> | ExchangeInfo<FuturesOrderType_LT>, symbol: string): number => {
        for (const pair of exchangeInfo.symbols) {
            if (pair.symbol === symbol) {
                for (const filter of pair.filters) {
                    if (filter.filterType === 'PRICE_FILTER') {
                        return parseFloat(filter.tickSize);
                    }
                }
            }
        }
    }

    static FetchMinNotionalFutures = (exchangeInfo: ExchangeInfo<FuturesOrderType_LT>, symbol: string) => {
        for (const pair of exchangeInfo.symbols) {
            if (pair.symbol === symbol) {
                for (const filter of pair.filters) {
                    if (filter.filterType === 'MIN_NOTIONAL') {
                        return filter.notional;
                    }
                }
            }
        }
    }
}