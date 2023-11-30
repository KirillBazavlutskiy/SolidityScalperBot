import {Bid, Binance, ExchangeInfo, FuturesOrderType_LT, OrderBook, OrderType_LT, WSTrade} from "binance-api-node";
import {SolidityModel, LimitType} from "../SolidityFinderService/SolidityFinderModels";
import TradingPairsService from "../TradingPairsListService/TradingPairsService";
import {dls, sfs, solidityFinderParams, tls} from "../../index";
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


export class BinanceTradesService {
    client: Binance;
    constructor(client: Binance) {
        this.client = client;
    }

    TradeSymbol = async (solidityModel: SolidityModel): Promise<void> => {
        const exchangeInfoSpot = await this.client.exchangeInfo();
        const exchangeInfoFutures = await this.client.futuresExchangeInfo();

        let tickSizeSpot: number = this.FetchTickSize(exchangeInfoSpot, solidityModel.symbol);
        let tickSizeFutures: number = this.FetchTickSize(exchangeInfoFutures, solidityModel.symbol);

        const UP_TO_PRICE_ACCESS_SPOT_THRESHOLD: number = solidityFinderParams.upToPriceAccess + 0.01;
        const UP_TO_PRICE_ACCESS_FUTURES_THRESHOLD: number = solidityFinderParams.upToPriceAccess - 0.01;

        let OpenOrderPrice;

        let UpToPriceSpot: number = solidityModel.solidity.upToPrice;

        let solidityStatus: SolidityStatus;

        let futuresLastPrice: number;
        let futuresWebsocketLastTradeTime: Date;

        let TradeStatus: TradeStatus = 'watching';
        let TPSL: CalcTPSLOutput;

        let minPriceFuturesInTrade = Number.MAX_VALUE;
        let maxPriceFuturesInTrade = Number.MIN_VALUE;

        DocumentLogService.MadeTheNewLog(
            [FontColor.FgGreen], `New Solidity on ${solidityModel.symbol} | Solidity Price: ${solidityModel.solidity.price} | Solidity Ratio: ${solidityModel.solidity.ratio} | Up To Price: ${solidityModel.solidity.upToPrice} | Last Price: ${solidityModel.price}`,
            [ dls ], true);

        const WebSocketSpot: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.symbol.toLowerCase()}@trade`);
        const WebSocketFutures: WebSocket = new WebSocket(`wss://fstream.binance.com/ws/${solidityModel.symbol.toLowerCase()}@trade`);
        const WebSocketSpotBookDepth: WebSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${solidityModel.symbol.toLowerCase()}@depth`)

        WebSocketSpot.on('message', async (data: Buffer) => {
            try {
                const processStartData = new Date();
                const strData = data.toString();
                const trade = JSON.parse(strData);

                const SpotLastPrice = parseFloat(trade.p);
                UpToPriceSpot = SpotLastPrice / solidityModel.solidity.price;
                solidityModel.solidity.upToPrice = UpToPriceSpot;
                TradingPairsService.ChangeTPInTrade(solidityModel);

                switch (TradeStatus) {
                    case "watching":
                        if (UpToPriceSpot === 1) {
                            if (solidityStatus === 'ready') {
                                const processEndData = new Date();
                                const processTime = new Date(processEndData.getTime() - processStartData.getTime());
                                TradeStatus = 'reached';

                                OpenOrderPrice = solidityModel.solidity.type === 'asks'
                                    ? solidityModel.solidity.price + tickSizeSpot
                                    : solidityModel.solidity.price - tickSizeSpot;

                                DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `${solidityModel.symbol} | Solidity on ${solidityModel.solidity.price} was reached! Waiting for price ${OpenOrderPrice} | Process Time: ${processTime.getSeconds()}s`, [ dls, tls ], true);
                                beep();
                            }
                        } else if ((UpToPriceSpot > 1 && solidityModel.solidity.type === 'asks') || (UpToPriceSpot < 1 && solidityModel.solidity.type === 'bids')) {
                            TradeStatus = 'disabled';
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.symbol} Solidity on ${solidityModel.solidity.price} has been removed! | Up to price: ${UpToPriceSpot} | Last Price: ${SpotLastPrice}`, [ dls ], true);
                        } else if (sfs.CalcRatio(UpToPriceSpot) > UP_TO_PRICE_ACCESS_SPOT_THRESHOLD) {
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.symbol} is too far! Up to price: ${UpToPriceSpot}`, [ dls ], true);
                        } else {
                            TradingPairsService.LogTradingPairs();
                        }
                        break;
                    case "reached":
                        solidityStatus = 'removed';
                        DocumentLogService.MadeTheNewLog([FontColor.FgWhite], `${solidityModel.symbol} | Up to price: ${SpotLastPrice / solidityModel.solidity.price} | Spot Last Price: ${SpotLastPrice} | Futures Last Price: ${futuresLastPrice}`, [], true);

                        if ((SpotLastPrice >= OpenOrderPrice && solidityModel.solidity.type === 'asks') || (SpotLastPrice <= OpenOrderPrice && solidityModel.solidity.type === 'bids')) {
                            TPSL = this.CalcTPSL(futuresLastPrice, solidityModel.solidity.type, 0.01, 0.003, tickSizeFutures);
                            const currentTime = new Date();
                            const futuresWebsocketFreezeTime: Date = new Date(currentTime.getTime() - futuresWebsocketLastTradeTime.getTime());

                            TradeStatus = 'inTrade';
                            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${solidityModel.symbol} | Order Type: ${solidityModel.solidity.type === 'asks' ? 'long' : 'short'} | TP: ${TPSL.TakeProfit} LP: ${futuresLastPrice} SL: ${TPSL.StopLoss} | Futures Websocket Freeze Time: ${futuresWebsocketFreezeTime.getSeconds()}s`, [ dls, tls ], true);
                        } else if (sfs.CalcRatio(UpToPriceSpot) > UP_TO_PRICE_ACCESS_FUTURES_THRESHOLD) {
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.symbol} is too far!`, [ dls ], true);
                        }
                        break;
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot websocket with ${solidityModel.symbol}! ${e.message}`);
            }
        });

        const tradeType: TradeType = solidityModel.solidity.type === 'asks' ? 'long' : 'short';

        WebSocketFutures.on('message', (data) => {
            try {
                const strData = data.toString();
                const trade = JSON.parse(strData);
                futuresLastPrice = parseFloat(trade.p);
                futuresWebsocketLastTradeTime = new Date();

                if (TradeStatus === 'inTrade') {
                    if (futuresLastPrice > maxPriceFuturesInTrade) maxPriceFuturesInTrade = futuresLastPrice;
                    else if (futuresLastPrice < minPriceFuturesInTrade) minPriceFuturesInTrade = futuresLastPrice;

                    const status = this.CheckTPSL(futuresLastPrice, TPSL.TakeProfit, TPSL.StopLoss, tradeType);
                    switch (status) {
                        case "TP":
                            TradeStatus = 'disabled';
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgMagenta], `${solidityModel.symbol} | Take Profit price has been reached on price ${futuresLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [ dls, tls ], true);
                            break;
                        case "SL":
                            TradeStatus = 'disabled';
                            WebSocketSpot.close();
                            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.symbol} | Stop Loss price has been reached on price ${futuresLastPrice} | Max price: ${maxPriceFuturesInTrade} | Min Price: ${minPriceFuturesInTrade}`, [ dls, tls ], true);
                            break;
                    }
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in futures websocket with ${solidityModel.symbol}! ${e.message}`);
            }
        });

        WebSocketSpotBookDepth.on('message', async (data) => {
            try {
                const strData = data.toString();
                const parsedData = JSON.parse(strData);
                const Bids: StreamBid[] = parsedData[solidityModel.solidity.type === 'asks' ? 'a' : 'b'];

                const solidityChangeIndex = Bids.findIndex(bid => bid[0] == solidityModel.solidity.price);

                // DocumentLogService.MadeTheNewLog([FontColor.FgGray], ${solidityModel.symbol} | New book depth has been arrived, [], true);

                if (solidityChangeIndex !== -1 && solidityStatus !== 'removed' && TradeStatus !== 'inTrade') {
                    const SolidityBid = Bids[solidityChangeIndex];
                    DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `Solidity quantity on ${solidityModel.symbol} was changed to ${SolidityBid[1]}`, [ dls ], true);
                    solidityStatus = await this.CheckSolidity(solidityModel, SolidityBid, UpToPriceSpot);
                    if (solidityStatus === 'removed') {
                        WebSocketSpot.close();
                    }
                }
            } catch (e) {
                DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Error in spot depth websocket with ${solidityModel.symbol}! ${e.message}`);
            }
        })

        setTimeout(() => {
            if (futuresLastPrice === undefined) {
                WebSocketSpot.close();
                DocumentLogService.MadeTheNewLog([FontColor.FgGray], `${solidityModel.symbol} is out of websocket connection! Not on futures!`, [ dls ], true);
            }
        }, 60000);

        WebSocketSpot.on('close', () => {
            WebSocketSpotBookDepth.close();
            WebSocketFutures.close();
            TradeStatus = 'disabled';
            TradingPairsService.DeleteTPInTrade(solidityModel.symbol);
            DocumentLogService.MadeTheNewLog([FontColor.FgGray], `Websockets on ${solidityModel.symbol} has been disabled!`, [ dls ], true);
        });
    };

    CheckSolidity = async (solidityModel: SolidityModel, SolidityBid: StreamBid, UpToPriceSpot: number): Promise<SolidityStatus> => {
        const SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD: number = 0.15;

        let SolidityStatus: SolidityStatus;

        if (sfs.CalcRatio(solidityModel.solidity.quantity / SolidityBid[1]) < SOLIDITY_CHANGE_PER_UPDATE_THRESHOLD) {
            solidityModel.solidity.quantity = SolidityBid[1];
            SolidityStatus = 'ready';
        } else if (UpToPriceSpot === 1) {
            solidityModel.solidity.quantity = SolidityBid[1];
            SolidityStatus = 'ready';
        } else {
            DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Trying to refresh solidity info on ${solidityModel.symbol}...`, [ dls ], true);
            const lastSolidity = await sfs.FindSolidity(solidityModel.symbol, solidityFinderParams.ratioAccess, solidityFinderParams.upToPriceAccess);

            if (lastSolidity.solidity?.type === solidityModel.solidity.type) {
                if (lastSolidity.solidity.price === solidityModel.solidity.price) {
                    SolidityStatus = 'ready';
                    solidityModel = lastSolidity;
                    DocumentLogService.MadeTheNewLog([FontColor.FgCyan], `Solidity on ${solidityModel.symbol} in ${solidityModel.solidity.price}!`, [ dls ], true);
                } else {
                    SolidityStatus = 'moved';
                    solidityModel = lastSolidity;
                    DocumentLogService.MadeTheNewLog([FontColor.FgBlue], `Solidity on ${solidityModel.symbol} has been moved to ${solidityModel.solidity.price} | Ratio: ${solidityModel.solidity.ratio}!`, [ dls ], true);
                }
            } else {
                SolidityStatus = 'removed';
                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `${solidityModel.symbol} Solidity on ${solidityModel.solidity.price} has been removed. The quantity on ${SolidityBid[0]} is ${SolidityBid[1]}!`, [ dls ], true);
            }
        }

        TradingPairsService.ChangeTPInTrade(solidityModel);
        return SolidityStatus;
    }


    CalcTPSL = (currentPrice: number, limitType: LimitType, upToPriceTP: number, upToPriceSL: number, tickSize: number): CalcTPSLOutput => {
        let currentUpToPriceTP: number = sfs.CalcRealRatio(upToPriceTP, limitType === 'asks' ? 'bids' : 'asks');
        let currentUpToPriceSL: number = sfs.CalcRealRatio(upToPriceSL, limitType);

        let currentTakeProfit: number = currentPrice * currentUpToPriceTP;
        let currentStopLoss: number = currentPrice * currentUpToPriceSL;

        const fixedTakeProfit = this.FindClosestLimitOrder(currentTakeProfit, tickSize);
        const fixedStopLoss = this.FindClosestLimitOrder(currentStopLoss, tickSize);

        return {
            TakeProfit: fixedTakeProfit,
            StopLoss: fixedStopLoss,
        }
    }

    CheckTPSL = (currentPrice: number, tpPrice: number, slPrice: number, tradeType: TradeType): CheckTPSLOutput => {
        let result: CheckTPSLOutput;
        if (tradeType === 'long') {
            if (currentPrice >= tpPrice) result = 'TP';
            else if (currentPrice <= slPrice) result = 'SL';
            else result = 'InTrade';
        } else {
            if (currentPrice <= tpPrice) result = 'TP';
            else if (currentPrice >= slPrice) result = 'SL';
            else result = 'InTrade';
        }
        return result;
    }

    FetchTickSize = (exchangeInfo: ExchangeInfo<OrderType_LT> | ExchangeInfo<FuturesOrderType_LT>, symbol: string): number => {
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

    FindClosestLimitOrder = (price: number, tickSize: number): number => {
        const numIndex = tickSize.toString().lastIndexOf('1');
        const floatLenght = numIndex === 0 ? 0 : numIndex - 1;
        return parseFloat(price.toFixed(floatLenght));
    }
}
