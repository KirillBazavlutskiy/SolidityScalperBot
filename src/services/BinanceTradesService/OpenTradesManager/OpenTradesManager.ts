import {Binance} from "binance-api-node";
import {CalcTPSLOutput, CheckTPSLOutput, TradeType} from "../BinanceTradesModels";
import {dls, tcs, tls, TradeStopsOptions} from "../../../index";
import {RatioCalculatingKit} from "../RatioCalculatingKit/RatioCalculatingKit";
import {LimitType} from "../../SolidityFinderService/SolidityFinderModels";
import {BinanceTradesService} from "../BinanceTradesService";
import DocumentLogService from "../../DocumentLogService/DocumentLogService";
import {FontColor} from "../../FontStyleObjects";

export class OpenTradesManager {
    private client: Binance;

    private Symbol: string;
    private TradeType: TradeType;
    private LimitType: LimitType;
    private OrderQuantity: string;

    private TickSizeFutures: number;

    private OpenOrderPrice: number;
    private TPSL: CalcTPSLOutput;
    private StopLossBreakpoint: number;

    private MarketOrderId: number;
    private StopLossStopLimitOrderId: number;
    private TakeProfitStopLimitOrderId: number;

    constructor(client: Binance, Symbol: string, TradeType: TradeType, TickSizeFutures: number) {
        this.client = client;

        this.Symbol = Symbol;
        this.TradeType = TradeType;
        this.LimitType = this.TradeType === 'long' ? 'asks' : 'bids';
        this.TickSizeFutures = TickSizeFutures;
    }

    PlaceMarketOrder = async (OrderQuantity: string) => {
        this.OrderQuantity = OrderQuantity;

        const order = await this.client.futuresOrder({
            symbol: this.Symbol,
            side: this.TradeType === 'long' ? 'BUY' : 'SELL',
            type: "MARKET",
            quantity: this.OrderQuantity,
        })

        this.MarketOrderId = order.orderId;

        await new Promise(resolve => setTimeout(resolve, 150));

        const orderCheck = await this.client.futuresGetOrder({
            symbol: this.Symbol,
            orderId: this.MarketOrderId,
        });

        this.OpenOrderPrice = parseFloat(orderCheck.cumQuote) / parseFloat(orderCheck.executedQty);

        this.TPSL = this.CalcTPSL(this.OpenOrderPrice, this.LimitType, TradeStopsOptions.TakeProfit, TradeStopsOptions.StopLoss, this.TickSizeFutures);
        this.StopLossBreakpoint = BinanceTradesService.FindClosestLimitOrder(this.OpenOrderPrice / RatioCalculatingKit.CalcRealRatio(0.006, this.LimitType), this.TickSizeFutures);

        const orderMsg = `${this.Symbol} | Order Type: ${this.TradeType} | Nominal Quantity: ${parseFloat(this.OrderQuantity) / this.OpenOrderPrice} | TP: ${this.TPSL.TakeProfit} | LP: ${this.OpenOrderPrice} | SL: ${this.TPSL.StopLoss}`;

        tcs.SendMessage(orderMsg.replace(' | ', '\n'));
        DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], orderMsg, [dls, tls], true);

        try {
            await this.PlaceTakeProfitLimit();
            await this.PlaceStopLossLimit();
        } catch (e) {
            throw e;
        }
    }

    UpdateLastPrice = (price: number) => {
        const status = this.CheckTPSL(price);
        if (status === "InTrade") {
            const TrailingStopLossPosition = price - this.StopLossBreakpoint;
            if (TrailingStopLossPosition > 0 && this.TradeType === 'long') {
                this.StopLossBreakpoint += TrailingStopLossPosition;
                this.TPSL.StopLoss += TrailingStopLossPosition;
                this.PlaceStopLossLimit();
            } else if (TrailingStopLossPosition < 0 && this.TradeType === 'short') {
                this.StopLossBreakpoint += TrailingStopLossPosition;
                this.TPSL.StopLoss += TrailingStopLossPosition;
                this.PlaceStopLossLimit();
            }
        } else {
            setTimeout(() => { this.client.futuresCancelAllOpenOrders({ symbol: this.Symbol }) }, 200);
        }

        return status;
    }
    private PlaceTakeProfitLimit = async () => {
        try {
            const { orderId } = await this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                type: 'LIMIT',
                price: this.TPSL.TakeProfit.toString(),
                quantity: this.OrderQuantity,
                timeInForce: 'GTC',
            });
            this.TakeProfitStopLimitOrderId = orderId;
        } catch (e) {
            this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                type: 'MARKET',
                quantity: this.OrderQuantity,
            });
            throw e;
        }
    }

    private PlaceStopLossLimit = async () => {
        if (this.StopLossStopLimitOrderId !== undefined) {
            await this.client.futuresCancelOrder({
                symbol: this.Symbol,
                orderId: this.StopLossStopLimitOrderId,
            })
        }

        try {
            const { orderId } = await this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                type: 'STOP_MARKET',
                stopPrice: this.TPSL.StopLoss.toString(),
                quantity: this.OrderQuantity,
            });
            this.StopLossStopLimitOrderId = orderId;
        } catch (e) {
            this.client.futuresOrder({
                symbol: this.Symbol,
                side: this.TradeType === 'long' ? 'SELL' : 'BUY',
                type: 'MARKET',
                quantity: this.OrderQuantity,
            });
            throw e;
        }
    }

    private CalcTPSL = (currentPrice: number, limitType: LimitType, upToPriceTP: number, upToPriceSL: number, tickSize: number): CalcTPSLOutput => {
        let currentUpToPriceTP: number = RatioCalculatingKit.CalcRealRatio(upToPriceTP, limitType === 'asks' ? 'bids' : 'asks');
        let currentUpToPriceSL: number = RatioCalculatingKit.CalcRealRatio(upToPriceSL, limitType);

        let currentTakeProfit: number = currentPrice * currentUpToPriceTP;
        let currentStopLoss: number = currentPrice * currentUpToPriceSL;

        const fixedTakeProfit = BinanceTradesService.FindClosestLimitOrder(currentTakeProfit, tickSize);
        const fixedStopLoss = BinanceTradesService.FindClosestLimitOrder(currentStopLoss, tickSize);

        return {
            TakeProfit: fixedTakeProfit,
            StopLoss: fixedStopLoss,
        }
    }

    private CheckTPSL = (currentPrice: number): CheckTPSLOutput => {
        let result: CheckTPSLOutput;
        if (this.TradeType === 'long') {
            if (currentPrice >= this.TPSL.TakeProfit) result = 'TP';
            else if (currentPrice <= this.TPSL.StopLoss) result = 'SL';
            else result = 'InTrade';
        } else {
            if (currentPrice <= this.TPSL.TakeProfit) result = 'TP';
            else if (currentPrice >= this.TPSL.StopLoss) result = 'SL';
            else result = 'InTrade';
        }
        return result;
    }
}