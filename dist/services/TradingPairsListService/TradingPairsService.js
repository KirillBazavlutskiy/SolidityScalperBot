"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
class TradingPairsService {
}
_a = TradingPairsService;
TradingPairsService.TPWithSolidity = [];
TradingPairsService.TPWithSolidityInTrade = [];
TradingPairsService.LogTPWithSolidity = () => {
    _a.TPWithSolidity.forEach(solidityModel => {
        console.log(`Symbol: ${solidityModel.symbol}\tLast Price: ${solidityModel.price}\n` +
            'Solidity:\n' +
            `Limit Type: ${solidityModel.solidity.type}\tLimit price: ${solidityModel.solidity.price}\tLimit Volume: ${solidityModel.solidity.quantity}\n` +
            `Solidity Ratio: ${solidityModel.solidity.ratio.toFixed(3)}\tUp to price: ${(solidityModel.solidity.upToPrice * 100).toFixed(2)}%\n`);
    });
};
TradingPairsService.AddTPInTrade = (symbol) => _a.TPWithSolidityInTrade.push(symbol);
TradingPairsService.DeleteTPInTrade = (symbol) => {
    _a.TPWithSolidityInTrade = _a.TPWithSolidityInTrade.filter(e => e !== symbol);
};
TradingPairsService.CheckTPInTrade = (symbol, addToList = false) => {
    if (!_a.TPWithSolidityInTrade.includes(symbol)) {
        if (addToList)
            _a.AddTPInTrade(symbol);
        return false;
    }
    else {
        return true;
    }
};
exports.default = TradingPairsService;
//# sourceMappingURL=TradingPairsService.js.map