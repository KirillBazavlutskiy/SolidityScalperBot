import {
    Bid,
    Binance,
    ExchangeInfo,
    FuturesOrderType_LT,
    OrderBook,
    OrderType_LT,
    PartialDepth,
    WSTrade
} from "binance-api-node";
import {SolidityModel} from "../SolidityFinderService/SolidityFinderModels";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";
import {dls, sfs, tcs, tls} from "../../index";
import {SolidityStatus, TradeStatus, TradeType, UpdateMessage} from "./BinanceTradesModels";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import beep from 'beepbeep';
import {BinanceOrdersCalculatingKit} from "./BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {OpenTradesManager} from "./OpenTradesManager/OpenTradesManager";
import {OptionsModel, SolidityFinderOptionsModel, SolidityWatchingOptionsModel,} from "../OptionsManager/OptionsModel";


export class BinanceTradesService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    WatchTheSymbol = async (solidityModel: SolidityModel, Options: OptionsModel): Promise<void | 0> => {
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

        try {
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
                [FontColor.FgGreen], `New Solidity on ${TradingPairWithSolidity.Symbol} | Solidity Price: ${TradingPairWithSolidity.Solidity.Price} | Solidity Ratio: ${TradingPairWithSolidity.Solidity.Ratio.toFixed()} | Up To Price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(TradingPairWithSolidity.Solidity.UpToPrice, TradingPairWithSolidity.Solidity.Type,4)} | Last Price: ${TradingPairWithSolidity.Price}`,
                [ dls ], true, false);

            const MessagesSpotUpdatesQueue: UpdateMessage[] = [];
            let isProcessingSpotUpdate = false;

            const ProcessSpotUpdateQueue = async () => {
                if (isProcessingSpotUpdate) return;
                isProcessingSpotUpdate = true;

                try {
                    while (MessagesSpotUpdatesQueue.length > 0) {
                        const UpdateMessage = MessagesSpotUpdatesQueue.shift();
                        if (UpdateMessage.Type === 'TradeUpdate') await ProcessSpotTrade(UpdateMessage.Message);
                        else await ProcessSpotBookDepthUpdate(UpdateMessage.Message)
                    }
                } catch (e) {
                    DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with spot update ${e.message}`, [dls], true);
                    tcs.SendMessage(`Error with spot update on ${TradingPairWithSolidity.Symbol}:\n${e.message}`);
                }

                isProcessingSpotUpdate = false;
            };

            const CleanSpotTradesWebsocket = this.client.ws.trades(`${TradingPairWithSolidity.Symbol}`, trade => {
                MessagesSpotUpdatesQueue.push({ Message: trade, Type: "TradeUpdate" });
                if (!isProcessingSpotUpdate) {
                    ProcessSpotUpdateQueue();
                }
            });

            const CleanSpotBookDepthWebsocket = this.client.ws.partialDepth(
                { symbol: TradingPairWithSolidity.Symbol, level: 20 },
                depth => {
                    MessagesSpotUpdatesQueue.push({ Message: depth, Type: 'BookDepthUpdate' });
                    if (!isProcessingSpotUpdate) {
                        ProcessSpotUpdateQueue();
                    }
                });

            const CheckForSharpBreakout = async () => {
                return SolidityWatchingOptions.AllowSharpBreakout ?
                    {
                        access: true,
                        priceChange: null
                    } :
                    await sfs.CheckForAcceptablePriceChange(
                        TradingPairWithSolidity.Symbol,
                        SolidityWatchingOptions.AcceptablePriceChange.Period,
                        SolidityWatchingOptions.AcceptablePriceChange.PriceChange
                    );
            }

            const ProcessSpotTrade = async (Trade: WSTrade) => {
                try {
                    const processStartData = new Date();

                    SpotLastPrice = parseFloat(Trade.price);
                    const TradeQuantity = parseFloat(Trade.quantity);
                    UpToPriceSpot = SpotLastPrice / TradingPairWithSolidity.Solidity.Price;
                    TradingPairWithSolidity.Solidity.UpToPrice = UpToPriceSpot;
                    TradingPairWithSolidity.Price = SpotLastPrice;

                    switch (TradeStatus) {
                        case "watching":
                            if (UpToPriceSpot === 1) {
                                const CheckForSharpBreakoutResult = await CheckForSharpBreakout();
                                if (SolidityStatus === 'ready' && CheckForSharpBreakoutResult.access) {
                                    TradeStatus = 'reached';

                                    const processEndData = new Date();
                                    const processTime = new Date(processEndData.getTime() - processStartData.getTime());

                                    OpenOrderPrice = BinanceOrdersCalculatingKit.FindClosestLimitOrder(TradingPairWithSolidity.Solidity.Type === 'asks'
                                        ? TradingPairWithSolidity.Solidity.Price + tickSizeSpot
                                        : TradingPairWithSolidity.Solidity.Price - tickSizeSpot, tickSizeSpot);

                                    DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | Solidity on ${TradingPairWithSolidity.Solidity.Price} was reached! | Price change for ${SolidityWatchingOptions.AcceptablePriceChange.Period}m: ${BinanceOrdersCalculatingKit.RoundUp(CheckForSharpBreakoutResult.priceChange, 4)}% | Waiting for price ${OpenOrderPrice}`,
                                        [dls, tls], true, true);
                                } else {
                                    DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | The price approached too quickly! | Price change for ${SolidityWatchingOptions.AcceptablePriceChange.Period}m: ${CheckForSharpBreakoutResult.priceChange}%`,
                                        [dls, tls], true, true);
                                        CloseWatching();
                                }
                            } else if ((UpToPriceSpot > 1 && TradingPairWithSolidity.Solidity.Type === 'asks') || (UpToPriceSpot < 1 && TradingPairWithSolidity.Solidity.Type === 'bids')) {
                                if (TradeQuantity >=  TradingPairWithSolidity.Solidity.Quantity && SolidityWatchingOptions.AllowSharpBreakout) {
                                    DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | Solidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed with ${TradeQuantity.toFixed()} Volume! | Last Price: ${SpotLastPrice}`,
                                        [dls], true, true);
                                    await OpenTrade();
                                } else {
                                    DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} | Solidity on ${TradingPairWithSolidity.Solidity.Price} has been destroyed! | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 4)} | Last Price: ${SpotLastPrice}`,
                                        [dls], true, false);
                                    CloseWatching();
                                }
                            } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} | Price is too far! | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 4)}`,
                                    [dls], true, false);
                                CloseWatching();
                            }
                            break;
                        case "reached":
                            if (UpToPriceSpot === 1) VolumeToDestroyTheSolidity += TradeQuantity;

                            if ((SpotLastPrice >= OpenOrderPrice && TradingPairWithSolidity.Solidity.Type === 'asks') || (SpotLastPrice <= OpenOrderPrice && TradingPairWithSolidity.Solidity.Type === 'bids')) {
                                beep();
                                OpenTradeTime = new Date();
                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | Solidity on ${TradingPairWithSolidity.Solidity.Price} has been broken! | Volume used to destroy the solidity: ${VolumeToDestroyTheSolidity} | Last solidity quantity was: ${TradingPairWithSolidity.Solidity.Quantity} | Last Price: ${SpotLastPrice}\nOpening order...`,
                                    [dls], true, true);
                                await OpenTrade();
                            } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} is too far! | Up To price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 4)}`,
                                    [dls], true, true);
                                CloseWatching();
                            }
                            break;
                    }
                    TradingPairsService.ChangeTPInTrade(TradingPairWithSolidity);
                } catch (e) {
                    throw e;
                }
            }

            const ProcessSpotBookDepthUpdate = async (BookDepth: PartialDepth) => {
                try {
                    BinanceTradesService.UpdateBookDepth(OrderBookSpot, BookDepth);

                    const SoliditySideBids: Bid[] = TradingPairWithSolidity.Solidity.Type === 'asks' ? BookDepth.asks : BookDepth.bids;

                    const solidityChangeIndex = SoliditySideBids.findIndex(Bid => parseFloat(Bid.price) == TradingPairWithSolidity.Solidity.Price);

                    if (solidityChangeIndex !== -1 && SolidityStatus !== 'removed' && TradeStatus !== 'inTrade') {
                        const SolidityBid = SoliditySideBids[solidityChangeIndex];
                        const SolidityQuantity = parseFloat(SolidityBid.quantity);
                        const SolidityPrice = parseFloat(SolidityBid.price);

                        SolidityStatus = await this.CheckSolidity(
                            TradingPairWithSolidity,
                            SolidityBid,
                            UpToPriceSpot,
                            TradeStatus,
                            TradingPairWithSolidity.Solidity.MaxQuantity,
                            SolidityFinderOptions,
                            SolidityWatchingOptions,
                            OrderBookSpot,
                            SpotLastPrice,
                            TradingPairWithSolidity.QuoteVolume
                        );
                        if (SolidityQuantity > TradingPairWithSolidity.Solidity.MaxQuantity) TradingPairWithSolidity.Solidity.MaxQuantity = SolidityQuantity;

                        TradingPairsService.ChangeTPInTrade(TradingPairWithSolidity);
                        if (SolidityStatus === 'removed') {
                            CloseWatching();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} Solidity on ${TradingPairWithSolidity.Solidity.Price}$ has been removed. The quantity on ${SolidityPrice}$ is ${SolidityQuantity} | Max quantity was ${TradingPairWithSolidity.Solidity.MaxQuantity} | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot, TradingPairWithSolidity.Solidity.Type, 6)}`,
                                [ dls ], true, TradeStatus === 'reached');
                        } else if (SolidityStatus === 'ends') {
                            const CheckForSharpBreakoutResult = await CheckForSharpBreakout();
                            if (CheckForSharpBreakoutResult.access) {
                                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} Solidity on ${TradingPairWithSolidity.Solidity.Price}$ is almost ends | ${BinanceOrdersCalculatingKit.RoundUp(SolidityQuantity / TradingPairWithSolidity.Solidity.MaxQuantity * 100, 0)}% of maximum quantity | Opening Order...`,
                                    [ dls ], true, true);
                                await OpenTrade();
                            } else {
                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${TradingPairWithSolidity.Symbol} | The price approached too quickly! | Price change for ${SolidityWatchingOptions.AcceptablePriceChange.Period}m: ${CheckForSharpBreakoutResult.priceChange}%`,
                                    [dls, tls], true, true);
                            }
                        } else if (SolidityStatus === 'moved') {
                            DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `${TradingPairWithSolidity.Symbol}\nSolidity has been moved to ${TradingPairWithSolidity.Solidity.Price}$\nUp to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(TradingPairWithSolidity.Solidity.UpToPrice, TradingPairWithSolidity.Solidity.Type, 4)}`,
                                [dls], true, TradeStatus === 'reached');
                            TradeStatus = 'watching';
                        }

                        TradingPairWithSolidity.Solidity.Quantity = SolidityQuantity;
                    }
                } catch (e) {
                    throw e;
                }
            }

            const OpenTrade = async  () => {
                try {
                    if (!GeneralOptions.ScreenerMode) {
                        TradeStatus = 'inTrade';
                        SolidityStatus = 'removed';
                        await otm.PlaceMarketOrder(SpotLastPrice, TradingOptions.TradeOptions.NominalQuantity.toString(), quantityPrecisionFutures);
                        CleanSpotTradesWebsocket({delay: 0, fastClose: false, keepClosed: false});
                        CleanSpotBookDepthWebsocket({delay: 0, fastClose: false, keepClosed: false});
                    } else {
                        CloseWatching();
                    }
                } catch (e) {
                    DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} | Error with placing orders! | ${e.message}`);
                }
            }

            const CloseWatching = () => {
                try {
                    TradeStatus = 'disabled';
                    SolidityStatus = 'removed';
                    CleanSpotTradesWebsocket({delay: 200, fastClose: false, keepClosed: false});
                    CleanSpotBookDepthWebsocket({delay: 200, fastClose: false, keepClosed: false});
                    TradingPairsService.DeleteTPInTrade(TradingPairWithSolidity.Symbol);
                } catch (e) {
                    DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} | Error with closing websockets! | ${e.message}`);
                }
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${TradingPairWithSolidity.Symbol} | Error: ${e.message}`, [], true, true);
        }
    };

    CheckSolidity =
        async (
            SolidityModel: SolidityModel,
            SolidityBid: Bid,
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
            const SolidityQuantityChange = parseFloat(SolidityBid.quantity) / SolidityModel.Solidity.Quantity - 1;
            const SolidityQuantity =  parseFloat(SolidityBid.quantity)

            if (UpToPriceSpot === 1) {
                SolidityModel.Solidity.Quantity = SolidityQuantity;

                if (SolidityQuantity / MaxSolidityQuantity < SolidityWatchingOptions.SolidityRemainderForTrade) {
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
                SolidityModel.Solidity.Quantity = SolidityQuantity;
                SolidityStatus = 'ready';
            } else {
                DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Trying to refresh solidity info on ${SolidityModel.Symbol}... (Quantity change: ${SolidityQuantityChange}, Up to price: ${UpToPriceSpot})`, [ dls ], true);
                const lastSolidity = await sfs.FindSolidity(SolidityModel.Symbol, OrderBook, LastPrice, QuoteVolume);

                if (
                    lastSolidity.Solidity.Ratio >= SolidityFinderOptions.RatioAccess &&
                    lastSolidity.Solidity.UpToPrice >= SolidityFinderOptions.UpToPriceAccess &&
                    lastSolidity.Solidity?.Type === SolidityModel.Solidity.Type
                ) {
                    if (lastSolidity.Solidity.Price === SolidityModel.Solidity.Price) {
                        SolidityStatus = 'ready';
                        DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Solidity on ${SolidityModel.Symbol} in ${SolidityModel.Solidity.Price} | Ratio: ${lastSolidity.Solidity.Ratio} | ${SolidityModel.Solidity.Quantity} -> ${SolidityQuantity}`, [ dls ], true);
                        SolidityModel = lastSolidity;
                    } else {
                        const checkForReachingPrice =
                            SolidityFinderOptions.PriceUninterruptedDuration === 0 ? false :
                            await sfs.CheckPriceAtTargetTime(SolidityModel.Symbol, lastSolidity.Price, SolidityFinderOptions.PriceUninterruptedDuration);
                        if (!checkForReachingPrice) {
                            SolidityStatus = 'moved';
                            SolidityModel.Solidity = lastSolidity.Solidity;
                        } else {
                            SolidityStatus = 'removed';
                            SolidityModel.Solidity.Quantity = SolidityQuantity;
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

    static UpdateBookDepth = (OrderBook: OrderBook, PartialBookDepth: PartialDepth) => {
        PartialBookDepth.bids.forEach(({ price, quantity }) => {
            const bidIndex = OrderBook.bids.findIndex(bid => bid.price === price);

            if (bidIndex !== -1) {
                if (parseFloat(quantity) === 0) {
                    OrderBook.bids.splice(bidIndex, 1);
                } else {
                    OrderBook.bids[bidIndex].quantity = quantity;
                }
            } else {
                OrderBook.bids.push({ price: price, quantity: quantity });
            }
        });

        PartialBookDepth.asks.forEach(({ price, quantity }) => {
            const askIndex = OrderBook.asks.findIndex(ask => ask.price === price);

            if (askIndex !== -1) {
                if (parseFloat(quantity) === 0) {
                    OrderBook.asks.splice(askIndex, 1);
                } else {
                    OrderBook.asks[askIndex].quantity = quantity;
                }
            } else {
                OrderBook.asks.push({ price: price, quantity: quantity });
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