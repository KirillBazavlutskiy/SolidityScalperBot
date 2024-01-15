import {DefaultOptionsValues, OptionsModel} from "./OptionsModel";
import fs from "fs";
import DocumentLogService from "../DocumentLogService/DocumentLogService";
import {FontColor} from "../FontStyleObjects";

export class OptionsManager {
    static OptionsFolderPath = './Config';
    static OptionsPath = './Config/Options.json';
    static GetOptions = (): OptionsModel => {
        this.CheckOptions();

        try {
            const OptionsJson = fs.readFileSync(this.OptionsPath, 'utf-8');
            const Options: OptionsModel = JSON.parse(OptionsJson);
            if (Options satisfies OptionsModel) {
                return Options;
            } else {
                DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with importing options! Trying to recreate files...`);
                fs.writeFileSync(this.OptionsPath, JSON.stringify(DefaultOptionsValues, null, 2));
                const OptionsJson = fs.readFileSync(this.OptionsPath, 'utf-8');
                return JSON.parse(OptionsJson);
            }
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with importing options! Trying to recreate files...`);
            this.CreateOptionsFiles();
            const OptionsJson = fs.readFileSync(this.OptionsPath, 'utf-8');
            return JSON.parse(OptionsJson);
        }
    }

    static CheckOptions = (): void => {
        if (!fs.existsSync(this.OptionsFolderPath)) {
            fs.mkdirSync(this.OptionsFolderPath);
        }
        if (!fs.existsSync(this.OptionsPath)) {
            fs.writeFileSync(this.OptionsPath, JSON.stringify(DefaultOptionsValues, null, 2));
        }
    }

    static CreateOptionsFiles = (Options?: OptionsModel) => {
        fs.mkdirSync(this.OptionsFolderPath);

        const OptionsJson = Options ?
            JSON.stringify(Options, null, 2) :
            JSON.stringify(DefaultOptionsValues, null, 2);

        fs.writeFileSync(this.OptionsPath, JSON.stringify(OptionsJson, null, 2));
    }

    static ChangeOptions = (Options: OptionsModel) => {
        try {
            fs.writeFileSync(this.OptionsPath, JSON.stringify(Options, null, 2));
        } catch (e) {
            DocumentLogService.MadeTheNewLog([FontColor.FgRed], `Error with changing options! Trying to recreate files...`);
            this.CreateOptionsFiles(Options);
        }
    }
}