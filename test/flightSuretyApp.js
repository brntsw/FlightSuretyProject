var Test = require("../config/testConfig.js");
var BigNumber = require("bignumber.js");
var truffleAssert = require("truffle-assertions");

const now = Date.now();

contract("Flight Surety App Tests", async (accounts) => {
    var config;
    before("setup contract", async () => {
        config = await Test.Config(accounts);

        // Authorise the app contract to make calls on the data contract.
        await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
    });

    /****************************************************************************************/
    /* Fund Airline                                                                        */
    /****************************************************************************************/

    it("fundAirline: Makes sure that an airline pays sufficient funds", async () => {
        let registeredAirline = config.firstAirline;

        // Ensure that funding is rejected if the funds are not sufficient.
        try {
            const tx = await config.flightSuretyApp.fundAirline({ from: registeredAirline, value: web3.utils.toWei("9", "ether") });
            assert.fail("An airline should not be able to pay insufficient funds.");
        } catch (e) {}
    });

    it("fundAirline: Makes sure that an airline is registered before paying funds", async () => {
        let unregisteredAirline = accounts[7];

        // Ensure that funding is rejected if the funds are not sufficient.
        try {
            const tx = await config.flightSuretyApp.fundAirline({ from: unregisteredAirline, value: web3.utils.toWei("10", "ether") });
            assert.fail("An airline that is not registered should not be able to pay funds.");
        } catch (e) {}
    });

    it("fundAirline: Makes sure that a registered airline within sufficient funds has its funded status updated", async () => {
        let registeredAirline = config.firstAirline;

        // Ensure that funding is rejected if the funds are not sufficient.
        try {
            const tx = await config.flightSuretyApp.fundAirline({ from: registeredAirline, value: web3.utils.toWei("10", "ether") });
            truffleAssert.eventEmitted(tx, "AirlineFunded");

            let airline = await config.flightSuretyData.getAirline(registeredAirline);
            assert.equal(airline.funded, true, "The expected airline funded status did not match.");
        } catch (e) {
            console.log(e);
            assert.fail("An airline that is registered within sufficient funds should have its status updated to funded.");
        }
    });

    /****************************************************************************************/
    /* Register Airline                                                                     */
    /****************************************************************************************/

    it("registerAirline: Makes sure an unregistered airline cannot register another airline", async () => {
        let unregisteredAirline = accounts[3];

        try {
            await config.flightSuretyApp.registerAirline(accounts[2], { from: unregisteredAirline });
            assert.fail("An airline should not be able to register an airline if it is not registered itself.");
        } catch (e) {
            let noOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
            assert.equal(noOfAirlines, 1, "The airline should not have been registered by an unregistered airline.");
        }
    });

    it("registerAirline: A registered airline can register another founding airline", async () => {
        let registeredAirline = config.firstAirline;

        // Ensure that the first four airlines can be registered without consensus, as long as an already
        // registered airline is making the request.
        for (let step = 2; step <= 4; step++) {
            let newAirline = accounts[step];

            try {
                const tx = await config.flightSuretyApp.registerAirline(newAirline, { from: registeredAirline });
                truffleAssert.eventEmitted(tx, "AirlineRegistered");

                await config.flightSuretyApp.fundAirline({ from: newAirline, value: web3.utils.toWei("10", "ether") });

                let noOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
                assert.equal(noOfAirlines, step, "The airline should have been registered by the registered airline.");
            } catch (e) {
                assert.fail("A registered airline should be able to register another airline.");
            }
        }
    });

    it("registerAirline: Makes sure an airline can only be registered once", async () => {
        let registeredAirline = config.firstAirline;

        // Ensure that an airline cannot be registered more than once.
        try {
            const tx = await config.flightSuretyApp.registerAirline(accounts[2], { from: registeredAirline });
            assert.fail("An airline cannot be registered twice.");
        } catch (e) {
            let noOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
            assert.equal(noOfAirlines, 4, "The airline should not have been registered again.");
        }
    });

    it("registerAirline: Makes sure multi-party consensus is used for registering an airline once more than 4 airlines are registered", async () => {
        let newAirline = accounts[5];
        let registeredAirline1 = accounts[2];
        let registeredAirline2 = accounts[3];

        // The first registered airline should have its vote counted to register the new airline, but there should not yet be a consensus.
        try {
            const tx = await config.flightSuretyApp.registerAirline(newAirline, { from: registeredAirline1 });

            let noOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
            assert.equal(noOfAirlines, 4, "The airline should not have been registered as there should not yet be a consensus.");
        } catch (e) {
            assert.fail("A registered airline should be able to vote to register another airline.");
        }

        // The second registered airline should have its vote counted to register the new airline, and there should now be a consensus.
        try {
            const tx = await config.flightSuretyApp.registerAirline(newAirline, { from: registeredAirline2 });

            let noOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
            assert.equal(noOfAirlines, 5, "The airline should have been registered as there should now be a consensus.");
        } catch (e) {
            assert.fail("A registered airline should be able to vote to register another airline.");
        }
    });

    /****************************************************************************************/
    /*  Register Flight                                                                     */
    /****************************************************************************************/

    it("registerFlight: Makes sure an unregistered airline cannot register a flight", async () => {
        let unregisteredAirline = accounts[7];

        try {
            await config.flightSuretyApp.registerFlight(accounts[2], "XXX2", now, { from: unregisteredAirline });
            assert.fail("An airline should not be able to register a flight if it is not registered.");
        } catch (e) {
            let noOfFlights = await config.flightSuretyData.getNumberOfFlights();
            assert.equal(noOfFlights, 0, "The flight should not have been registered by an unregistered airline.");
        }
    });

    it("registerFlight: A registered airline can register a new flight", async () => {
        let registeredAirline = config.firstAirline;

        try {
            const tx = await config.flightSuretyApp.registerFlight(accounts[2], "XXX2", now, { from: registeredAirline });
            truffleAssert.eventEmitted(tx, "FlightRegistered");

            let noOfFlights = await config.flightSuretyData.getNumberOfFlights();
            assert.equal(noOfFlights, 1, "The flight should have been registered.");
        } catch (e) {
            assert.fail("A registered airline should be able to register a flight.");
        }
    });

    /****************************************************************************************/
    /*  Buy Insurance                                                                       */
    /****************************************************************************************/

    it("buy: Makes sure the correct payment amount is provided", async () => {
        let passenger = config.testAddresses[1];
        let airline = accounts[2];

        try {
            await config.flightSuretyApp.buy(airline, "XXX2", now, { from: passenger, value: web3.utils.toWei("2", "ether") });
            assert.fail("A passenger should not be able to buy insurance for 2 ether.");
        } catch (e) {
            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX2", now, passenger);
            assert.equal(insurance.insured, false, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, 0, "The expected passenger insured amount did not match.");
        }

        try {
            await config.flightSuretyApp.buy(airline, "XXX2", now, { from: passenger });
            assert.fail("A passenger should not be able to buy insurance without providing some ether.");
        } catch (e) {
            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX2", now, passenger);
            assert.equal(insurance.insured, false, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, 0, "The expected passenger insured amount did not match.");
        }
    });

    it("buy: Makes sure the flight has been registered", async () => {
        let passenger = config.testAddresses[1];
        let airline = accounts[9];

        try {
            await config.flightSuretyApp.buy(airline, "XXX9", now, { from: passenger, value: web3.utils.toWei("1", "ether") });
            assert.fail("A passenger should not be able to buy insurance for a flight that hasn't been registered.");
        } catch (e) {
            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX2", now, passenger);
            assert.equal(insurance.insured, false, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, 0, "The expected passenger insured amount did not match.");
        }
    });

    it("buy: Ensure a new passenger for a flight can purchase insurance", async () => {
        let passenger = accounts[8];
        let airline = accounts[2];
        let amount = web3.utils.toWei("1", "ether");

        try {
            const tx = await config.flightSuretyApp.buy(airline, "XXX2", now, { from: passenger, value: amount });
            truffleAssert.eventEmitted(tx, "PassengerInsured");

            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX2", now, passenger);
            assert.equal(insurance.insured, true, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, amount, "The expected passenger insured amount did not match.");
        } catch (e) {
            assert.fail("A passenger should able to buy insurance for a flight.");
        }
    });

    it("buy: Makes sure an existing passenger for a flight cannot purchase another insurance policy", async () => {
        let passenger = accounts[8];
        let airline = accounts[2];
        let amount = web3.utils.toWei("1", "ether");

        try {
            const tx = await config.flightSuretyApp.buy(airline, "XXX2", now, { from: passenger, value: amount });
            assert.fail("A passenger should not able to buy insurance for a flight more than once.");
        } catch (e) {}
    });

    /****************************************************************************************/
    /*  Withdraw                                                                            */
    /****************************************************************************************/

    it("withdraw: Makes sure a passenger can withdraw their credit", async () => {
        let passenger = accounts[8];
        let airline = accounts[2];
        const balance = await web3.eth.getBalance(config.flightSuretyData.address);

        try {
            const tx = await config.flightSuretyApp.withdraw({ from: passenger });
            truffleAssert.eventEmitted(tx, "PassengerWithdrawl");

            const newBalance = await web3.eth.getBalance(config.flightSuretyData.address);
            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX1", now, passenger);
            assert.equal(newBalance, balance - insurance.credit, "The expected passenger credit amount did not match.");
        } catch (e) {
            assert.fail("A passenger should be able to withdraw their credit.");
        }
    });
});
