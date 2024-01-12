import fs from "fs";
import {ApiKeysModel} from "./ApiKeysServiceModels";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {DefaultOptionsValues} from "../OptionsManager/OptionsModel";

export class ApiKeysService {
    static ApiKeysFilePath = './Config/ApiKeys.json';
    static FetchApiKeys = () : ApiKeysModel => {
        try {
            const keysJson = fs.readFileSync(this.ApiKeysFilePath, 'utf-8');
            return JSON.parse(keysJson);
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgYellow], 'Api keys file missing! Screener mode is active!', [], true, false);
        }
    }
}