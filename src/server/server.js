import FlightSuretyApp from "../../build/contracts/FlightSuretyApp.json";
import Config from "./config.json";
import Web3 from "web3";
import express from "express";

let config = Config["localhost"];
let web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace("http", "ws")));
web3.eth.defaultAccount = web3.eth.accounts[0];
let flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);

//
// Oracle Registration
//

let accountsAsOracles = []; // Store the accounts being used as oracles.
let oracleToIndexesList = []; // Store the indexes assigned to each oracle.

// Assign twenty accounts to be oracles.
function assignOracleAccounts() {
    return new Promise((resolve) => {
        web3.eth
            .getAccounts()
            .then((accounts) => {
                // Assign the last 20 accounts to mimic oracles.
                let noOfAccounts = accounts.length;
                accountsAsOracles = accounts.slice(noOfAccounts - 20, noOfAccounts);
            })
            .then(() => {
                resolve(accountsAsOracles);
            });
    });
}

// Register each of the oracle accounts with the smart contract.
function makeOracleRequests(accounts) {
    for (let count = 0; count < accountsAsOracles.length; count++) {
        let account = accountsAsOracles[count];

        flightSuretyApp.methods
            .registerOracle()
            .send({ from: account, value: web3.utils.toWei("1", "ether"), gas: 5000000, gasPrice: 20000000 })
            .then(() => {
                storeOracleToIndex(account);
            });
    }
}

// Find out what the indexes are for each oracle and store them so that we can match them when the OracleRequest event is triggered.
function storeOracleToIndex(account) {
    flightSuretyApp.methods
        .getMyIndexes()
        .call({ from: account })
        .then((result) => {
            console.log("Storing indexes as: " + result + " for account: " + account);
            oracleToIndexesList.push(result);
        });
}

// Kick off the registration process when the server starts up.
assignOracleAccounts().then((accounts) => {
    makeOracleRequests(accounts);
});

//
// Oracle Event Listeners
//

flightSuretyApp.events.OracleRequest(function (error, event) {
    const statuses = [0, 10, 20, 30, 40, 50];
    let index = event.returnValues.index;
    let airline = event.returnValues.airline;
    let flight = event.returnValues.flight;
    let timestamp = event.returnValues.timestamp;

    console.log("Processing oracle request for index: " + index + " airline: " + airline + " flight: " + flight + " timestamp: " + timestamp);

    // For all the oracles that match the index provided, submit a response to the smart contract.
    for (let count = 0; count < accountsAsOracles.length; count++) {
        let oracle = accountsAsOracles[count];
        let indexes = oracleToIndexesList[count];

        // If any of the indexes match then submit a response to the smart contract.
        if (indexes[0] == index || indexes[1] == index || indexes[2] == index) {
            //Randomly select a status code.
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            flightSuretyApp.methods.submitOracleResponse(index, airline, flight, timestamp, randomStatus).send({ from: oracle, gas: 6721975 });
        }
    }
});

// Used for debug purposes to ensure the oracle response to the smart contract triggered processing of the flight status.
flightSuretyApp.events.FlightStatusInfo(function (error, event) {
    let airline = event.returnValues.airline;
    let flight = event.returnValues.flight;
    let timestamp = event.returnValues.timestamp;
    let status = event.returnValues.status;

    console.log("Received flight status info for airline: " + airline + " flight: " + flight + " timestamp: " + timestamp + " status: " + status);
});

//
// Oracle APIs
//

const app = express();
app.get("/api", (req, res) => {
    res.send({
        message: "An API for use with your Dapp!",
    });
});

export default app;
