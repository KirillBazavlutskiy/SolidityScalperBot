import {
    Bid,
    Binance,
    ExchangeInfo,
    FuturesOrderType_LT, OrderBook,
    OrderType_LT
} from "binance-api-node";
import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";
import {dls, sfs, tcs, tls} from "../../index";
import {
    SolidityStatus,
    StreamBid,
    TradeStatus,
    TradeType, UpdateMessage
} from "./BinanceTradesModels";
import WebSocket from 'ws';
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import beep from 'beepbeep';
import {BinanceOrdersCalculatingKit} from "./BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {OpenTradesManager} from "./OpenTradesManager/OpenTradesManager";
import {SolidityFinderOptionsModel, TradingOptionsModel} from "../OptionsManager/OptionsModel";


export class BinanceTradesService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    TradeSymbol = async (solidityModel: SolidityModel, SolidityFinderOptions: SolidityFinderOptionsModel, TradeStopsOptions: TradingOptionsModel): Promise<void | 0> => {
        let exchangeInfoSpot;
        let exchangeInfoFutures;

        exchangeInfoSpot = await this.client.exchangeInfo();

        try {
            exchangeInfoFutures = await this.client.futuresExchangeInfo();
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is not on futures!`, [ dls], true);
            return 0;
        }

        const OrderBookSpot = await this.client.book({ symbol: solidityModel.Symbol });

        let tickSizeSpot: number = BinanceTradesService.FetchTickSize(exchangeInfoSpot, solidityModel.Symbol);
        let tickSizeFutures: number = BinanceTradesService.FetchTickSize(exchangeInfoFutures, solidityModel.Symbol);

        let quantityPrecisionFutures: number = BinanceTradesService.GetQuantityPrecision(exchangeInfoFutures, solidityModel.Symbol);

        const UP_TO_PRICE_ACCESS_SPOT_THRESHOLD: number = SolidityFinderOptions.UpToPriceAccess / 100 + 0.01;

        let OpenOrderPrice: number;

        let UpToPriceSpot: number = solidityModel.Solidity.UpToPrice;

        let SolidityStatus: SolidityStatus = 'ready';
        let MaxSolidityQuantity = solidityModel.Solidity.Quantity;

        let TradeStatus: TradeStatus = 'watching';

        let OpenTradeTime: Date;
        let TradeType: TradeType = solidityModel.Solidity.Type === 'asks' ? 'long' : 'short';

        let SpotLastPrice = solidityModel.Price;

        const otm = new OpenTradesManager(this.client, solidityModel.Symbol, TradeStopsOptions, TradeType, tickSizeFutures);

        DocumentLogService.MadeTheNewLog(
            [FontColor.FgGreen], `New Solidity on ${solidityModel.Symbol} | Solidity Price: ${solidityModel.Solidity.Price} | Solidity Ratio: ${solidityModel.Solidity.Ratio} | Up To Price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(solidityModel.Solidity.UpToPrice, solidityModel.Solidity.Type,4)} | Last Price: ${solidityModel.Price} | Quantity Precision: ${quantityPrecisionFutures}`,
            [ dls ], true);

        const WebSocketSpot: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.Symbol.toLowerCase()}@trade`);
        const WebSocketSpotBookDepth: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.Symbol.toLowerCase()}@depth`);

        const ProcessSpotTrade = async (data: Buffer) => {
            try {
                const processStartData = new Date();
                const strData = data.toString();
                const trade = JSON.parse(strData);

                SpotLastPrice = parseFloat(trade.p);
                UpToPriceSpot = SpotLastPrice / solidityModel.Solidity.Price;
                solidityModel.Solidity.UpToPrice = UpToPriceSpot;
                solidityModel.Price = SpotLastPrice;

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
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is too far! Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, solidityModel.Solidity.Type, 4)}`, [dls], true);
                            CloseTrade();
                        }
                        break;
                    case "reached":
                        if ((SpotLastPrice >= OpenOrderPrice && solidityModel.Solidity.Type === 'asks') || (SpotLastPrice <= OpenOrderPrice && solidityModel.Solidity.Type === 'bids')) {
                            SolidityStatus = 'removed';
                            TradeStatus = 'inTrade';
                            beep();

                            OpenTradeTime = new Date();

                            await otm.PlaceMarketOrder(SpotLastPrice, TradeStopsOptions.TradeOptions.NominalQuantity.toString(), quantityPrecisionFutures);
                            WebSocketSpot.close();
                            WebSocketSpotBookDepth.close();
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, solidityModel.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            tcs.SendMessage(`${solidityModel.Symbol} is too far!\nUp To price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, solidityModel.Solidity.Type, 4)}`);
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} is too far!`, [dls], true);
                            CloseTrade();
                        }
                        break;
                }
                TradingPairsService.ChangeTPInTrade(solidityModel);
            } catch (e) {
                throw e;
            }
        }

        const ProcessSpotBookDepthUpdate = async (data: Buffer) => {
            try {
                const strData = data.toString();
                const parsedBook = JSON.parse(strData);

                const ParsedBids: StreamBid[] = parsedBook['b'];
                const ParsedAsks: StreamBid[] = parsedBook['a'];

                BinanceTradesService.UpdateBookDepth(OrderBookSpot, { Asks: ParsedAsks, Bids: ParsedBids });

                const SoliditySideBids: StreamBid[] = parsedBook[solidityModel.Solidity.Type === 'asks' ? 'a' : 'b'];

                const solidityChangeIndex = SoliditySideBids.findIndex(bid => parseFloat(bid[0]) == solidityModel.Solidity.Price);

                if (solidityChangeIndex !== -1 && SolidityStatus !== 'removed' && TradeStatus !== 'inTrade') {
                    const SolidityBid = SoliditySideBids[solidityChangeIndex];

                    SolidityStatus = await this.CheckSolidity(solidityModel, SolidityBid, UpToPriceSpot, TradeStatus, MaxSolidityQuantity, SolidityFinderOptions, OrderBookSpot, SpotLastPrice, solidityModel.QuoteVolume);
                    if (parseFloat(SolidityBid[1]) > MaxSolidityQuantity) MaxSolidityQuantity = parseFloat(SolidityBid[1]);

                    TradingPairsService.ChangeTPInTrade(solidityModel);
                    if (SolidityStatus === 'removed') {
                        if (TradeStatus === 'reached') tcs.SendMessage(`${solidityModel.Symbol}\nSolidity on ${solidityModel.Solidity.Price}$ has been removed!\nThe quantity is ${SolidityBid[1]}\nMax quantity was ${MaxSolidityQuantity}`);
                        CloseTrade();
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price}$ has been removed. The quantity on ${SolidityBid[0]}$ is ${SolidityBid[1]} | Max quantity was ${MaxSolidityQuantity} | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, solidityModel.Solidity.Type, 6)}`, [ dls ], true);
                    } else if (SolidityStatus === 'ends') {
                        TradeStatus = 'inTrade';
                        WebSocketSpot.close();
                        WebSocketSpotBookDepth.close();
                        tcs.SendMessage(`${solidityModel.Symbol}\nSolidity on ${solidityModel.Solidity.Price}$ is almost ends\nThe quantity on ${SolidityBid[0]}$ is ${SolidityBid[1]}\nOpening Order...`);
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.Symbol} Solidity on ${solidityModel.Solidity.Price}$ is almost ends. The quantity on ${SolidityBid[0]} is ${SolidityBid[1]}!`, [ dls ], true);
                        await otm.PlaceMarketOrder(SpotLastPrice, TradeStopsOptions.TradeOptions.NominalQuantity.toString(), quantityPrecisionFutures);
                    } else if (SolidityStatus === 'moved') {
                        if (TradeStatus === 'reached') tcs.SendMessage(`${solidityModel.Symbol}\nSolidity has been moved to ${solidityModel.Solidity.Price}$\nUp to price: ${solidityModel.Solidity.UpToPrice}`);
                        TradeStatus = 'watching';
                    }

                    solidityModel.Solidity.Quantity = parseFloat(SolidityBid[1]);
                }
            } catch (e) {
                throw e;
            }
        }

        const MessagesSpotUpdatesQueue: UpdateMessage[] = [];
        let isProcessingSpotUpdate = false;

        const ProcessSpotUpdateQueue = async () => {
            if (isProcessingSpotUpdate) return;
            isProcessingSpotUpdate = true;

            try {
                while (MessagesSpotUpdatesQueue.length > 0) {
                    const UpdateMessage = MessagesSpotUpdatesQueue.shift();
                    if (UpdateMessage.Type === 'Trade') await ProcessSpotTrade(UpdateMessage.Message);
                    else await ProcessSpotBookDepthUpdate(UpdateMessage.Message)
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with spot update ${e.message}`, [dls], true);
                tcs.SendMessage(`Error with spot update on ${solidityModel.Symbol}:\n${e.message}`);
            }

            isProcessingSpotUpdate = false;
        };

        WebSocketSpot.on('message', (data: Buffer) => {
            MessagesSpotUpdatesQueue.push({ Type: 'Trade', Message: data });
            if (!isProcessingSpotUpdate) {
                ProcessSpotUpdateQueue();
            }
        });

        WebSocketSpotBookDepth.on('message', (data) => {
            MessagesSpotUpdatesQueue.push({ Type: 'BookDepth', Message: data });
            if (!isProcessingSpotUpdate) {
                ProcessSpotUpdateQueue();
            }
        })

        const CloseTrade = () => {
            TradeStatus = 'disabled';
            WebSocketSpot.close();
            WebSocketSpotBookDepth.close();
            TradingPairsService.DeleteTPInTrade(solidityModel.Symbol);
        }

        WebSocketSpot.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));
        WebSocketSpotBookDepth.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.Symbol}! ${e.message}`));

        WebSocketSpot.on('close', () => {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Spot trades websocket on ${solidityModel.Symbol} has been disabled!`, [ dls ], true);
        });

        WebSocketSpotBookDepth.on('close', () => {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Spot book depth websocket on ${solidityModel.Symbol} has been disabled!`, [ dls ], true);
        });
    };

    CheckSolidity =
        async (
            solidityModel: SolidityModel,
            SolidityBid: StreamBid,
            UpToPriceSpot: number,
            TradeStatus: TradeStatus,
            MaxSolidityQuantity: number,
            SolidityFinderOptions: SolidityFinderOptionsModel,
            OrderBook: OrderBook,
            LastPrice: number,
            QuoteVolume: number,
        ): Promise<SolidityStatus> => {
        const SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD: number = 0.3;

        let SolidityStatus: SolidityStatus = "ready";

        try {
            const SolidityQuantityChange = parseFloat(SolidityBid[1]) / solidityModel.Solidity.Quantity - 1;

            if (UpToPriceSpot === 1) {
                solidityModel.Solidity.Quantity = parseFloat(SolidityBid[1]);

                if (parseFloat(SolidityBid[1]) / MaxSolidityQuantity < 0.3) {
                    SolidityStatus = 'ends';
                } else {
                    SolidityStatus = 'ready';
                }

                return SolidityStatus;
            }

            if (
                (SolidityQuantityChange >= 0) ||
                (SolidityQuantityChange < 0 && Math.abs(SolidityQuantityChange) < SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD)
            ) {
                solidityModel.Solidity.Quantity = parseFloat(SolidityBid[1]);
                SolidityStatus = 'ready';
            } else {
                DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Trying to refresh solidity info on ${solidityModel.Symbol}... (Quantity change: ${SolidityQuantityChange}, Up to price: ${UpToPriceSpot})`, [ dls ], true);
                const lastSolidity = await sfs.FindSolidity(solidityModel.Symbol, OrderBook, LastPrice, QuoteVolume);

                if (
                    lastSolidity.Solidity.Ratio >= SolidityFinderOptions.RatioAccess &&
                    lastSolidity.Solidity.UpToPrice >= SolidityFinderOptions.UpToPriceAccess &&
                    lastSolidity.Solidity?.Type === solidityModel.Solidity.Type
                ) {
                    if (lastSolidity.Solidity.Price === solidityModel.Solidity.Price) {
                        SolidityStatus = 'ready';
                        solidityModel = lastSolidity;
                        DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Solidity on ${solidityModel.Symbol} in ${solidityModel.Solidity.Price} | Ratio: ${lastSolidity.Solidity.Ratio} | ${solidityModel.Solidity.Quantity} -> ${SolidityBid[1]}`, [ dls ], true);
                        solidityModel.Solidity.Quantity = parseFloat(SolidityBid[1]);
                    } else {
                        let checkForReachingPrice = true;
                        if (SolidityFinderOptions.PriceUninterruptedDuration !== 0) checkForReachingPrice = await sfs.CheckPriceAtTargetTime(solidityModel.Symbol, lastSolidity.Price, SolidityFinderOptions.PriceUninterruptedDuration);
                        if (!checkForReachingPrice) {
                            SolidityStatus = 'moved';
                            solidityModel.Solidity = lastSolidity.Solidity;
                            DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `Solidity on ${solidityModel.Symbol} has been moved to ${solidityModel.Solidity.Price} | Up to price: ${solidityModel.Solidity.UpToPrice}!`, [ dls ], true);
                        } else {
                            SolidityStatus = 'removed';
                            solidityModel.Solidity.Quantity = parseFloat(SolidityBid[1]);
                        }
                    }
                } else {
                    SolidityStatus = 'removed';
                }
            }
        } catch (e) {
            e.message = `Error with CheckSolidity function: ${e.message}`;
            throw e;
        }

        return SolidityStatus;
    }

    static UpdateBookDepth = (OrderBook: OrderBook, PartialBookDepth: { Asks: StreamBid[], Bids: StreamBid[] }) => {
        PartialBookDepth.Bids.forEach(([price, quantity]) => {
            const priceString = price.toString();
            const quantityString = quantity.toString();
            const bidIndex = OrderBook.bids.findIndex(bid => bid.price === priceString);

            if (bidIndex !== -1) {
                if (parseFloat(quantity) === 0) {
                    OrderBook.bids.splice(bidIndex, 1);
                } else {
                    OrderBook.bids[bidIndex].quantity = quantityString;
                }
            } else {
                OrderBook.bids.push({ price: priceString, quantity: quantityString });
            }
        });

        PartialBookDepth.Asks.forEach(([price, quantity]) => {
            const priceString = price.toString();
            const quantityString = quantity.toString();
            const askIndex = OrderBook.asks.findIndex(ask => ask.price === priceString);

            if (askIndex !== -1) {
                if (parseFloat(quantity) === 0) {
                    OrderBook.asks.splice(askIndex, 1);
                } else {
                    OrderBook.asks[askIndex].quantity = quantityString;
                }
            } else {
                OrderBook.asks.push({ price: priceString, quantity: quantityString });
            }
        });
    }

    static GetQuantityPrecision = (exchangeInfo: ExchangeInfo<OrderType_LT> | ExchangeInfo<FuturesOrderType_LT>, symbol: string) => {
        for (const pair of exchangeInfo.symbols) {
            if (pair.symbol === symbol) return pair.quantityPrecision;
        }
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