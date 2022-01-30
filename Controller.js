import SerialPort from "serialport";
import SerialParser from "@serialport/parser-readline"

class Controller {
    constructor(config) {
        this.config = config;

        this.serial = null;
        this.awaitingResponse = {};
    }

    connect() {
        const { port = "/dev/ttyUSB0", baud = 115200 } = this.config;

        return new Promise((resolve, reject) => {
            this.serial = new SerialPort(port, {
                baudRate: baud
            }, err => {
                if (err) {
                    reject(err);
                    this.serial = null;
                    return;
                }
                
                const parser = new SerialParser();
                this.serial.pipe(parser);

                parser.on("data", line => this.parseSerial(line));
                
                resolve();
            });
        });
    }

    parseSerial(line) {
        const data = line.replace(/(\r\n|\n|\r)/gm, "").split(" ");

        const commandId = data.shift();
        
        if (this.awaitingResponse.hasOwnProperty(commandId)) {
            const commandResult = data.shift();
            
            const promise = this.awaitingResponse[commandId];

            if (commandResult === "OK") promise.resolve(data);
            else promise.reject(new Error(`${commandResult}: ${data.join(" ")}`));

            delete this.awaitingResponse[commandId];
        }
    }

    writeSerial(line) {
        const { commandTermination = "\n" } = this.config;
        
        return new Promise((resolve, reject) => {
            if (this.serial === null) return reject(new Error("Serial port is not opened!"));
            
            this.serial.write(line + commandTermination, err => {
                if (err) reject(err);
                else resolve();
            });            
        });
    }

    sendCommand(command) {
        const commandId = [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        
        const promise = new Promise(async (resolve, reject) => {
            try {
                await this.writeSerial(`${command} ${commandId}`);
            } catch (err) {
                return reject(err);
            }

            setTimeout(() => {
                reject(new Error("No response within 1000ms!"));
                delete this.awaitingResponse[commandId];
            }, 1000);
        });

        this.awaitingResponse[commandId] = promise;

        return promise;
    }

    // Interface commands //

    async setRelay(relayId, closed) {
        await this.sendCommand(`set_relay ${closed ? "close" : "open"} ${relayId}`);
    }

    async openAllRelays() {
        await this.setRelay(255, false);
    }

    async getWeight() {
        return await this.sendCommand("get_sensor scale")[0];
    }

    async getTemperature() {
        return await this.sendCommand("get_sensor temperature")[0];
    }

    async tareScale() {
        await this.sendCommand("calibrate_sensor scale tare");
    }

    async calibrateScale(value) {
        await this.sendCommand(`calibrate_sensor scale weight ${value}`);
    }

    async setLightColor(red, green, blue) {
        await this.sendCommand(`set_light color ${red}, ${green}, ${blue}`);
    }

    async setLightIntensity(intensity) {
        await this.sendCommand(`set_light intensity ${intensity}`);
    }
}

export default Controller;