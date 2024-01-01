import {Binance} from "binance-api-node";
import {TradeType} from "../BinanceTradesModels";
import {dls, tcs, tls, GetTradeStopsOptions} from "../../../index";
import {BinanceOrdersCalculatingKit} from "../BinanceOrdersCalculatingKit/BinanceOrdersCalculatingKit";
import {LimitType} from "../../SolidityFinderService/SolidityFinderModels";
import DocumentLogService from "../../DocumentLogService/DocumentLogService";
import {FontColor} from "../../FontStyleObjects";
import {TradingStopOptions} from "../../../../Options/TradeStopsOptions/TradeStopsOptionsModels";
import {TradeStatus, UpdateLastPriceOutput} from "./OpenTradesManagerModels";

export class OpenTradesManager {
    private client: Binance;

    private Symbol: string;
    private TradeType: TradeType;
    private LimitType: LimitType;
    private OrderQuantity: string;
    private OrderQuantityNominal: string;

    private TickSizeFutures: number;

    private OpenOrderPrice: number;
    private TradeStopOptions: TradingStopOptions;

    private CurrentProfit: number;
    private MaxProfit: number;
    private MaxProfitPrice: number;

    private MarketOrderId: number;
    private StopLossStopLimitOrderId: number;

    private StopLossPrice: number;

    private Status: TradeStatus;

    constructor(client: Binance, Symbol: string, TradeStopOptions: TradingStopOptions, TradeType: TradeType, TickSizeFutures: number) {
        this.client = client;
        this.Symbol = Symbol;
        this.TradeType = TradeType;
        this.LimitType = this.TradeType === 'long' ? 'asks' : 'bids';
        this.TickSizeFutures = TickSizeFutures;
        this.TradeStopOptions = TradeStopOptions;
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

            await new Promise(resolve => setTimeout(resolve, 150));

            await this.PlaceStopLossLimit();

            const orderCheck = await this.client.futuresGetOrder({
                symbol: this.Symbol,
                orderId: this.MarketOrderId,
            });

            this.OpenOrderPrice = parseFloat(orderCheck.cumQuote) / parseFloat(orderCheck.executedQty);
            this.MaxProfitPrice = this.OpenOrderPrice;
            this.MaxProfitPrice = this.OpenOrderPrice;
            this.MaxProfit = 0;

            this.StopLossPrice = BinanceOrdersCalculatingKit.CalcPriceByRatio(this.MaxProfitPrice, this.TradeStopOptions.Stops.TrailingStopLoss, this.LimitType, this.TickSizeFutures);
            // await this.PlaceTakeProfitLimit();

            const orderMsg = `${this.Symbol} | Order Type: ${this.TradeType} | Nominal Quantity: ${parseFloat(this.OrderQuantity) * this.OpenOrderPrice} | LP: ${this.OpenOrderPrice} | SL: ${this.StopLossPrice}`;
            const orderMsgTg = `${this.Symbol}\nOrder Type: ${this.TradeType}\nNominal Quantity: ${parseFloat(this.OrderQuantity) * this.OpenOrderPrice}\nLP: ${this.OpenOrderPrice}\nSL: ${this.StopLossPrice}`;

            tcs.SendMessage(orderMsgTg);
            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], orderMsg, [dls, tls], true);
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `Error with placing order! Nominal quantity: ${parseFloat(this.OrderQuantityNominal)} | Open order price: ${LastPrice} | Quantity Precision: ${QuantityPrecisionFutures} | Calculated quantity: ${this.OrderQuantity}`, [dls, tls], true);
            tcs.SendMessage(`${this.Symbol}\nError with placing order!\nNominal quantity: ${parseFloat(OrderQuantityNominal)}\nOpen order price: ${LastPrice}\nQuantity Precision: ${QuantityPrecisionFutures}\nCalculated quantity: ${this.OrderQuantity}`);
        }

        return this.OpenOrderPrice
    }

    UpdateLastPrice = (price: number): UpdateLastPriceOutput => {
        try {
            const CurrentProfit = OpenTradesManager.ShowProfit(this.OpenOrderPrice / price, this.TradeType);
            this.CurrentProfit = CurrentProfit;

            if (BinanceOrdersCalculatingKit.CheckReachingPrice(price, this.StopLossPrice, this.TradeType)) {
                this.Status = 'Closed';
            }

            if (CurrentProfit > this.MaxProfit) {
                this.MaxProfit = CurrentProfit;
                this.MaxProfitPrice = price;
                this.StopLossPrice = BinanceOrdersCalculatingKit.CalcPriceByRatio(this.MaxProfitPrice, this.TradeStopOptions.Stops.TrailingStopLoss, this.LimitType, this.TickSizeFutures);
            }
        } catch (e) {
            throw e;
        }

        return {
            TradeStatus: this.Status,
            CurrentProfit: this.CurrentProfit,
        };
    }

    private PlaceStopLossLimit = async () => {
        try {
            const { orderId } = await this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                type: 'TRAILING_STOP_MARKET',
                callbackRate: (this.TradeStopOptions.Stops.TrailingStopLoss * 100).toString(),
                // @ts-ignore
                quantity: this.OrderQuantity
            });
            this.StopLossStopLimitOrderId = orderId;
        } catch (e) {
            await this.client.futuresOrder({
            symbol: this.Symbol,
            side: this.TradeType === 'long' ? 'SELL' : 'BUY',
            type: "MARKET",
            quantity: this.OrderQuantity,
            });
            throw e;
        }
    }


    static ShowProfit = (UpToPrice: number, TradeType?: TradeType) => {
        return BinanceOrdersCalculatingKit.RoundUp(BinanceOrdersCalculatingKit.CalcSimplifiedRatio(UpToPrice, TradeType === 'long' ? 'asks' : 'bids') * 100, 5);
    }
}