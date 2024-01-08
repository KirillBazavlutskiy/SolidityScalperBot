import {
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
import {
    GeneraOptionsModel,
    OptionsModel,
    SolidityFinderOptionsModel, SolidityWatchingOptionsModel,
    TradingOptionsModel
} from "../OptionsManager/OptionsModel";


export class BinanceTradesService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    TradeSymbol = async (solidityModel: SolidityModel, Options: OptionsModel): Promise<void | 0> => {
        const GeneralOptions = Options.GeneralOptions;
        const SolidityFinderOptions = Options.SolidityFinderOptions;
        const SolidityWatchingOptions = Options.SolidityWatchingOptions;
        const TradingOptions = Options.TradingOptions;

        let TradingPairWithSolidity = solidityModel;

        let exchangeInfoSpot;
        let exchangeInfoFutures;

        exchangeInfoSpot = await this.client.exchangeInfo();

        try {
            exchangeInfoFutures = await this.client.futuresExchangeInfo();
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} is not on futures!`, [ dls], true);
            return 0;
        }

        const OrderBookSpot = await this.client.book({ symbol: TradingPairWithSolidity.Symbol });

        let tickSizeSpot: number = BinanceTradesService.FetchTickSize(exchangeInfoSpot, TradingPairWithSolidity.Symbol);
        let tickSizeFutures: number = BinanceTradesService.FetchTickSize(exchangeInfoFutures, TradingPairWithSolidity.Symbol);

        let quantityPrecisionFutures: number = BinanceTradesService.GetQuantityPrecision(exchangeInfoFutures, TradingPairWithSolidity.Symbol);

        const UP_TO_PRICE_ACCESS_SPOT_THRESHOLD: number = SolidityFinderOptions.UpToPriceAccess / 100 + 0.01;

        let OpenOrderPrice: number;

        let UpToPriceSpot: number = TradingPairWithSolidity.Solidity.UpToPrice;

        let SolidityStatus: SolidityStatus = 'ready';
        let VolumeToDestroyTheSolidity: number = 0;

        let TradeStatus: TradeStatus = 'watching';

        let OpenTradeTime: Date;
        let TradeType: TradeType = TradingPairWithSolidity.Solidity.Type === 'asks' ? 'long' : 'short';

        let SpotLastPrice = TradingPairWithSolidity.Price;

        const otm = new OpenTradesManager(this.client, TradingPairWithSolidity.Symbol, TradingOptions, TradeType, tickSizeFutures);

        DocumentLogService.MadeTheNewLog(
            [FontColor.FgGreen], `New Solidity on ${TradingPairWithSolidity.Symbol} | Solidity Price: ${TradingPairWithSolidity.Solidity.Price} | Solidity Ratio: ${TradingPairWithSolidity.Solidity.Ratio} | Up To Price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(TradingPairWithSolidity.Solidity.UpToPrice, TradingPairWithSolidity.Solidity.Type,4)} | Last Price: ${TradingPairWithSolidity.Price} | Quantity Precision: ${quantityPrecisionFutures}`,
            [ dls ], true);

        const WebSocketSpot: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${TradingPairWithSolidity.Symbol.toLowerCase()}@trade`);
        const WebSocketSpotBookDepth: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${TradingPairWithSolidity.Symbol.toLowerCase()}@depth`);

        const ProcessSpotTrade = async (data: Buffer) => {
            try {
                const processStartData = new Date();
                const strData = data.toString();
                const trade = JSON.parse(strData);

                SpotLastPrice = parseFloat(trade.p);
                const TradeQuantity = parseFloat(trade.q);
                UpToPriceSpot = SpotLastPrice / TradingPairWithSolidity.Solidity.Price;
                TradingPairWithSolidity.Solidity.UpToPrice = UpToPriceSpot;
                TradingPairWithSolidity.Price = SpotLastPrice;

                switch (TradeStatus) {
                    case "watching":
                        if (UpToPriceSpot === 1) {
                            if (SolidityStatus === 'ready') {
                                TradeStatus = 'reached';

                                const processEndData = new Date();
                                const processTime = new Date(processEndData.getTime() - processStartData.getTime());

                                OpenOrderPrice = BinanceOrdersCalculatingKit.FindClosestLimitOrder(TradingPairWithSolidity.Solidity.Type === 'asks'
                                    ? TradingPairWithSolidity.Solidity.Price + tickSizeSpot
                                    : TradingPairWithSolidity.Solidity.Price - tickSizeSpot, tickSizeSpot);

                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | Solidity on ${TradingPairWithSolidity.Solidity.Price} was reached! Waiting for price ${OpenOrderPrice} | Process Time: ${processTime.getSeconds()}s`, [dls, tls], true);
                                tcs.SendMessage(`${TradingPairWithSolidity.Symbol}\nSolidity on ${TradingPairWithSolidity.Solidity.Price} was reached!\nWaiting for price ${OpenOrderPrice}$!`);
                            }
                        } else if ((UpToPriceSpot > 1 && TradingPairWithSolidity.Solidity.Type === 'asks') || (UpToPriceSpot < 1 && TradingPairWithSolidity.Solidity.Type === 'bids')) {
                            if (TradeQuantity >=  TradingPairWithSolidity.Solidity.Quantity) {
                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} |Solidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed with ${TradeQuantity} Volume! | Last Price: ${SpotLastPrice}`, [dls], true);
                                tcs.SendMessage(`${TradingPairWithSolidity.Symbol}\nSolidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed with ${TradeQuantity} Volume!\nLast Price: ${SpotLastPrice}`);
                                await OpenTrade();
                            } else {
                                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} Solidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed! | Up to price: ${UpToPriceSpot} | Last Price: ${SpotLastPrice}`, [dls], true);
                                CloseWatching();
                            }
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} is too far! Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 4)}`, [dls], true);
                            CloseWatching();
                        }
                        break;
                    case "reached":
                        if (UpToPriceSpot === 1) VolumeToDestroyTheSolidity += TradeQuantity;

                        if ((SpotLastPrice >= OpenOrderPrice && TradingPairWithSolidity.Solidity.Type === 'asks') || (SpotLastPrice <= OpenOrderPrice && TradingPairWithSolidity.Solidity.Type === 'bids')) {
                            beep();
                            OpenTradeTime = new Date();
                            DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | Solidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed! | Volume used to destroy the solidity: ${VolumeToDestroyTheSolidity} | Last Price: ${SpotLastPrice}\nOpening order...`, [dls], true);
                            tcs.SendMessage(`${TradingPairWithSolidity.Symbol}\nSolidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed!\nVolume used to destroy the solidity: ${VolumeToDestroyTheSolidity}\nLast solidity quantity was: ${TradingPairWithSolidity.Solidity.Quantity}\nLast price: ${SpotLastPrice}\nOpening order...`)
                            await OpenTrade();
                        } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            tcs.SendMessage(`${TradingPairWithSolidity.Symbol} is too far!\nUp To price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 4)}`);
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} is too far!`, [dls], true);
                            CloseWatching();
                        }
                        break;
                }
                TradingPairsService.ChangeTPInTrade(TradingPairWithSolidity);
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

                const SoliditySideBids: StreamBid[] = parsedBook[TradingPairWithSolidity.Solidity.Type === 'asks' ? 'a' : 'b'];

                const solidityChangeIndex = SoliditySideBids.findIndex(bid => parseFloat(bid[0]) == TradingPairWithSolidity.Solidity.Price);

                if (solidityChangeIndex !== -1 && SolidityStatus !== 'removed' && TradeStatus !== 'inTrade') {
                    const SolidityBid = SoliditySideBids[solidityChangeIndex];

                    SolidityStatus = await this.CheckSolidity(
                        TradingPairWithSolidity, SolidityBid,
                        UpToPriceSpot,
                        TradeStatus,
                        TradingPairWithSolidity.Solidity.MaxQuantity,
                        SolidityFinderOptions,
                        SolidityWatchingOptions,
                        OrderBookSpot,
                        SpotLastPrice,
                        TradingPairWithSolidity.QuoteVolume
                    );
                    if (parseFloat(SolidityBid[1]) > TradingPairWithSolidity.Solidity.MaxQuantity) TradingPairWithSolidity.Solidity.MaxQuantity = parseFloat(SolidityBid[1]);

                    TradingPairsService.ChangeTPInTrade(TradingPairWithSolidity);
                    if (SolidityStatus === 'removed') {
                        if (TradeStatus === 'reached') tcs.SendMessage(`${TradingPairWithSolidity.Symbol}\nSolidity on ${TradingPairWithSolidity.Solidity.Price}$ has been removed!\nThe quantity is ${SolidityBid[1]}\nMax quantity was ${TradingPairWithSolidity.Solidity.MaxQuantity}`);
                        CloseWatching();
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} Solidity on ${TradingPairWithSolidity.Solidity.Price}$ has been removed. The quantity on ${SolidityBid[0]}$ is ${SolidityBid[1]} | Max quantity was ${TradingPairWithSolidity.Solidity.MaxQuantity} | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 6)}`, [ dls ], true);
                    } else if (SolidityStatus === 'ends') {
                        tcs.SendMessage(`${TradingPairWithSolidity.Symbol}\nSolidity on ${TradingPairWithSolidity.Solidity.Price}$ is almost ends\n${BinanceOrdersCalculatingKit.RoundUp(parseFloat(SolidityBid[1]) / TradingPairWithSolidity.Solidity.MaxQuantity * 100, 0)}% of maximum quantity\nOpening Order...`);
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} Solidity on ${TradingPairWithSolidity.Solidity.Price}$ is almost ends. The quantity on ${SolidityBid[0]} is ${SolidityBid[1]}!`, [ dls ], true);
                        await OpenTrade();
                    } else if (SolidityStatus === 'moved') {
                        if (TradeStatus === 'reached') tcs.SendMessage(`${TradingPairWithSolidity.Symbol}\nSolidity has been moved to ${TradingPairWithSolidity.Solidity.Price}$\nUp to price: ${TradingPairWithSolidity.Solidity.UpToPrice}`);
                        TradeStatus = 'watching';
                    }

                    TradingPairWithSolidity.Solidity.Quantity = parseFloat(SolidityBid[1]);
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
                tcs.SendMessage(`Error with spot update on ${TradingPairWithSolidity.Symbol}:\n${e.message}`);
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

        const OpenTrade = async  () => {
            if (!GeneralOptions.ScreenerMode) {
                TradeStatus = 'inTrade';
                SolidityStatus = 'removed';
                await otm.PlaceMarketOrder(SpotLastPrice, TradingOptions.TradeOptions.NominalQuantity.toString(), quantityPrecisionFutures);
                WebSocketSpot.close();
                WebSocketSpotBookDepth.close();
            } else {
                CloseWatching();
            }
        }

        const CloseWatching = () => {
            TradeStatus = 'disabled';
            SolidityStatus = 'removed';
            WebSocketSpot.close();
            WebSocketSpotBookDepth.close();
            TradingPairsService.DeleteTPInTrade(TradingPairWithSolidity.Symbol);
        }

        WebSocketSpot.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${TradingPairWithSolidity.Symbol}! ${e.message}`));
        WebSocketSpotBookDepth.on('error', e => DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${TradingPairWithSolidity.Symbol}! ${e.message}`));

        WebSocketSpot.on('close', () => {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Spot trades websocket on ${TradingPairWithSolidity.Symbol} has been disabled!`, [ dls ], true);
        });

        WebSocketSpotBookDepth.on('close', () => {
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Spot book depth websocket on ${TradingPairWithSolidity.Symbol} has been disabled!`, [ dls ], true);
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
            SolidityWatchingOptions: SolidityWatchingOptionsModel,
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

                if (parseFloat(SolidityBid[1]) / MaxSolidityQuantity < SolidityWatchingOptions.SolidityRemainderForTrade) {
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
                        const checkForReachingPrice = await sfs.CheckPriceAtTargetTime(solidityModel.Symbol, lastSolidity.Price, SolidityFinderOptions.PriceUninterruptedDuration);
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