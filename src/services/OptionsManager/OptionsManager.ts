import {DefaultOptionsValues, OptionsModel} from "./OptionsModel";
import fs from "fs";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";
import {FilesManager} from "../FilesManager/FilesMenager";

export class OptionsManager {
    static OptionsPath = './Config/Options.json';

    static GetOptions = (): OptionsModel => {
        this.CheckOptions();
        return  FilesManager.ReadFile<OptionsModel>(this.OptionsPath);
    }

    static CheckOptions = () => {
        FilesManager.CheckAndCreateFiles(this.OptionsPath, DefaultOptionsValues);
    }

    static ChangeOptions = (Options: OptionsModel) => {
        fs.writeFileSync(this.OptionsPath, JSON.stringify(Options, null, 2));
    }
}