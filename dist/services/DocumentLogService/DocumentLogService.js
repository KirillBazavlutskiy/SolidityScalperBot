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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentLogger = void 0;
const fs = __importStar(require("fs"));
class DocumentLogger {
    constructor(path) {
        this.WriteLine = (newLine) => {
            const lines = fs.readFileSync(this.documentPath, 'utf-8');
            const newLines = `${lines}\n${newLine}`;
            fs.writeFileSync(this.documentPath, newLines);
        };
        this.ClearFile = () => {
            fs.writeFileSync(this.documentPath, '');
        };
        this.documentPath = path;
    }
}
exports.DocumentLogger = DocumentLogger;
class DocumentLogService {
}
DocumentLogService.MadeTheNewLog = (newLine, writeInDocuments = [], showInConsole = false) => {
    const date = new Date();
    let strDate = date.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const newLogLine = `${strDate} | ${newLine}`;
    if (showInConsole)
        console.log(`${strDate} | ${newLine}`);
    writeInDocuments.forEach(document => document.WriteLine(newLogLine));
};
exports.default = DocumentLogService;
//# sourceMappingURL=DocumentLogService.js.map