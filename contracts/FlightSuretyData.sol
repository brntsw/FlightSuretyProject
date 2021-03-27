// SPDX-License-Identifier: MIT
pragma solidity ^0.5.15;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./IFlightSuretyData.sol";

contract FlightSuretyData is IFlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                     CONTRACT VARIABLES                                   */
    /********************************************************************************************/

    address private contractOwner; // Account used to deploy contract
    bool private operational = true; // Blocks all state changes throughout the contract if false
    mapping(address => uint256) private authorizedContracts;

    /********************************************************************************************/
    /*                                      AIRLINE VARIABLES                                   */
    /********************************************************************************************/

    struct Airline {
        uint256 id;
        address account;
        bool registered;
        bool funded;
    }

    mapping(address => Airline) private airlines;
    uint256 private numberOfAirlines;
    uint256 private numberOfFundedAirlines;

    /********************************************************************************************/
    /*                                       FLIGHT VARIABLES                                   */
    /********************************************************************************************/

    struct Flight {
        uint256 id;
        string code;
        bool registered;
        uint8 statusCode;
        uint256 updatedTimestamp;
        address airline;
    }

    mapping(bytes32 => Flight) private flights;
    uint256 private numberOfFlights;

    /********************************************************************************************/
    /*                                     INSURANCE VARIABLES                                  */
    /********************************************************************************************/

    struct Passenger {
        address account;
        bool insured;
        uint256 insuredFor;
        uint256 credit;
    }

    struct Insurance {
        uint256 id;
        bytes32 flightKey;
        mapping(address => Passenger) passengers;
        address[] passengerAddresses;
        bool appliedCredit;
    }

    mapping(bytes32 => Insurance) private insurances;
    uint256 private numberOfInsurances;
    mapping(address => Passenger) private passengersWithCredit;

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/

    /**
     * @dev Constructor
     *      The deploying account becomes contractOwner
     */
    constructor(address _firstAirline) public {
        contractOwner = msg.sender;

        // Ensure that the contract owner is authorised to access the contract.
        authorizeCaller(contractOwner);

        // Ensure that the first airline is registered and funded on initialisation.
        registerAirline(_firstAirline);
        updateAirlineToFunded(_firstAirline);
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
     * @dev Modifier that requires the "operational" boolean variable to be "true"
     *      This is used on all state changing functions to pause the contract in
     *      the event there is an issue that needs to be fixed
     */
    modifier requireIsOperational() {
        require(operational, "Contract is currently not operational");
        _; // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
     * @dev Modifier that requires the "ContractOwner" account to be the function caller
     */
    modifier requireContractOwner() {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireIsCallerAuthorized() {
        require(
            authorizedContracts[msg.sender] == 1,
            "Caller is not authorised"
        );
        _;
    }

    modifier requireUniqueAirline(address _airline) {
        require(
            airlines[_airline].registered == false,
            "An airline can only be registered once."
        );
        _;
    }

    modifier requireUniqueFlight(
        address _airline,
        string memory _flight,
        uint256 _timestamp
    ) {
        bytes32 flightKey = getFlightKey(_airline, _flight, _timestamp);

        require(
            flights[flightKey].registered == false,
            "A flight can only be registered once."
        );
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
     * @dev Get operating status of contract
     *
     * @return A bool that is the current operating status
     */

    function isOperational() external view returns (bool) {
        return operational;
    }

    /**
     * @dev Sets contract operations on/off
     *
     * When operational mode is disabled, all write transactions except for this one will fail
     */

    function setOperatingStatus(bool mode) external requireContractOwner {
        operational = mode;
    }

    function authorizeCaller(address _contractAddress)
        public
        requireContractOwner
    {
        authorizedContracts[_contractAddress] = 1;
    }

    function deauthorizeCaller(address _contractAddress)
        external
        requireContractOwner
    {
        // Ensure that the contract owner is always authorised to access the data contract.
        // Be graceful, if the contract owner does try to deauthorise themselves.
        if (contractOwner == _contractAddress) {
            return;
        }

        delete authorizedContracts[_contractAddress];
    }

    /********************************************************************************************/
    /*                                      AIRLINE FUNCTIONS                                   */
    /********************************************************************************************/

    /**
     * @dev Add an airline to the registration queue
     *      Can only be called from FlightSuretyApp contract
     *
     */
    function registerAirline(address _airline)
        public
        requireIsOperational
        requireIsCallerAuthorized
        requireUniqueAirline(_airline)
        returns (address)
    {
        // Add the airline and increment the number of airlines counter to reflect a new airline has been registered.
        numberOfAirlines = numberOfAirlines.add(1);
        airlines[_airline].id = numberOfAirlines;
        airlines[_airline].account = _airline;

        // Uniqueness modifier relies on this property being explicity set.
        airlines[_airline].registered = true;

        return _airline;
    }

    function getNumberOfAirlines()
        external
        view
        requireIsOperational
        requireIsCallerAuthorized
        returns (uint256)
    {
        return numberOfAirlines;
    }

    function getAirline(address _airline)
        external
        view
        requireIsOperational
        requireIsCallerAuthorized
        returns (
            uint256 id,
            address account,
            bool registered,
            bool funded
        )
    {
        id = airlines[_airline].id;
        account = airlines[_airline].account;
        registered = airlines[_airline].registered;
        funded = airlines[_airline].funded;

        return (id, account, registered, funded);
    }

    function updateAirlineToFunded(address _airline)
        public
        payable
        requireIsOperational
        requireIsCallerAuthorized
    {
        // If the airline hasn't previously provided funding then increment the funded tally.
        if (airlines[_airline].funded == false) {
            numberOfFundedAirlines = numberOfFundedAirlines.add(1);
        }

        airlines[_airline].funded = true;
    }

    function getNumberOfFundedAirlines()
        external
        view
        requireIsOperational
        requireIsCallerAuthorized
        returns (uint256)
    {
        return numberOfFundedAirlines;
    }

    /********************************************************************************************/
    /*                                       FLIGHT FUNCTIONS                                   */
    /********************************************************************************************/

    function registerFlight(
        address _airline,
        string calldata _flight,
        uint256 _timestamp
    )
        external
        requireIsOperational
        requireIsCallerAuthorized
        requireUniqueFlight(_airline, _flight, _timestamp)
        returns (bytes32)
    {
        bytes32 flightKey = getFlightKey(_airline, _flight, _timestamp);

        // Add the airline and increment the number of airlines counter to reflect a new airline has been registered.
        numberOfFlights = numberOfFlights.add(1);
        flights[flightKey].id = numberOfFlights;
        flights[flightKey].code = _flight;
        flights[flightKey].statusCode = 0;
        flights[flightKey].updatedTimestamp = _timestamp;
        flights[flightKey].airline = _airline;

        // Uniqueness modifier relies on this property being explicity set.
        flights[flightKey].registered = true;

        // Register a new insurance policy for the flight.
        _registerInsurance(flightKey);

        return flightKey;
    }

    function getNumberOfFlights()
        external
        view
        requireIsOperational
        requireIsCallerAuthorized
        returns (uint256)
    {
        return numberOfFlights;
    }

    function getFlight(
        address _airline,
        string calldata _flight,
        uint256 _timestamp
    )
        external
        view
        requireIsOperational
        requireIsCallerAuthorized
        returns (
            uint256 id,
            string memory code,
            bool registered,
            uint8 statusCode,
            uint256 timestamp,
            address airline
        )
    {
        bytes32 flightKey = getFlightKey(_airline, _flight, _timestamp);

        id = flights[flightKey].id;
        code = flights[flightKey].code;
        registered = flights[flightKey].registered;
        statusCode = flights[flightKey].statusCode;
        timestamp = flights[flightKey].updatedTimestamp;
        airline = flights[flightKey].airline;

        return (id, code, registered, statusCode, timestamp, airline);
    }

    function getFlightKey(
        address airline,
        string memory flight,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /********************************************************************************************/
    /*                                     INSURANCE FUNCTIONS                                  */
    /********************************************************************************************/

    function _registerInsurance(bytes32 flightKey) internal {
        // Add the insurance and increment the number of insurances counter to reflect a new insurance policy has been registered.
        numberOfInsurances = numberOfInsurances.add(1);
        insurances[flightKey].id = numberOfInsurances;
        insurances[flightKey].flightKey = flightKey;
    }

    /**
     * @dev Buy insurance for a flight
     *
     */
    function buy(
        address _airline,
        string calldata _flight,
        uint256 _timestamp,
        address _passenger,
        uint256 _amount
    ) external payable requireIsOperational requireIsCallerAuthorized {
        bytes32 flightKey = getFlightKey(_airline, _flight, _timestamp);

        // Be graceful, but ensure the flight has been registered before registering the insurance purchase.
        if (flights[flightKey].registered) {
            insurances[flightKey].passengers[_passenger].account = _passenger;
            insurances[flightKey].passengers[_passenger].insuredFor = _amount;
            insurances[flightKey].passengers[_passenger].insured = true;

            // Store the passenger address for easy indexing when crediting the insurance.
            insurances[flightKey].passengerAddresses.push(_passenger);
        }
    }

    function getInsurance(
        address _airline,
        string calldata _flight,
        uint256 _timestamp,
        address _passenger
    )
        external
        view
        returns (
            bool insured,
            uint256 insuredFor,
            uint256 credit
        )
    {
        bytes32 flightKey = getFlightKey(_airline, _flight, _timestamp);

        insured = insurances[flightKey].passengers[_passenger].insured;
        insuredFor = insurances[flightKey].passengers[_passenger].insuredFor;
        credit = insurances[flightKey].passengers[_passenger].credit;

        return (insured, insuredFor, credit);
    }

    /**
     *  @dev Credits payouts to insurees
     */
    function creditInsurees(
        address _airline,
        string calldata _flight,
        uint256 _timestamp,
        uint8 _statusCode,
        uint8 _factor
    ) external requireIsOperational requireIsCallerAuthorized {
        bytes32 flightKey = getFlightKey(_airline, _flight, _timestamp);

        // To pay out credit to the passengers, the following rules must be met.
        // 1. The flight has been registered
        // 2. At least one passenger has bought insurance for it.
        // 3. The credit hasn't already been applied to the flight.
        if (
            flights[flightKey].registered &&
            insurances[flightKey].passengerAddresses.length >= 1 &&
            !insurances[flightKey].appliedCredit
        ) {
            // Record the status code that caused the need to credit the passengers.
            flights[flightKey].statusCode = _statusCode;

            // Indicate that the passengers who bought insurance for the flight have been credited.
            insurances[flightKey].appliedCredit = true;

            // Provide all the insured passengers with credit.
            for (
                uint256 i = 0;
                i < insurances[flightKey].passengerAddresses.length;
                i++
            ) {
                address passengerAddress = insurances[flightKey]
                    .passengerAddresses[i];
                uint256 insuredFor = insurances[flightKey]
                    .passengers[passengerAddress]
                    .insuredFor;
                uint256 credit = insuredFor.mul(_factor).div(100);

                // Record the credit applied to the passenger for this individual flight.
                insurances[flightKey].passengers[passengerAddress]
                    .credit = credit;

                // Record the credit applied to the passenger for all the flights they purchased insured for.
                // NOTE: The passenger may not withdraw their credit after each individual flight delay.
                passengersWithCredit[passengerAddress]
                    .account = passengerAddress;
                passengersWithCredit[passengerAddress]
                    .credit = passengersWithCredit[passengerAddress].credit.add(
                    credit
                );
            }
        }
    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
     */
    function pay(address payable _passenger)
        external
        requireIsOperational
        requireIsCallerAuthorized
    {
        // If the passenger has some credit built up then transfer it into their account.
        if (passengersWithCredit[_passenger].account == _passenger) {
            uint256 credit = passengersWithCredit[_passenger].credit;
            delete (passengersWithCredit[_passenger]);

            // Only perform the credit transfer when we've removed the risk the passenger
            // could attempt another withdrawl.
            _passenger.transfer(credit);
        }
    }

    function getCredit(address _passenger)
        external
        view
        returns (uint256 credit)
    {
        if (passengersWithCredit[_passenger].account == _passenger) {
            return (passengersWithCredit[_passenger].credit);
        } else {
            return (0);
        }
    }
}
