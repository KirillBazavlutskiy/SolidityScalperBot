import fs from "fs";
import {ApiKeysModel} from "./ApiKeysServiceModels";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {FilesManager} from "../FilesManager/FilesMenager";

export class ApiKeysService {
    static ApiKeysFilePath = './Config/ApiKeys.json';
    static FetchApiKeys = () : ApiKeysModel => {
        const result = FilesManager.CheckAndCreateFiles(this.ApiKeysFilePath, "");
        if (result) {
            return FilesManager.ReadFile<ApiKeysModel>(this.ApiKeysFilePath);
        } else {
            DocumentLogService.MadeTheNewLog([FontColor.FgYellow], 'Api keys file missing! Screener mode is active!', [], true, false);
        }
    }
}