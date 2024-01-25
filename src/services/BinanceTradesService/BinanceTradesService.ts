import {
    Bid,
    Binance,
    ExchangeInfo,
    FuturesOrderType_LT,
    OrderBook,
    OrderType_LT,
    PartialDepth, ReconnectingWebSocketHandler,
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
import {CandleAnalyzeService} from "../SolidityFinderService/CandleAnalyzeService/CandleAnalyzeService";


export class BinanceTradesService {
    private client: Binance;
    private TradingPairWithSolidity: SolidityModel;
    private Options: OptionsModel;

    Symbol: string;

    private ExchangeInfoSpot: ExchangeInfo<OrderType_LT>;
    private ExchangeInfoFutures: ExchangeInfo<FuturesOrderType_LT>;

    private CleanSpotTradesWebsocket: ReconnectingWebSocketHandler;
    private CleanSpotBookDepthWebsocket: ReconnectingWebSocketHandler;

    private MessagesSpotUpdatesQueue: UpdateMessage[];
    private isProcessingSpotUpdate: boolean;

    private OrderBookSpot: OrderBook;

    private TickSizeSpot: number;
    private TickSizeFutures: number;

    private QuantityPrecisionFutures: number;

    private UpToPriceAccessSpotThreshold: number;

    private OpenOrderPrice: number;

    private UpToPriceSpot: number

    private SolidityStatus: SolidityStatus;
    private VolumeToDestroyTheSolidity: number;

    private TradeStatus: TradeStatus;
    private TradeType: TradeType;

    private SpotLastPrice: number;

    private OpenTradesManager: OpenTradesManager;

    GetTradingPairData = () => {
        return this.TradingPairWithSolidity;
    }

    constructor(client: Binance, SolidityModel: SolidityModel, OptionsParams: OptionsModel) {
        this.client = client;
        this.TradingPairWithSolidity = SolidityModel;
        this.Symbol = this.TradingPairWithSolidity.Symbol;
        this.Options = OptionsParams;

        this.TradeStatus = 'watching';
        this.SolidityStatus = 'ready';
        this.VolumeToDestroyTheSolidity = 0;

        this.UpToPriceAccessSpotThreshold = this.Options.SolidityFinderOptions.UpToPriceAccess / 100 + 0.001;
        this.TradeType =  this.TradingPairWithSolidity.Solidity.Type === 'asks' ? 'long' : 'short';

        this.SpotLastPrice = this.TradingPairWithSolidity.Price;

        this.MessagesSpotUpdatesQueue = [];
        this.isProcessingSpotUpdate = false;
    }

    private PrepareExchangeInfoDataForTrade = async () => {
        try {
            const orderBookPromise = this.client.book({ symbol: this.TradingPairWithSolidity.Symbol })
                .then(data => this.OrderBookSpot = data);

            const exchangeInfoSpotPromise = this.client.exchangeInfo()
                .then(data => this.ExchangeInfoSpot = data);

            const exchangeInfoFuturesPromise = this.client.futuresExchangeInfo()
                .then(data => this.ExchangeInfoFutures = data);

            await Promise.all([
                orderBookPromise,
                exchangeInfoSpotPromise,
                exchangeInfoFuturesPromise
            ]);

            this.TickSizeSpot = BinanceTradesService.FetchTickSize(this.ExchangeInfoSpot, this.TradingPairWithSolidity.Symbol);
            this.TickSizeFutures = BinanceTradesService.FetchTickSize(this.ExchangeInfoFutures, this.TradingPairWithSolidity.Symbol);
            this.QuantityPrecisionFutures = BinanceTradesService.GetQuantityPrecision(this.ExchangeInfoFutures, this.TradingPairWithSolidity.Symbol);
            this.OpenTradesManager = new OpenTradesManager(this.client, this.TradingPairWithSolidity.Symbol, this.Options.TradingOptions, this.TradeType, this.TickSizeFutures);
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Can't fetch exchange info!`, [dls], true);
            this.CloseWatching();
        }
    }


    StartWatching =  async () => {
        await this.PrepareExchangeInfoDataForTrade();

        this.ConfigureSpotTradesUpdates();
        this.ConfigureSpotBookDepthUpdate();

        DocumentLogService.MadeTheNewLog(
            [FontColor.FgGreen], `New Solidity on ${this.TradingPairWithSolidity.Symbol} | Solidity Price: ${this.TradingPairWithSolidity.Solidity.Price} | Solidity Ratio: ${this.TradingPairWithSolidity.Solidity.Ratio.toFixed()} | Up To Price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(this.TradingPairWithSolidity.Solidity.UpToPrice, this.TradingPairWithSolidity.Solidity.Type,4)} | Last Price: ${this.TradingPairWithSolidity.Price}`,
            [ dls ], true,  this.Options.GeneralOptions.ScreenerMode);
    }

    private ProcessSpotTrade = async (Trade: WSTrade) => {
        try {
            this.SpotLastPrice = Number(Trade.price);
            const TradeQuantity = Number(Trade.quantity);
            this.UpToPriceSpot = this.SpotLastPrice / this.TradingPairWithSolidity.Solidity.Price;
            this.TradingPairWithSolidity.Solidity.UpToPrice = this.UpToPriceSpot;
            this.TradingPairWithSolidity.Price = this.SpotLastPrice;

            if (this.UpToPriceSpot === 1) this.VolumeToDestroyTheSolidity += TradeQuantity;
            switch (this.TradeStatus) {
                case "watching":
                    if (this.UpToPriceSpot === 1) {
                        const CheckForSharpBreakoutResult = await this.CheckForSharpBreakout();
                        if (this.SolidityStatus === 'ready' && CheckForSharpBreakoutResult.access) {
                            this.TradeStatus = 'reached';

                            this.OpenOrderPrice = BinanceOrdersCalculatingKit.FindClosestLimitOrder(this.TradingPairWithSolidity.Solidity.Type === 'asks'
                                ? this.TradingPairWithSolidity.Solidity.Price + this.TickSizeSpot
                                : this.TradingPairWithSolidity.Solidity.Price - this.TickSizeSpot, this.TickSizeSpot);

                            const VolumeForAPeriod  = await CandleAnalyzeService.GetVolumeOnPeriod(this.Symbol, this.Options.SolidityWatchingOptions.ExceedingVolumeDensityOverPeriod);

                            DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${this.TradingPairWithSolidity.Symbol} | Solidity on ${this.TradingPairWithSolidity.Solidity.Price} was reached! | Price change for ${this.Options.SolidityWatchingOptions.AcceptablePriceChange.Period}m: ${BinanceOrdersCalculatingKit.RoundUp(CheckForSharpBreakoutResult.priceChange, 4)}% | Solidity ratio: ${this.TradingPairWithSolidity.Solidity.Ratio} | Solidity quantity: ${this.TradingPairWithSolidity.Solidity.Quantity} | Volume for a last ${this.Options.SolidityWatchingOptions.ExceedingVolumeDensityOverPeriod}m: ${VolumeForAPeriod.toFixed()} | Waiting for price ${this.OpenOrderPrice}`,
                                [dls, tls], true, true);
                        } else {
                            DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${this.TradingPairWithSolidity.Symbol} | The price approached too quickly! | Price change for ${this.Options.SolidityWatchingOptions.AcceptablePriceChange.Period}m: ${BinanceOrdersCalculatingKit.RoundUp(CheckForSharpBreakoutResult.priceChange, 3)}%`,
                                [dls, tls], true, true);
                            this.CloseWatching();
                        }
                    } else if (
                        (this.UpToPriceSpot > 1 && this.TradingPairWithSolidity.Solidity.Type === 'asks') ||
                        (this.UpToPriceSpot < 1 && this.TradingPairWithSolidity.Solidity.Type === 'bids')
                    ) {
                        if (TradeQuantity >=  this.TradingPairWithSolidity.Solidity.Quantity && this.Options.SolidityWatchingOptions.AllowSharpBreakout) {
                            DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${this.TradingPairWithSolidity.Symbol} | Solidity on ${this.TradingPairWithSolidity.Solidity.Price} has been destroyed with ${TradeQuantity.toFixed()} Volume! | Last Price: ${this.SpotLastPrice}`,
                                [dls], true, true);
                            await this.OpenTrade();
                        } else {
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Solidity on ${this.TradingPairWithSolidity.Solidity.Price} has been destroyed! | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type, 4)} | Last Price: ${this.SpotLastPrice}`,
                                [dls], true, this.Options.GeneralOptions.ScreenerMode);
                            this.CloseWatching();
                        }
                    } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type) > this.UpToPriceAccessSpotThreshold) {
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Price is too far! | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type, 4)}`,
                            [dls], true, this.Options.GeneralOptions.ScreenerMode);
                        this.CloseWatching();
                    }
                    break;
                case "reached":
                    if ((this.SpotLastPrice >= this.OpenOrderPrice && this.TradingPairWithSolidity.Solidity.Type === 'asks') || (this.SpotLastPrice <= this.OpenOrderPrice && this.TradingPairWithSolidity.Solidity.Type === 'bids')) {
                        const Slippage = Math.abs(BinanceOrdersCalculatingKit.CalcSimplifiedRatio(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type)) * 100;
                        if (Slippage <= this.Options.SolidityWatchingOptions.AllowableSlippageDuringPenetration) {
                            this.VolumeToDestroyTheSolidity += TradeQuantity;
                            if (this.VolumeToDestroyTheSolidity >= this.TradingPairWithSolidity.Solidity.Quantity) {
                                beep();
                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${this.TradingPairWithSolidity.Symbol} | Solidity on ${this.TradingPairWithSolidity.Solidity.Price} has been broken! | Last price: ${this.SpotLastPrice} | Slippage: ${BinanceOrdersCalculatingKit.RoundUp(Slippage, 6)}% | ${this.Options.GeneralOptions.ScreenerMode ? '' : 'Opening order...'}`,
                                    [dls], true, true);
                                await this.OpenTrade();
                            } else {
                                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Solidity on ${this.TradingPairWithSolidity.Solidity.Price} was removed! | Last solidity quantity: ${this.TradingPairWithSolidity.Solidity.Quantity} | Volume used to break: ${this.VolumeToDestroyTheSolidity} | Slippage: ${BinanceOrdersCalculatingKit.RoundUp(Slippage, 6)}% | Last Price: ${this.SpotLastPrice}`,
                                    [dls], true, true);
                                this.CloseWatching();
                            }
                        } else {
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Too much slippage (${BinanceOrdersCalculatingKit.RoundUp(Slippage, 6)}%) when solidity on ${this.TradingPairWithSolidity.Solidity.Price} is broken! | Last price: ${this.SpotLastPrice} | The order will not be placed!`,
                                [dls], true, true);
                            this.CloseWatching();
                        }
                    } else if (BinanceOrdersCalculatingKit.CalcSimplifiedRatio(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type) > this.UpToPriceAccessSpotThreshold) {
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Price is too far! | Up To price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type, 4)}`,
                            [dls], true, true);
                        this.CloseWatching();
                    }
                    break;
            }
        } catch (e) {
            e.message = ` trade: ${e.message}`;
            throw e;
        }
    }

    private ProcessSpotBookDepthUpdate = async (BookDepth: PartialDepth) => {
        try {
            BinanceTradesService.UpdateBookDepth(this.OrderBookSpot, BookDepth);

            const SoliditySideBids: Bid[] = this.TradingPairWithSolidity.Solidity.Type === 'asks' ? BookDepth.asks : BookDepth.bids;

            const solidityChangeIndex = SoliditySideBids.findIndex(Bid =>Number(Bid.price) == this.TradingPairWithSolidity.Solidity.Price);

            if (solidityChangeIndex !== -1 && this.SolidityStatus !== 'removed' && this.TradeStatus !== 'inTrade') {
                const SolidityBid = SoliditySideBids[solidityChangeIndex];
                const SolidityQuantity = Number(SolidityBid.quantity);
                const SolidityPrice = Number(SolidityBid.price);

                this.SolidityStatus = await BinanceTradesService.CheckSolidity(
                    this.TradingPairWithSolidity,
                    SolidityBid,
                   this.UpToPriceSpot,
                   this.TradeStatus,
                   this.TradingPairWithSolidity.Solidity.MaxQuantity,
                   this.Options.SolidityFinderOptions,
                   this.Options.SolidityWatchingOptions,
                   this.OrderBookSpot,
                   this.SpotLastPrice,
                   this.TradingPairWithSolidity.QuoteVolume
                );
                if (SolidityQuantity > this.TradingPairWithSolidity.Solidity.MaxQuantity) this.TradingPairWithSolidity.Solidity.MaxQuantity = SolidityQuantity;

                if (this.SolidityStatus === 'removed') {
                    this.CloseWatching();
                    DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} Solidity on ${this.TradingPairWithSolidity.Solidity.Price}$ has been removed. The quantity on ${SolidityPrice}$ is ${SolidityQuantity.toFixed()} | Max quantity was ${this.TradingPairWithSolidity.Solidity.MaxQuantity.toFixed()} | Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(this.UpToPriceSpot, this.TradingPairWithSolidity.Solidity.Type, 6)}`,
                        [ dls ], true, this.TradeStatus == 'reached');
                } else if (this.SolidityStatus === 'ends') {
                    const CheckForSharpBreakoutResult = await this.CheckForSharpBreakout();
                    if (CheckForSharpBreakoutResult.access) {
                        DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} Solidity on ${this.TradingPairWithSolidity.Solidity.Price}$ is almost ends | ${BinanceOrdersCalculatingKit.RoundUp(SolidityQuantity / this.TradingPairWithSolidity.Solidity.MaxQuantity * 100, 0)}% of maximum quantity | Opening Order...`,
                            [ dls ], true, true);
                        await this.OpenTrade();
                    } else {
                        DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${this.TradingPairWithSolidity.Symbol} | The price approached too quickly! |  Price change for ${this.Options.SolidityWatchingOptions.AcceptablePriceChange.Period}m: ${BinanceOrdersCalculatingKit.RoundUp(CheckForSharpBreakoutResult.priceChange, 4)}%`,
                            [dls, tls], true, true);
                    }
                } else if (this.SolidityStatus === 'moved') {
                    DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `${this.TradingPairWithSolidity.Symbol}\nSolidity has been moved to ${this.TradingPairWithSolidity.Solidity.Price}$\nUp to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(this.TradingPairWithSolidity.Solidity.UpToPrice, this.TradingPairWithSolidity.Solidity.Type, 4)}`,
                        [dls], true, this.TradeStatus == 'reached');
                    this.TradeStatus = 'watching';
                }

                this.TradingPairWithSolidity.Solidity.Quantity = SolidityQuantity;
            }
        } catch (e) {
            e.message = ` book depth: ${e.message}`;
            throw e;
        }
    }

    private ConfigureSpotTradesUpdates = () => {
        this.CleanSpotTradesWebsocket = this.client.ws.trades(`${this.TradingPairWithSolidity.Symbol}`, trade => {
            this.MessagesSpotUpdatesQueue.push({ Message: trade, Type: "TradeUpdate" });
            if (!this.isProcessingSpotUpdate) {
                this.ProcessSpotUpdateQueue();
            }
        });
    }

    private ConfigureSpotBookDepthUpdate = () => {
        this.CleanSpotBookDepthWebsocket = this.client.ws.partialDepth(
            { symbol: `${this.TradingPairWithSolidity.Symbol}@100ms`, level: 20 },
            depth => {
                this.MessagesSpotUpdatesQueue.push({ Message: depth, Type: 'BookDepthUpdate' });
                if (!this.isProcessingSpotUpdate) {
                    this.ProcessSpotUpdateQueue();
                }
            });
    }

    private ProcessSpotUpdateQueue = async () => {
        if (this.isProcessingSpotUpdate) return;
        this.isProcessingSpotUpdate = true;

        try {
            while (this.MessagesSpotUpdatesQueue.length > 0) {
                const UpdateMessage = this.MessagesSpotUpdatesQueue.shift();
                if (UpdateMessage.Type === 'TradeUpdate') await this.ProcessSpotTrade(UpdateMessage.Message);
                else await this.ProcessSpotBookDepthUpdate(UpdateMessage.Message)
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with spot update | ${e.message}`,
                [dls], true, true);
        }

        this.isProcessingSpotUpdate = false;
    };

    private OpenTrade = async  () => {
        try {
            if (!this.Options.GeneralOptions.ScreenerMode) {
                this.TradeStatus = 'inTrade';
                this.SolidityStatus = 'removed';
                await this.OpenTradesManager.PlaceMarketOrder(this.SpotLastPrice, this.Options.TradingOptions.TradeOptions.NominalQuantity.toString(), this.QuantityPrecisionFutures);
                this.CleanSpotTradesWebsocket({delay: 0, fastClose: false, keepClosed: false});
                this.CleanSpotBookDepthWebsocket({delay: 0, fastClose: false, keepClosed: false});
            } else {
                this.CloseWatching();
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Error with placing orders! | ${e.message}`);
        }
    }

    private CloseWatching = () => {
        try {
            this.TradeStatus = 'disabled';
            this.SolidityStatus = 'removed';
            this.CleanSpotTradesWebsocket({delay: 500, fastClose: false, keepClosed: false});
            this.CleanSpotBookDepthWebsocket({delay: 500, fastClose: false, keepClosed: false});
            TradingPairsService.DeleteTPInTrade(this.Symbol);
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${this.TradingPairWithSolidity.Symbol} | Error with closing websockets! | ${e.message}`, [dls], true, true);
        }
    }

    private CheckForSharpBreakout = async () => {
        return this.Options.SolidityWatchingOptions.AllowSharpBreakout ?
            {
                access: true,
                priceChange: null
            } :
            await CandleAnalyzeService.CheckForAcceptableAveragePriceChange(
                this.TradingPairWithSolidity.Symbol,
                this.Options.SolidityWatchingOptions.AcceptablePriceChange.Period,
                this.Options.SolidityWatchingOptions.AcceptablePriceChange.PriceChange
            );
    }

    static CheckSolidity =
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
                const SolidityQuantityChange = Number(SolidityBid.quantity) / SolidityModel.Solidity.Quantity - 1;
                const SolidityQuantity =  Number(SolidityBid.quantity)

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
                    DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Trying to refresh solidity info on ${SolidityModel.Symbol}... (Quantity change: ${BinanceOrdersCalculatingKit.RoundUp(SolidityQuantityChange, 4)}, Up to price: ${BinanceOrdersCalculatingKit.ShowUptoPrice(UpToPriceSpot,  SolidityModel.Solidity.Type, 4)})`,
                        [ dls ], true, false);
                    const lastSolidity = await sfs.FindSolidity(SolidityModel.Symbol, OrderBook, LastPrice, QuoteVolume);

                    if (
                        lastSolidity.Solidity.Ratio >= SolidityFinderOptions.RatioAccess &&
                        lastSolidity.Solidity.UpToPrice >= SolidityFinderOptions.UpToPriceAccess &&
                        lastSolidity.Solidity?.Type === SolidityModel.Solidity.Type
                    ) {
                        if (lastSolidity.Solidity.Price === SolidityModel.Solidity.Price) {
                            SolidityStatus = 'ready';
                            DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Solidity on ${SolidityModel.Symbol} in ${SolidityModel.Solidity.Price} | Ratio: ${lastSolidity.Solidity.Ratio} | ${SolidityModel.Solidity.Quantity} -> ${SolidityQuantity}`,
                                [ dls ], true, false);
                            SolidityModel = lastSolidity;
                        } else {
                            const checkForReachingPrice =
                                SolidityFinderOptions.PriceUninterruptedDuration === 0 ? false :
                                    await CandleAnalyzeService.CheckPriceTouchingOnPeriod(SolidityModel.Symbol, lastSolidity.Price, SolidityFinderOptions.PriceUninterruptedDuration);
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
        const bidsToUpdate = new Map();
        const asksToUpdate = new Map();

        PartialBookDepth.bids.forEach(({ price, quantity }) => {
            bidsToUpdate.set(price, quantity);
        });

        PartialBookDepth.asks.forEach(({ price, quantity }) => {
            asksToUpdate.set(price, quantity);
        });

        OrderBook.bids = OrderBook.bids.filter(bid => {
            const quantity = bidsToUpdate.get(bid.price);
            if (quantity !== undefined) {
                if (Number(quantity) === 0) {
                    return false;
                } else {
                    bid.quantity = quantity;
                }
                bidsToUpdate.delete(bid.price);
            }
            return true;
        });

        OrderBook.asks = OrderBook.asks.filter(ask => {
            const quantity = asksToUpdate.get(ask.price);
            if (quantity !== undefined) {
                if (Number(quantity) === 0) {
                    return false;
                } else {
                    ask.quantity = quantity;
                }
                asksToUpdate.delete(ask.price);
            }
            return true;
        });

        bidsToUpdate.forEach((quantity, price) => {
            OrderBook.bids.push({ price, quantity });
        });

        asksToUpdate.forEach((quantity, price) => {
            OrderBook.asks.push({ price, quantity });
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
                        return Number(filter.tickSize);
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