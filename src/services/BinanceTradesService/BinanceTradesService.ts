import {
    Binance,
    ExchangeInfo,
    FuturesOrderType_LT,
    OrderType_LT
} from "binance-api-node";
import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";
import {dls, sfs, tcs, tls} from "../../index";
import {
    SolidityStatus,
    StreamBid,
    TradeStatus,
    TradeType
} from "./BinanceTradesModels";
import WebSocket from 'ws';
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import beep from 'beepbeep';
import {BinanceOrdersCalculatingKit} from "./BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {OpenTradesManager} from "./OpenTradesManager/OpenTradesManager";
import {SolidityFinderOptionsModel} from "../../../Options/SolidityFInderOptions/SolidityFinderOptionsModels";
import {TradingStopOptions} from "../../../Options/TradeStopsOptions/TradeStopsOptionsModels";


export class BinanceTradesService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    SolidityQuantityHistory: number[];

    TradeSymbol = async (solidityModel: SolidityModel, SolidityFinderOptions: SolidityFinderOptionsModel, TradeStopsOptions: TradingStopOptions): Promise<void | 0> => {
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

        let SolidityStatus: SolidityStatus = 'ready';
        let MaxSolidityQuantity = solidityModel.Solidity.Quantity;

        let FuturesOpenTradePrice: number;
        let FuturesLastPrice: number;
        let FuturesWebsocketLastTradeTime: Date;

        let orderQuantity: string;
        let orderQuantityNominal: number;

        let OpenOrderAccess: boolean = false;

        let TradeStatus: TradeStatus = 'watching';

        let minPriceFuturesInTrade = Number.MAX_VALUE;
        let maxPriceFuturesInTrade = Number.MIN_VALUE;

        let OpenTradeTime: Date;
        let TradeType: TradeType = solidityModel.Solidity.Type === 'asks' ? 'long' : 'short';

        const otm = new OpenTradesManager(this.client, solidityModel.Symbol, TradeStopsOptions, TradeType, tickSizeFutures);

        DocumentLogService.MadeTheNewLog(
            [FontColor.FgGreen], `New Solidity on ${solidityModel.Symbol} | Solidity Price: ${solidityModel.Solidity.Price} | Solidity Ratio: ${solidityModel.Solidity.Ratio} | Up To Price: ${solidityModel.Solidity.UpToPrice} | Last Price: ${solidityModel.Price}`,
            [ dls ], true);

        const WebSocketSpot: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.Symbol.toLowerCase()}@trade`);
        const WebSocketFutures: WebSocket = new WebSocket(`wss://fstream.binance.com/ws/${solidityModel.Symbol.toLowerCase()}@trade`);
        const WebSocketSpotBookDepth: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.Symbol.toLowerCase()}@depth`);

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
                                tcs.SendMessage(`${solidityModel.Symbol}\nSolidity on ${solidityModel.Solidity.Price} was reached!\nWaiting for price ${OpenOrderPrice}$!`);
                            }
                        } else if ((UpToPriceSpot > 1 && solidityModel.Solidity.Type === 'asks') || (UpToPriceSpot < 1 && solidityModel.Solidity.Type === 'bids')) {
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price} has been destroyed! | Up to price: ${UpToPriceSpot} | Last Price: ${SpotLastPrice}`, [dls], true);
                            CloseTrade();
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, solidityModel.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is too far! Up to price: ${UpToPriceSpot}`, [dls], true);
                            CloseTrade();
                        }
                        break;
                    case "reached":
                        if ((SpotLastPrice >= OpenOrderPrice && solidityModel.Solidity.Type === 'asks') || (SpotLastPrice <= OpenOrderPrice && solidityModel.Solidity.Type === 'bids')) {
                            SolidityStatus = 'removed';
                            TradeStatus = 'inTrade';
                            beep();

                            OpenTradeTime = new Date();

                            FuturesOpenTradePrice = await otm.PlaceMarketOrder(FuturesLastPrice, TradeStopsOptions.TradeOptions.NominalQuantity.toString(), quantityPrecisionFutures);
                            WebSocketSpot.close();
                            WebSocketSpotBookDepth.close();
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, solidityModel.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            tcs.SendMessage(`${solidityModel.Symbol} is too far!\nUp To price: ${TradingPairsService.ShowUptoPrice(UpToPriceSpot, solidityModel.Solidity.Type)}`);
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is too far!`, [dls], true);
                            CloseTrade();
                        }
                        break;
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
                        DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${solidityModel.Symbol} | Order was closed! | Profit: ${TradeCondition.CurrentProfit}%`, [ dls, tls ], true);
                        tcs.SendMessage(`${solidityModel.Symbol}\nOrder was closed!\nProfit: ${TradeCondition.CurrentProfit}%`);
                        CloseTrade();
                    }
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in futures websocket with ${solidityModel.Symbol}! ${e.message}`);
            }
        });

        const ProcessSpotBookDepthUpdate = async (data: Buffer) => {
            try {
                const strData = data.toString();
                const parsedData = JSON.parse(strData);
                const Bids: StreamBid[] = parsedData[solidityModel.Solidity.Type === 'asks' ? 'a' : 'b'];

                const solidityChangeIndex = Bids.findIndex(bid => bid[0] == solidityModel.Solidity.Price);

                if (solidityChangeIndex !== -1 && SolidityStatus !== 'removed' && TradeStatus !== 'inTrade') {
                    const SolidityBid = Bids[solidityChangeIndex];

                    if (SolidityBid[1] > MaxSolidityQuantity) MaxSolidityQuantity = SolidityBid[1];
                    SolidityStatus = await this.CheckSolidity(solidityModel, SolidityBid, UpToPriceSpot, TradeStatus, MaxSolidityQuantity, SolidityFinderOptions);

                    TradingPairsService.ChangeTPInTrade(solidityModel);
                    if (SolidityStatus === 'removed') {
                        if (TradeStatus === 'reached') tcs.SendMessage(`${solidityModel.Symbol}\nSolidity on ${solidityModel.Solidity.Price}$ has been removed!\nThe quantity on ${SolidityBid[0]}$ is ${SolidityBid[1]}!`);
                        CloseTrade();
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price}$ has been removed. The quantity on ${SolidityBid[0]}$ is ${SolidityBid[1]}!`, [ dls ], true);
                    } else if (SolidityStatus === 'ends') {
                        TradeStatus = 'inTrade';
                        WebSocketSpot.close();
                        WebSocketSpotBookDepth.close();
                        tcs.SendMessage(`${solidityModel.Symbol}\nSolidity on ${solidityModel.Solidity.Price}$ is almost ends\nThe quantity on ${SolidityBid[0]}$ is ${SolidityBid[1]}\nOpening Order...`);
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price}$ is almost ends. The quantity on ${SolidityBid[0]} is ${SolidityBid[1]}!`, [ dls ], true);
                        FuturesOpenTradePrice = await otm.PlaceMarketOrder(FuturesLastPrice, TradeStopsOptions.TradeOptions.NominalQuantity.toString(), quantityPrecisionFutures);
                    } else if (SolidityStatus === 'moved') {
                        TradeStatus = 'watching';
                        tcs.SendMessage(`${solidityModel.Symbol}\nSolidity has been moved to ${solidityModel.Solidity.Price}$\nUp to price: ${solidityModel.Solidity.UpToPrice}`)
                    }
                }
            } catch (e) {
                throw e;
            }
        }

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
                tcs.SendMessage(`Error with spot trade message on ${solidityModel.Symbol}:\n${e.message}`);
                CloseTrade();
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
                tcs.SendMessage(`Error with spot book depth update on ${solidityModel.Symbol}:\n${e.message}`);
            }

            isProcessingSpotBookDepth = false;
        };

        WebSocketSpotBookDepth.on('message', (data) => {
            messageSpotBookDepthQueue.push(data);
            if (!isProcessingSpotBookDepth) {
                ProcessSpotBookDepthQueue();
            }
        })

        const CloseTrade = () => {
            TradeStatus = 'disabled';
            WebSocketSpot.close();
            WebSocketSpotBookDepth.close();
            WebSocketFutures.close();
            TradingPairsService.DeleteTPInTrade(solidityModel.Symbol);
        }

        WebSocketSpot.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));
        WebSocketFutures.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));
        WebSocketSpotBookDepth.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));

        WebSocketSpot.on('close', () => {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Spot trades websocket on ${solidityModel.Symbol} has been disabled!`, [ dls ], true);
        });

        WebSocketSpotBookDepth.on('close', () => {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Spot book depth websocket on ${solidityModel.Symbol} has been disabled!`, [ dls ], true);
        });

        WebSocketFutures.on('close', () => {
            TradeStatus = 'disabled';
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Futures trades websocket on ${solidityModel.Symbol} has been disabled!`, [ dls ], true);
        });
    };

    CheckSolidity = async (solidityModel: SolidityModel, SolidityBid: StreamBid, UpToPriceSpot: number, TradeStatus: TradeStatus, MaxSolidityQuantity: number, SolidityFinderOptions: SolidityFinderOptionsModel): Promise<SolidityStatus> => {
        const SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD: number = 0.15;

        let SolidityStatus: SolidityStatus;

        // if (TradeStatus === 'reached') {
        //     this.SolidityQuantityHistory.push(SolidityBid[1]);
        // }

        const SolidityQuantityChange = SolidityBid[1] / solidityModel.Solidity.Quantity - 1;

        if (Math.abs(SolidityQuantityChange) < SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD) {
            solidityModel.Solidity.Quantity = SolidityBid[1];
            SolidityStatus = 'ready';
        } else if (UpToPriceSpot === 1) {
            solidityModel.Solidity.Quantity = SolidityBid[1];

            if (SolidityBid[1] / MaxSolidityQuantity < 0.3) {
                SolidityStatus = 'ends';
            } else {
                SolidityStatus = 'ready';
            }
        } else {
            DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Trying to refresh solidity info on ${solidityModel.Symbol}...`, [ dls ], true);
            const lastSolidity = await sfs.FindSolidity(solidityModel.Symbol);

            if (
                lastSolidity.Solidity.Ratio >= SolidityFinderOptions.ratioAccess &&
                lastSolidity.Solidity.UpToPrice >= SolidityFinderOptions.upToPriceAccess &&
                lastSolidity.Solidity?.Type === solidityModel.Solidity.Type
            ) {
                if (lastSolidity.Solidity.Price === solidityModel.Solidity.Price) {
                    SolidityStatus = 'ready';
                    solidityModel = lastSolidity;
                    DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Solidity on ${solidityModel.Symbol} in ${solidityModel.Solidity.Price}!`, [ dls ], true);
                } else {
                    const checkForReachingPrice = await sfs.CheckPriceAtTargetTime(solidityModel.Symbol, lastSolidity.Price, SolidityFinderOptions.checkReachingPriceDuration);
                    if (!checkForReachingPrice) {
                        SolidityStatus = 'moved';
                        solidityModel = lastSolidity;
                        DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `Solidity on ${solidityModel.Symbol} has been moved to ${solidityModel.Solidity.Price} | Ratio: ${solidityModel.Solidity.Ratio}!`, [ dls ], true);
                    } else {
                        SolidityStatus = 'removed';
                    }
                }
            } else {
                SolidityStatus = 'removed';
            }
        }
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