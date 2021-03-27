const FlightSuretyApp = artifacts.require("FlightSuretyApp");
const FlightSuretyData = artifacts.require("FlightSuretyData");
const fs = require("fs");

module.exports = function (deployer, network, accounts) {
    let firstAirline = accounts[0];
    deployer.deploy(FlightSuretyData, firstAirline).then((instance) => {
        let flightSuretyData = instance;

        return deployer.deploy(FlightSuretyApp, FlightSuretyData.address).then((instance) => {
            let flightSuretyApp = instance;

            let config = {
                localhost: {
                    url: "http://localhost:8545",
                    dataAddress: FlightSuretyData.address,
                    appAddress: FlightSuretyApp.address,
                },
            };
            fs.writeFileSync(__dirname + "/../src/dapp/config.json", JSON.stringify(config, null, "\t"), "utf-8");
            fs.writeFileSync(__dirname + "/../src/server/config.json", JSON.stringify(config, null, "\t"), "utf-8");

            flightSuretyData.authorizeCaller(flightSuretyApp.address);
        });
    });
};
