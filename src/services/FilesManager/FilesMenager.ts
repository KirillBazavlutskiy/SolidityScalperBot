import * as fs from 'fs';
import * as path from 'path';
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";

export class FilesManager {
    static CheckAndCreateFiles(FilePath: string, DefaultContent: any = ""): boolean{
        const directoryPath = path.dirname(FilePath);
        let isOk: boolean = true;

        try {
            fs.accessSync(directoryPath, fs.constants.F_OK);
        } catch (err) {
            isOk = false;
            if (err.code === 'ENOENT') {
                fs.mkdirSync(directoryPath, { recursive: true });
            }
        }
        try {
            fs.accessSync(FilePath, fs.constants.F_OK);
        } catch (err) {
            isOk = false;
            if (err.code === 'ENOENT') {
                fs.writeFileSync(FilePath, JSON.stringify(DefaultContent, null, 2));
            }
        }

        DocumentLogService.MadeTheNewLog([FontColor.FgYellow], `File on ${FilePath} is missing! New file was created!`);
        return isOk;
    }

    static ReadFile<T>(FilePath: string): T {
        const DataJson = fs.readFileSync(FilePath, 'utf-8');
        return JSON.parse(DataJson);
    }
}