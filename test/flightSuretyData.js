var Test = require("../config/testConfig.js");
var BigNumber = require("bignumber.js");

const now = Date.now();

contract("Flight Surety Data Tests", async (accounts) => {
    var config;

    before("setup contract", async () => {
        config = await Test.Config(accounts);
    });

    /****************************************************************************************/
    /* Operations and Settings                                                              */
    /****************************************************************************************/

    it(`isOperational: Contract is operational on initialisation`, async function () {
        // Get operating status
        let status = await config.flightSuretyData.isOperational.call();
        assert.equal(status, true, "Incorrect initial operating status value");
    });

    it(`setOperatingStatus: Only contract owner can pause the contract`, async function () {
        // Ensure that access is denied for non-Contract Owner account
        let accessDenied = false;

        try {
            await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
        } catch (e) {
            accessDenied = true;
        }

        // Ensure that a require is in place preventing anyone but the contract owner from pausing the contract.
        assert.equal(accessDenied, true, "Access not restricted to Contract Owner");

        // Ensure that the data contract has not been paused.
        let isOperational = await config.flightSuretyData.isOperational();
        assert.equal(isOperational, true, "Data contract is unexpectedly not operational");
    });

    it(`setOperatingStatus: Contract owner can pause the contract`, async function () {
        // Ensure that access is allowed for Contract Owner account
        let accessDenied = false;

        try {
            await config.flightSuretyData.setOperatingStatus(false);
        } catch (e) {
            accessDenied = true;
        }

        // Ensure that a require is in place allowing the contract owner to pause the contract.
        assert.equal(accessDenied, false, "Access not restricted to Contract Owner");

        // Ensure that the data contract has been paused.
        let isOperational = await config.flightSuretyData.isOperational();
        assert.equal(isOperational, false, "Data contract is unexpectedly operational");

        // Reset the operating status
        await config.flightSuretyData.setOperatingStatus(true);
    });

    /****************************************************************************************/
    /* Authorisation                                                                        */
    /****************************************************************************************/

    it(`authorizeCaller: Contract owner can assign access to data contract`, async function () {
        let authorised = true;

        try {
            await config.flightSuretyData.authorizeCaller(config.testAddresses[2]);
        } catch (e) {
            authorised = false;
        }

        assert.equal(authorised, true, "Contract owner not able to authorise contract callers.");
    });

    it(`authorizeCaller: Only contract owner can assign access to data contract`, async function () {
        let authorised = true;

        try {
            await config.flightSuretyData.authorizeCaller(config.testAddresses[2], { from: config.testAddresses[2] });
        } catch (e) {
            authorised = false;
        }

        assert.equal(authorised, false, "Another contract owner is able to authorise contract callers.");
    });

    it(`deauthorizeCaller: Contract owner can remove access to data contract`, async function () {
        let deauthorised = true;

        try {
            await config.flightSuretyData.deauthorizeCaller(config.testAddresses[2]);
        } catch (e) {
            deauthorised = false;
        }

        assert.equal(deauthorised, true, "Contract owner not able to remove access to contract callers.");
    });

    it(`deauthorizeCaller: Only contract owner can remove access to data contract`, async function () {
        let deauthorised = true;

        try {
            await config.flightSuretyData.deauthorizeCaller(config.testAddresses[2], { from: config.testAddresses[2] });
        } catch (e) {
            deauthorised = false;
        }

        assert.equal(deauthorised, false, "Another contract owner is able to remove access to contract callers.");
    });

    it(`deauthorizeCaller: Contract owner cannot remove their access to data contract`, async function () {
        try {
            await config.flightSuretyData.deauthorizeCaller(config.owner);
        } catch (e) {
            assert.fail("An unexpected failure when the contract owner attempts to deauthorise themselves.");
        }
    });

    /****************************************************************************************/
    /*  Register Airline                                                                    */
    /****************************************************************************************/

    it(`getNumberOfAirlines: Automatic registration of first airline`, async function () {
        let numberOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
        assert.equal(numberOfAirlines, 1, "The first airline was not registered on initialisation");
    });

    it(`getAirline: Automatic registration of first airline`, async function () {
        const airline = await config.flightSuretyData.getAirline(config.firstAirline);
        assert.equal(airline.id, 1, "The expected first airline id did not match.");
        assert.equal(airline.account, config.firstAirline, "The expected first airline account did not match.");
        assert.equal(airline.registered, true, "The expected first airline registration status did not match.");
        assert.equal(airline.funded, true, "The expected first airline funded status did not match.");
    });

    it(`registerAirline: Access is blocked whenever contract is paused`, async function () {
        await config.flightSuretyData.setOperatingStatus(false);
        let blocked = false;

        try {
            await config.flightSuretyData.registerAirline(config.testAddresses[1]);
        } catch (e) {
            blocked = true;
        }

        assert.equal(blocked, true, "Access cannot be blocked for registerAirline");

        // Set it back for other tests to work
        await config.flightSuretyData.setOperatingStatus(true);
    });

    it(`registerAirline: Access is blocked to non-registered contracts`, async function () {
        await config.flightSuretyData.deauthorizeCaller(config.testAddresses[2]);
        let blocked = false;

        try {
            await config.flightSuretyData.registerAirline(config.testAddresses[1], { from: config.testAddresses[2] });
        } catch (e) {
            blocked = true;
        }

        assert.equal(blocked, true, "Access cannot be blocked for registerAirline to non-registered contracts");
    });

    it(`registerAirline: Multiple unique airlines can be registered`, async function () {
        let numberOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
        assert.equal(numberOfAirlines, 1, "There should only be the first airline registered.");

        // Register multiple airlines and ensure the count has been incremented each time.
        for (let step = 2; step <= 4; step++) {
            let airlineAddress = config.testAddresses[step];

            try {
                await config.flightSuretyData.registerAirline(airlineAddress);
            } catch (e) {
                assert.fail("An unexpected failure when registering an airline");
            }

            numberOfAirlines = await config.flightSuretyData.getNumberOfAirlines();
            assert.equal(numberOfAirlines, step, "The airline should have been registered.");

            const airline = await config.flightSuretyData.getAirline(airlineAddress);
            assert.equal(airline.id, step, "The expected first airline id did not match.");
            assert.equal(airline.account, airlineAddress, "The expected first airline account did not match.");
            assert.equal(airline.registered, true, "The expected first airline registration status did not match.");
            assert.equal(airline.funded, false, "The expected first airline funded status did not match.");
        }

        // Ensure that the same airline cannot be registered more than once.
        let unique = false;
        try {
            await config.flightSuretyData.registerAirline(config.testAddresses[2]);
        } catch (e) {
            unique = true;
        }

        assert.equal(unique, true, "An airline was able to be registered more than once.");
    });

    /****************************************************************************************/
    /*  Update Airline Funding                                                              */
    /****************************************************************************************/

    it(`updateAirlineFunding: An airline's funding can be recorded`, async function () {
        let registeredAirline = config.testAddresses[2];

        const airline = await config.flightSuretyData.getAirline(registeredAirline);
        assert.equal(airline.registered, true, "The expected first airline registered status did not match.");
        assert.equal(airline.funded, false, "The expected first airline funded status did not match.");

        try {
            await config.flightSuretyData.updateAirlineToFunded(registeredAirline, { value: "1000000000000000000" });

            const updatedAirline = await config.flightSuretyData.getAirline(registeredAirline);
            assert.equal(updatedAirline.funded, true, "The expected first airline funded status was not updated.");

            const noOfFundedAirlines = await config.flightSuretyData.getNumberOfFundedAirlines();
            assert.equal(noOfFundedAirlines, 2, "The expected number of funded airlines was not updated.");
        } catch (e) {
            console.log(e);
            assert.fail("The airline funding should have been recorded.");
        }
    });

    it(`updateAirlineFunding: An airline's who's funding has already been recorded does not update the number of funded airlines tally.`, async function () {
        let registeredAirline = config.testAddresses[2];

        const airline = await config.flightSuretyData.getAirline(registeredAirline);
        assert.equal(airline.registered, true, "The expected first airline registered status did not match.");
        assert.equal(airline.funded, true, "The expected first airline funded status did not match.");

        try {
            await config.flightSuretyData.updateAirlineToFunded(registeredAirline);

            const updatedAirline = await config.flightSuretyData.getAirline(registeredAirline);
            assert.equal(updatedAirline.funded, true, "The expected first airline funded status was not updated.");

            const noOfFundedAirlines = await config.flightSuretyData.getNumberOfFundedAirlines();
            assert.equal(noOfFundedAirlines, 2, "The expected number of funded airlines was not updated.");
        } catch (e) {
            assert.fail("The airline funding should have been recorded.");
        }
    });

    /****************************************************************************************/
    /*  Register Flight                                                                     */
    /****************************************************************************************/

    it(`registerFlight: Access is blocked whenever contract is paused`, async function () {
        await config.flightSuretyData.setOperatingStatus(false);
        let blocked = false;

        try {
            await config.flightSuretyData.registerFlight(config.testAddresses[1], "XXXX", now);
        } catch (e) {
            blocked = true;
        }

        assert.equal(blocked, true, "Access cannot be blocked for registerFlight");

        // Set it back for other tests to work
        await config.flightSuretyData.setOperatingStatus(true);
    });

    it(`registerFlight: Access is blocked to non-registered contracts`, async function () {
        await config.flightSuretyData.deauthorizeCaller(config.testAddresses[2]);
        let blocked = false;

        try {
            await config.flightSuretyData.registerFlight(config.testAddresses[1], "XXXX", now, { from: config.testAddresses[2] });
        } catch (e) {
            blocked = true;
        }

        assert.equal(blocked, true, "Access cannot be blocked for registerFlight to non-registered contracts");
    });

    it(`registerFlight: Multiple unique flights can be registered`, async function () {
        let numberOfFlights = await config.flightSuretyData.getNumberOfFlights();
        assert.equal(numberOfFlights, 0, "There should be no flights registered.");

        // Register multiple flights and ensure the count has been incremented each time.
        for (let step = 1; step <= 5; step++) {
            const airlineAddress = config.testAddresses[step];
            const code = "XXX" + step;

            try {
                await config.flightSuretyData.registerFlight(airlineAddress, code, now);
            } catch (e) {
                assert.fail("An unexpected failure when registering a flight");
            }

            let numberOfFlights = await config.flightSuretyData.getNumberOfFlights();
            assert.equal(numberOfFlights, step, "The flight should have been registered.");

            const flight = await config.flightSuretyData.getFlight(airlineAddress, code, now);
            assert.equal(flight.id, step, "The expected first flight id did not match.");
            assert.equal(flight.code, code, "The expected first flight code did not match.");
            assert.equal(flight.registered, true, "The expected first flight registration status did not match.");
            assert.equal(flight.statusCode, 0, "The expected first flight status code did not match.");
            assert.equal(flight.timestamp, now, "The expected first flight timestamp did not match.");
        }

        // Ensure that the same flight cannot be registered more than once.
        let unique = false;
        try {
            await config.flightSuretyData.registerFlight(config.testAddresses[2], "XXX2", now);
        } catch (e) {
            unique = true;
        }

        assert.equal(unique, true, "A flight was able to be registered more than once.");
    });

    /****************************************************************************************/
    /*  Buy Insurance                                                                       */
    /****************************************************************************************/

    it(`buy: Purchase an insurance policy`, async function () {
        const airline = config.testAddresses[1];
        const passenger = accounts[2];
        const amount = 10000000;

        try {
            await config.flightSuretyData.buy(airline, "XXX1", now, passenger, amount, { value: amount });

            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX1", now, passenger);
            assert.equal(insurance.insured, true, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, amount, "The expected passenger insured amount did not match.");
        } catch (e) {
            assert.fail("Should have been able to buy insurance.");
        }
    });

    /****************************************************************************************/
    /*  Credit Insurees                                                                     */
    /****************************************************************************************/

    it(`creditInsurees: An insured passenger should be credited when a flight is delayed`, async function () {
        const airline = config.testAddresses[1];
        const passenger = accounts[2];
        const amount = 10000000;
        const credit = 10000000 * 1.5;

        try {
            await config.flightSuretyData.creditInsurees(airline, "XXX1", now, 20, 150);

            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX1", now, passenger);
            assert.equal(insurance.insured, true, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, amount, "The expected passenger insured amount did not match.");
            assert.equal(insurance.credit, credit, "The expected passenger credit amount did not match.");
        } catch (e) {
            assert.fail("Should have been able to credit the insurees.");
        }
    });

    it(`creditInsurees: Ensure credited passengers cannot receive credit more than once.`, async function () {
        const airline = config.testAddresses[1];
        const passenger = accounts[2];
        const amount = 10000000;
        const credit = 10000000 * 1.5;

        try {
            await config.flightSuretyData.creditInsurees(airline, "XXX1", now, 20, 150);

            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX1", now, passenger);
            assert.equal(insurance.insured, true, "The expected passenger insured status did not match.");
            assert.equal(insurance.insuredFor, amount, "The expected passenger insured amount did not match.");
            assert.equal(insurance.credit, credit, "The expected passenger credit amount did not match.");
        } catch (e) {
            assert.fail("Should have gracefully ignored another credit request.");
        }
    });

    /****************************************************************************************/
    /*  Pay                                                                                 */
    /****************************************************************************************/

    it(`pay: Purchase an insurance policy`, async function () {
        const airline = config.testAddresses[1];
        const passenger = accounts[2];
        const balance = await web3.eth.getBalance(config.flightSuretyData.address);

        try {
            await config.flightSuretyData.pay(passenger);

            const newBalance = await web3.eth.getBalance(config.flightSuretyData.address);
            let insurance = await config.flightSuretyData.getInsurance(airline, "XXX1", now, passenger);
            assert.equal(newBalance, balance - insurance.credit, "The expected passenger credit amount did not match.");
        } catch (e) {
            assert.fail("Should have been able to buy insurance.");
        }
    });
});
