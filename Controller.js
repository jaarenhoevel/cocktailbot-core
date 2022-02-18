import SerialPort from "serialport";
import SerialParser from "@serialport/parser-readline"

class Controller {
    constructor(config) {
        this.config = config;

        this.serial = null;
        this.awaitingResponse = {};
    }

    connect() {
        const { serialPort = "/dev/ttyUSB0", serialBaud = 9600 } = this.config;

        return new Promise((resolve, reject) => {
            this.serial = new SerialPort(serialPort, {
                baudRate: serialBaud,
                dataBits: 8,
                stopBits: 1,
                parity: "none"
            }, err => {
                if (err) {
                    reject(err);
                    this.serial = null;
                    return;
                }
                
                const parser = new SerialParser();
                this.serial.pipe(parser);

                parser.on("data", line => this.parseSerial(line));
                
                // Wait x seconds for interface to initialize
                this.sendCommand("handshake", 10).then(() => {
                    resolve();
                    console.log("Connection to interface established");
                }).catch(() => {
                    reject(new Error("Could not establish connection to interface!"));
                })
            });
        });
    }

    parseSerial(line) {
        console.info(`<- Received serial line: ${line.replace(/(\r\n|\n|\r)/gm, "")}`);
        
        const data = line.replace(/(\r\n|\n|\r)/gm, "").split(" ");

        const commandId = data.shift();
        
        if (this.awaitingResponse.hasOwnProperty(commandId)) {
            const commandResult = data.shift();
            
            const promise = this.awaitingResponse[commandId];

            if (commandResult === "OK") promise.resolve(data);
            else if (data[0] === "Unrecognized") return;
            else promise.reject(new Error(`${commandResult}: ${data.join(" ")}`));

            delete this.awaitingResponse[commandId];
        }
    }

    writeSerial(line) {
        console.info(`-> Sending serial line: ${line}`);
        
        const { serialCommandTermination = "\n" } = this.config;
        
        return new Promise((resolve, reject) => {
            if (this.serial === null) return reject(new Error("Serial port is not opened!"));
            
            this.serial.write(line + serialCommandTermination, err => {
                if (err) reject(err);
                else resolve();
            });            
        });
    }

    sendCommand(commandString, retries = 2) {
        // Generate command ID
        const commandId = [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        
        const { serialTimeout = 1000 } = this.config;

        // Add command ID as first parameter of command
        const commandData = commandString.split(" ");
        commandData.splice(1, 0, commandId);

        const command = commandData.join(" ");
        
        const promise = new Promise(async (resolve, reject) => {
            try {
                await this.writeSerial(command);
            } catch (err) {
                return reject(err);
            }

            this.awaitingResponse[commandId] = {
                resolve: data => {resolve(data)},
                reject: err => {reject(err)}
            };

            const interval = setInterval(() => {
                if (retries === 0 || !this.awaitingResponse.hasOwnProperty(commandId)) {
                    reject(new Error(`No response within 1000ms! Command ID: ${commandId} Command: ${command}`));
                    delete this.awaitingResponse[commandId];
                    clearInterval(interval);
                    return;
                }

                retries --;
                console.warn(`Retrying serial command: ${command} - ${retries} tries left`);
                this.writeSerial(command);
            }, serialTimeout);
        });

        return promise;
    }

    // Interface commands //

    async setRelay(relayId, closed) {
        if (relayId === undefined) throw new Error("Relay ID not specified!");
        await this.sendCommand(`set_relay ${closed ? "close" : "open"} ${relayId}`);
    }

    async openAllRelays() {
        await this.setRelay(255, false);
    }

    async getWeight() {
        const weight = await this.sendCommand("get_sensor scale");
        return parseInt(weight.shift());
    }

    async getTemperature() {
        const temperature = await this.sendCommand("get_sensor temperature");
        return parseInt(temperature.shift());
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