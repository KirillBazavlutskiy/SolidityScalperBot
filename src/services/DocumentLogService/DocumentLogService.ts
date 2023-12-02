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
    static ShowTime = (DateTime?: number) => {
        let date: Date;
        if (DateTime) date = new Date(DateTime);
        else date = new Date();

        let strDate = date.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
        strDate += ':' + milliseconds;

        return strDate;
    }

     static MadeTheNewLog = (style: string[], newLine: string, writeInDocuments: DocumentLogger[] = [], showInConsole: boolean = false) => {
        const newLogLine = `${this.ShowTime()} | ${newLine}`;

        if (showInConsole) console.log(style.join('%s'), `${newLogLine}`);
        writeInDocuments.forEach(document => document.WriteLine(newLogLine))
    }
}
