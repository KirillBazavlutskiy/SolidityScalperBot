"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tls = exports.dls = exports.sfs = exports.solidityFinderParams = void 0;
const binance_api_node_1 = __importDefault(require("binance-api-node"));
const SolidityFinderService_1 = __importDefault(require("./services/SolidityFinderService/SolidityFinderService"));
const TradingPairsService_1 = __importDefault(require("./services/TradingPairsListService/TradingPairsService"));
const BinanceTradesService_1 = require("./services/BinanceTradesService/BinanceTradesService");
const DocumentLogService_1 = __importStar(require("./services/DocumentLogService/DocumentLogService"));
const apiKey = "PmEpiESene4CCbHpmjHO8Uz7hKqc9u57bEla9ibkP14ZmXIdtf8QAsqBcFt15YKB";
const secretKey = "5f97dmaPN48kNXYmcdEBtNKRwopfsaDWogJ9btKE1gCAIKO4z0q2IhLb4m1MfKxE";
// const soundFilePath = './dist/sounds/notification-sound.mp3';
//
// const speaker = new Speaker({
//     channels: 2,
//     bitDepth: 16,
//     sampleRate: 44100
// });
//
// const audioFileStream = fs.createReadStream(soundFilePath);
// export const PlaySound = () => {
//     audioFileStream.pipe(speaker);
// }
const client = (0, binance_api_node_1.default)({
    apiKey: apiKey,
    apiSecret: secretKey,
    getTime: () => new Date().getTime(),
});
exports.solidityFinderParams = {
    minVolume: 50000,
    ratioAccess: 20,
    upToPriceAccess: 0.015,
};
exports.sfs = new SolidityFinderService_1.default(client);
const bts = new BinanceTradesService_1.BinanceTradesService(client);
exports.dls = new DocumentLogService_1.DocumentLogger('./Logs/Logs.txt');
exports.tls = new DocumentLogService_1.DocumentLogger('./Logs/TradeLogs.txt');
const fetchSolidity = async () => {
    // PlaySound();
    TradingPairsService_1.default.TPWithSolidity = await exports.sfs.FindAllSolidity(exports.solidityFinderParams.minVolume, exports.solidityFinderParams.ratioAccess, exports.solidityFinderParams.upToPriceAccess);
    DocumentLogService_1.default.MadeTheNewLog(`Found solidity: ${TradingPairsService_1.default.TPWithSolidity.length}`, [exports.dls]);
    TradingPairsService_1.default.TPWithSolidity.forEach(tp => { if (!TradingPairsService_1.default.CheckTPInTrade(tp.symbol, true))
        bts.TradeSymbol(tp); });
};
fetchSolidity();
setInterval(async () => {
    await fetchSolidity();
}, 60000);
//# sourceMappingURL=index.js.map