import {Binance} from "binance-api-node";
import {TradeType} from "../BinanceTradesModels";
import {dls, tcs, tls} from "../../../index";
import {BinanceOrdersCalculatingKit} from "../BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {LimitType} from "../../SolidityFinderService/SolidityFinderModels";
import DocumentLogService from "../../DocumentLogService/DocumentLogService";
import {FontColor} from "../../FontStyleObjects";
import {TradeStatus} from "./OpenTradesManagerModels";
import {TradingOptionsModel} from "../../OptionsManager/OptionsModel";
import TradingPairsService from "../../TradingPairsListService/TradingPairsService";

export class OpenTradesManager {
    private client: Binance;

    private Symbol: string;
    private TradeType: TradeType;
    private LimitType: LimitType;
    private OrderQuantity: string;
    private OrderQuantityNominal: string;

    private TickSizeFutures: number;

    private OpenOrderPrice: number;
    private CloseOrderPrice: number;

    private TradeStopOptions: TradingOptionsModel;

    private MaxProfit: number;
    private MaxProfitPrice: number;

    private MarketOrderId: number;

    private StopLossCloseOrderFunc: () => Promise<void>;
    private StopLossStopLimitOrderId: number;
    private StopLossPrice: number;

    private TakeProfitCloseOrderFunc: () => Promise<void>;
    private TakeProfitActive: boolean = false;
    private TakeProfitPrice: number;
    private TakeProfitStopLimitOrderId: number;

    private Status: TradeStatus;

    constructor(client: Binance, Symbol: string, TradeStopOptions: TradingOptionsModel, TradeType: TradeType, TickSizeFutures: number) {
        this.client = client;
        this.Symbol = Symbol;
        this.TradeType = TradeType;
        this.LimitType = this.TradeType === 'long' ? 'asks' : 'bids';
        this.TickSizeFutures = TickSizeFutures;
        this.TradeStopOptions = TradeStopOptions;
        this.TakeProfitActive = this.TradeStopOptions.Stops.TakeProfit !== 0;
    }

    PlaceMarketOrder = async (LastPrice: number, OrderQuantityNominal: string, QuantityPrecisionFutures: number) => {
        try {
            this.OrderQuantityNominal = OrderQuantityNominal;

            this.OrderQuantity = BinanceOrdersCalculatingKit.RoundUp(parseFloat(this.OrderQuantityNominal) / LastPrice, QuantityPrecisionFutures).toString();

            const order = await this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'BUY' : 'SELL',
                type: "MARKET",
                quantity: this.OrderQuantity,
            })

            this.MarketOrderId = order.orderId;

            await new Promise(resolve => setTimeout(resolve, 300));

            const orderCheck = await this.client.futuresGetOrder({
                symbol: this.Symbol,
                orderId: this.MarketOrderId,
            });

            this.OpenOrderPrice = parseFloat(orderCheck.cumQuote) / parseFloat(orderCheck.executedQty);

            this.MaxProfitPrice = this.OpenOrderPrice;
            this.MaxProfitPrice = this.OpenOrderPrice;
            this.MaxProfit = 0;

            this.StopLossPrice = BinanceOrdersCalculatingKit.CalcPriceByRatio(this.MaxProfitPrice, this.TradeStopOptions.Stops.StopLoss.PercentValue / 100, this.LimitType, this.TickSizeFutures);
            if (this.TakeProfitActive) this.TakeProfitPrice = BinanceOrdersCalculatingKit.CalcPriceByRatio(this.OpenOrderPrice, this.TradeStopOptions.Stops.TakeProfit  / 100, this.LimitType === 'asks' ? 'bids' : 'asks', this.TickSizeFutures);
        } catch (e) {
            TradingPairsService.DeleteTPInTrade(this.Symbol);
            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `Error with placing open order! Nominal quantity: ${parseFloat(this.OrderQuantityNominal)} | Open order price: ${LastPrice} | Quantity Precision: ${QuantityPrecisionFutures} | Calculated quantity: ${this.OrderQuantity}`, [dls, tls], true);
            tcs.SendMessage(`${this.Symbol}\nError with placing order!\n${e.message}\nNominal quantity: ${parseFloat(OrderQuantityNominal)}\nOpen order price: ${LastPrice}\nQuantity Precision: ${QuantityPrecisionFutures}\nCalculated quantity: ${this.OrderQuantity}`);
            return;
        }

        try {
            this.StopLossCloseOrderFunc = await this.PlaceStopLossLimit();
            if (this.TakeProfitActive) this.TakeProfitCloseOrderFunc = await this.PlaceTakeProfitLimit();
        } catch (e) {
            await this.CloseOrder();
            TradingPairsService.DeleteTPInTrade(this.Symbol);
            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `Error with placing closing orders! Nominal quantity: ${parseFloat(this.OrderQuantityNominal)} | Open order price: ${LastPrice} | Quantity Precision: ${QuantityPrecisionFutures} | Calculated quantity: ${this.OrderQuantity}`, [dls, tls], true);
            tcs.SendMessage(`${this.Symbol}\nError with placing closing orders!\n${e.message}\nNominal quantity: ${parseFloat(OrderQuantityNominal)}\nOpen order price: ${LastPrice}\nQuantity Precision: ${QuantityPrecisionFutures}\nCalculated quantity: ${this.OrderQuantity}`);
        }

        const orderMsg = `${this.Symbol} | Order Type: ${this.TradeType} | Nominal Quantity: ${parseFloat(this.OrderQuantity) * this.OpenOrderPrice} | LP: ${this.OpenOrderPrice} | SL: ${this.StopLossPrice}`;
        const orderMsgTg = `${this.Symbol}\nOrder Type: ${this.TradeType}\nNominal Quantity: ${parseFloat(this.OrderQuantity) * this.OpenOrderPrice}\nLP: ${this.OpenOrderPrice}\nSL: ${this.StopLossPrice}`;

        this.Status = 'Active';
        tcs.SendMessage(orderMsgTg);
        DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], orderMsg, [dls, tls], true);

        this.WatchTheTrade();

        return this.OpenOrderPrice;
    }

    WatchTheTrade = async () => {
        try {
            const clean = await this.client.ws.futuresUser((event) => {
                if (this.Status === 'Closed') {
                    tcs.SendMessage(`${this.Symbol}\nFutures Trades Websocket is still getting messages!`);
                }

                if (
                    event.eventType === 'ORDER_TRADE_UPDATE' &&
                    event.orderId === this.StopLossStopLimitOrderId &&
                    event.orderId === this.TakeProfitStopLimitOrderId &&
                    event.orderStatus === 'FILLED'
                ) {
                    this.CloseOrderPrice = parseFloat(event.priceLastTrade);

                    const PercentageProfit = this.ShowProfit();

                    if (event.orderId === this.StopLossStopLimitOrderId && this.TakeProfitActive) {
                        this.TakeProfitCloseOrderFunc();
                    } else if (event.orderId === this.TakeProfitStopLimitOrderId) {
                        this.StopLossCloseOrderFunc();
                    }

                    DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${this.Symbol} | Order was closed! | Profit: ${BinanceOrdersCalculatingKit.RoundUp(PercentageProfit, 3)}%`, [ dls, tls ], true);
                    tcs.SendMessage(`${this.Symbol}\nOrder was closed!\nProfit: ${BinanceOrdersCalculatingKit.RoundUp(PercentageProfit, 3)}%`);
                    TradingPairsService.DeleteTPInTrade(this.Symbol);
                    this.Status = 'Closed';
                    clean({ delay: 0, fastClose: true, keepClosed: false });
                }
            })
        } catch (e) {
            // this.CloseOrder();
            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${this.Symbol} | Error with user data websocket connection! ${e.message}`, [dls, tls], true);
            tcs.SendMessage(`${this.Symbol}\nError with user data websocket connection!\n${e.message}`);
        }
    }

    private PlaceTakeProfitLimit = async () => {
        try {
            const { orderId } = await this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                type: 'LIMIT',
                price: this.TakeProfitPrice.toString(),
                quantity: this.OrderQuantity,
                timeInForce: 'GTC',
            });
            this.TakeProfitStopLimitOrderId = orderId;

            return async () => {
                await this.client.futuresCancelOrder({
                    symbol: this.Symbol,
                    orderId: this.TakeProfitStopLimitOrderId,
                });
            }
        } catch (e) {
            throw e;
        }
    }

    private PlaceStopLossLimit = async () => {
        const StopLossOptions = this.TradeStopOptions.Stops.StopLoss;

        try {
            const { orderId } = await this.client.futuresOrder(
                StopLossOptions.IsTrailing
                    ? {
                        symbol: this.Symbol,
                        side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                        type: 'TRAILING_STOP_MARKET',
                        callbackRate: (this.TradeStopOptions.Stops.StopLoss.PercentValue).toString(),
                        //@ts-ignore
                        quantity: this.OrderQuantity,
                    }
                    : {
                        symbol: this.Symbol,
                        side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                        type: 'STOP_MARKET',
                        stopPrice: this.StopLossPrice.toString(),
                        quantity: this.OrderQuantity,
                    }
            );
            this.StopLossStopLimitOrderId = orderId;

            return async () => {
                await this.client.futuresCancelOrder({
                    symbol: this.Symbol,
                    orderId: this.StopLossStopLimitOrderId,
                });
            }
        } catch (e) {
            throw e;
        }
    }

    CloseOrder = async () => {
        await this.client.futuresOrder({
            symbol: this.Symbol,
            side: this.TradeType === 'long' ? 'SELL' : 'BUY',
            type: "MARKET",
            quantity: this.OrderQuantity,
        });
    }

    ShowProfit = (): number => {
        let PercentageProfit: number;

        if (this.TradeType === 'long') {
            PercentageProfit = ((this.CloseOrderPrice - this.OpenOrderPrice) / this.OpenOrderPrice) * 100;
        } else {
            PercentageProfit = ((this.OpenOrderPrice - this.CloseOrderPrice) / this.OpenOrderPrice) * 100;
        }

        return PercentageProfit;
    }
}