import * as fs from "fs";

export class DocumentLogger {
    documentPath: string;

    constructor(path: string) {
        this.documentPath = path;
    }

    WriteLine = (newLine: string) => {
        const lines = fs.readFileSync(this.documentPath, 'utf-8');
        const newLines = `${lines}\n${newLine}`;
        fs.writeFileSync(this.documentPath, newLines);
    }

    ClearFile = () => {
        fs.writeFileSync(this.documentPath, '')
    }
}

export default class DocumentLogService {
     static MadeTheNewLog = (style: string[], newLine: string, writeInDocuments: DocumentLogger[] = [], showInConsole: boolean = false) => {
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

        if (showInConsole) console.log(style.join('%s'), `${strDate} | ${newLine}`);
        writeInDocuments.forEach(document => document.WriteLine(newLogLine))
    }
}
