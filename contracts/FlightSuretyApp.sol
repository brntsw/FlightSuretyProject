// SPDX-License-Identifier: MIT
pragma solidity ^0.5.15;

// It's important to avoid vulnerabilities due to numeric overflow bugs
// OpenZeppelin's SafeMath library, when used correctly, protects agains such bugs
// More info: https://www.nccgroup.trust/us/about-us/newsroom-and-events/blog/2018/november/smart-contract-insecurity-bad-arithmetic/

import "solidity-string-utils/StringUtils.sol";
import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./IFlightSuretyData.sol";

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */
contract FlightSuretyApp {
    using SafeMath for uint256; // Allow SafeMath functions to be called for all uint256 types (similar to "prototype" in Javascript)
    using StringUtils for uint256;
    using StringUtils for address;

    /********************************************************************************************/
    /*                                         CONSTANTS                                        */
    /********************************************************************************************/

    // Flight status codes
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    // Credit factor for flight delays
    uint8 private constant FLIGHT_DELAY_CREDIT_FACTOR = 150;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    // Contract variables
    address private contractOwner; // Account used to deploy contract
    IFlightSuretyData private flightSuretyData;

    // Multi-party consenus variables
    uint8 private constant M = 4;
    mapping(address => Votes) private multiPartyConsensusVotes;
    struct Votes {
        uint256 noOfVoters;
        mapping(address => bool) votedAirlines;
    }

    // Distinguish the airline fault codes
    mapping(uint8 => bool) private airlineFaults;

    /********************************************************************************************/
    /*                                             EVENTS                                       */
    /********************************************************************************************/

    event AirlineRegistered(address airline);
    event AirlineFunded(address airline);
    event FlightRegistered(address airline, string flight, uint256 timestamp);
    event PassengerInsured(
        address airline,
        string flight,
        uint256 timestamp,
        address passenger,
        uint256 amount
    );
    event InsuranceCredit(
        address airline,
        string flight,
        uint256 timestamp,
        uint8 statusCode
    );
    event PassengerWithdrawl(address passenger);

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
        // Modify to call data contract's status
        require(
            flightSuretyData.isOperational(),
            "Contract is currently not operational"
        );
        _; // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
     * @dev Modifier that requires the "ContractOwner" account to be the function caller
     */
    modifier requireContractOwner() {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireRequestFromRegisteredAirline() {
        require(
            _isRegisteredAirline(msg.sender),
            "Caller is not a registered airline."
        );
        _;
    }

    modifier requireRequestFromFundedAirline() {
        require(_isFundedAirline(msg.sender), "Calling airline is not funded.");
        _;
    }

    modifier requireNewAirline(address _airline) {
        require(
            !_isRegisteredAirline(_airline),
            "The airline has already been registered."
        );
        _;
    }

    modifier requireSufficientFunds() {
        require(
            msg.value >= (10 ether),
            "The airline has not provided sufficient funds."
        );
        _;
    }

    modifier requireUniqueVote(address _airline) {
        Votes storage voters = multiPartyConsensusVotes[_airline];

        require(
            !voters.votedAirlines[msg.sender],
            "The caller has already placed a vote to register the airline."
        );
        _;
    }

    modifier requireNewFlight(
        address _airline,
        string memory _flight,
        uint256 _timestamp
    ) {
        require(
            !_isRegisteredFlight(_airline, _flight, _timestamp),
            "The flight has already been registered."
        );
        _;
    }

    modifier requireInsurancePayment() {
        require(
            msg.value > 0 && msg.value <= (1 ether),
            "The passenger has not provided the correct insurance amount."
        );
        _;
    }

    modifier requireRegisteredFlight(
        address _airline,
        string memory _flight,
        uint256 _timestamp
    ) {
        require(
            _isRegisteredFlight(_airline, _flight, _timestamp),
            "The flight has not been registered."
        );
        _;
    }

    modifier requireNewInsurance(
        address _airline,
        string memory _flight,
        uint256 _timestamp
    ) {
        require(
            !_isPassengerInsured(_airline, _flight, _timestamp),
            "The passenger is already insured for the flight."
        );
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
     * @dev Contract constructor
     *
     */
    constructor(address _flightSuretyData) public {
        contractOwner = msg.sender;
        flightSuretyData = IFlightSuretyData(_flightSuretyData);

        airlineFaults[STATUS_CODE_LATE_AIRLINE] = true;
        airlineFaults[STATUS_CODE_LATE_WEATHER] = true;
        airlineFaults[STATUS_CODE_LATE_TECHNICAL] = true;
        airlineFaults[STATUS_CODE_LATE_OTHER] = true;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function isOperational() public view returns (bool) {
        return flightSuretyData.isOperational();
    }

    /********************************************************************************************/
    /*                                        AIRLINE FUNCTIONS                                 */
    /********************************************************************************************/

    function _isRegisteredAirline(address _airline)
        internal
        view
        returns (bool)
    {
        bool registeredAirline = false;
        (, , registeredAirline, ) = flightSuretyData.getAirline(_airline);

        return registeredAirline;
    }

    function _isFundedAirline(address _airline) internal view returns (bool) {
        bool fundedAirline = false;
        (, , , fundedAirline) = flightSuretyData.getAirline(_airline);

        return fundedAirline;
    }

    function _registerFoundingAirline(address _airline)
        internal
        returns (bool success, uint256 votes)
    {
        flightSuretyData.registerAirline(_airline);
        emit AirlineRegistered(_airline);

        // Indicate that the founding airline was registered without needing a vote.
        return (true, 0);
    }

    function _registerAirlineByConsensus(
        address _airline,
        uint256 _numberOfFundedAirlines
    )
        internal
        requireUniqueVote(_airline)
        returns (bool success, uint256 votes)
    {
        Votes storage voters = multiPartyConsensusVotes[_airline];

        // Record that the caller has registered a vote for the airline.
        voters.noOfVoters = voters.noOfVoters.add(1);
        voters.votedAirlines[msg.sender] = true;

        // There must a 50% consensus amongst the funded airlines.
        uint256 noOfVoters = voters.noOfVoters;

        if (noOfVoters < _numberOfFundedAirlines.div(2)) {
            return (false, noOfVoters);
        } else {
            // Register the new airline as there has been a consensus.
            flightSuretyData.registerAirline(_airline);
            emit AirlineRegistered(_airline);

            // Tidy up the multi-party consensus votes.
            delete (multiPartyConsensusVotes[_airline]);

            return (true, noOfVoters);
        }
    }

    /**
     * @dev Add an airline to the registration queue
     *
     */
    function registerAirline(address _airline)
        external
        requireRequestFromFundedAirline
        requireNewAirline(_airline)
        returns (bool success, uint256 votes)
    {
        // Identify the number of airlines that have been funded
        // and use this to determine whether multi-party consensus is
        // required to register an airline or not.
        uint256 numberOfFundedAirlines = flightSuretyData
            .getNumberOfFundedAirlines();

        if (numberOfFundedAirlines < M) {
            return _registerFoundingAirline(_airline);
        } else {
            return
                _registerAirlineByConsensus(_airline, numberOfFundedAirlines);
        }
    }

    function fundAirline()
        external
        payable
        requireSufficientFunds
        requireRequestFromRegisteredAirline
    {
        flightSuretyData.updateAirlineToFunded.value(msg.value)(msg.sender);
        emit AirlineFunded(msg.sender);
    }

    /********************************************************************************************/
    /*                                         FLIGHT FUNCTIONS                                 */
    /********************************************************************************************/

    /**
     * @dev Register a future flight for insuring.
     *
     */
    function registerFlight(
        address _airline,
        string calldata _flight,
        uint256 _timestamp
    )
        external
        requireRequestFromRegisteredAirline
        requireNewFlight(_airline, _flight, _timestamp)
    {
        // Register the new airline as there has been a consensus.
        flightSuretyData.registerFlight(_airline, _flight, _timestamp);
        emit FlightRegistered(_airline, _flight, _timestamp);
    }

    function _isRegisteredFlight(
        address _airline,
        string memory _flight,
        uint256 _timestamp
    ) internal view returns (bool) {
        bool registeredFlight = false;
        (, , registeredFlight, , , ) = flightSuretyData.getFlight(
            _airline,
            _flight,
            _timestamp
        );

        return registeredFlight;
    }

    /**
     * @dev Called after oracle has updated flight status
     *
     */
    function processFlightStatus(
        address airline,
        string memory flight,
        uint256 timestamp,
        uint8 statusCode
    ) internal {
        // If the airline is at fault for a delay then credit all passengers that are insured.
        if (airlineFaults[statusCode]) {
            flightSuretyData.creditInsurees(
                airline,
                flight,
                timestamp,
                statusCode,
                FLIGHT_DELAY_CREDIT_FACTOR
            );

            emit InsuranceCredit(airline, flight, timestamp, statusCode);
        }
    }

    /********************************************************************************************/
    /*                                       INSURANCE FUNCTIONS                                */
    /********************************************************************************************/

    function _isPassengerInsured(
        address _airline,
        string memory _flight,
        uint256 _timestamp
    ) internal view returns (bool) {
        bool passengerInsured = false;

        (passengerInsured, , ) = flightSuretyData.getInsurance(
            _airline,
            _flight,
            _timestamp,
            msg.sender
        );

        return passengerInsured;
    }

    function buy(
        address _airline,
        string calldata _flight,
        uint256 _timestamp
    )
        external
        payable
        requireInsurancePayment
        requireRegisteredFlight(_airline, _flight, _timestamp)
        requireNewInsurance(_airline, _flight, _timestamp)
    {
        //Record that the passenger has bought insurance and pass on the funds to the data contract account.
        flightSuretyData.buy.value(msg.value)(
            _airline,
            _flight,
            _timestamp,
            msg.sender,
            msg.value
        );

        emit PassengerInsured(
            _airline,
            _flight,
            _timestamp,
            msg.sender,
            msg.value
        );
    }

    function withdraw() external payable {
        flightSuretyData.pay(msg.sender);
        emit PassengerWithdrawl(msg.sender);
    }

    function getCredit() external view returns (uint256 credit) {
        credit = flightSuretyData.getCredit(msg.sender);

        return (credit);
    }

    /********************************************************************************************/
    /*                                        ORACLE FUNCTIONS                                  */
    /********************************************************************************************/

    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus(
        address airline,
        string calldata flight,
        uint256 timestamp
    ) external {
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(
            abi.encodePacked(index, airline, flight, timestamp)
        );
        oracleResponses[key] = ResponseInfo({
            requester: msg.sender,
            isOpen: true
        });

        // Oracles are listening for this event to know when they should submit a response.
        emit OracleRequest(index, airline, flight, timestamp);
    }

    // region ORACLE MANAGEMENT

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;

    // Fee to be paid when registering oracle
    uint256 public constant REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 3;

    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;
    }

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Model for responses from oracles
    struct ResponseInfo {
        address requester; // Account that requested status
        bool isOpen; // If open, oracle responses are accepted
        mapping(uint8 => address[]) responses; // Mapping key is the status code reported
        // This lets us group responses and identify
        // the response that majority of the oracles
    }

    // Track all oracle responses
    // Key = hash(index, flight, timestamp)
    mapping(bytes32 => ResponseInfo) private oracleResponses;

    // Event fired each time an oracle submits a response
    event FlightStatusInfo(
        address airline,
        string flight,
        uint256 timestamp,
        uint8 status
    );

    event OracleReport(
        address airline,
        string flight,
        uint256 timestamp,
        uint8 status
    );

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(
        uint8 index,
        address airline,
        string flight,
        uint256 timestamp
    );

    // Register an oracle with the contract
    function registerOracle() external payable {
        // Require registration fee
        require(msg.value >= REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        // Assign the oracle that is currently calling to the indexes.
        oracles[msg.sender] = Oracle({isRegistered: true, indexes: indexes});
    }

    function getMyIndexes() external view returns (uint8[3] memory) {
        require(
            oracles[msg.sender].isRegistered,
            "Not registered as an oracle"
        );

        return oracles[msg.sender].indexes;
    }

    // Called by oracle when a response is available to an outstanding request
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three Indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome)
    function submitOracleResponse(
        uint8 index,
        address airline,
        string calldata flight,
        uint256 timestamp,
        uint8 statusCode
    ) external {
        require(
            (oracles[msg.sender].indexes[0] == index) ||
                (oracles[msg.sender].indexes[1] == index) ||
                (oracles[msg.sender].indexes[2] == index),
            "Index does not match oracle request"
        );

        bytes32 key = keccak256(
            abi.encodePacked(index, airline, flight, timestamp)
        );
        require(
            oracleResponses[key].isOpen,
            "Flight or timestamp do not match oracle request"
        );

        oracleResponses[key].responses[statusCode].push(msg.sender);

        // Information isn't considered verified until at least MIN_RESPONSES
        // oracles respond with the *** same *** information
        emit OracleReport(airline, flight, timestamp, statusCode);
        if (
            oracleResponses[key].responses[statusCode].length >= MIN_RESPONSES
        ) {
            emit FlightStatusInfo(airline, flight, timestamp, statusCode);

            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }

    function getFlightKey(
        address airline,
        string memory flight,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes(address account)
        internal
        returns (uint8[3] memory)
    {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);

        indexes[1] = indexes[0];
        while (indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while ((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex(address account) internal returns (uint8) {
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(
            uint256(
                keccak256(
                    abi.encodePacked(blockhash(block.number - nonce++), account)
                )
            ) % maxValue
        );

        if (nonce > 250) {
            nonce = 0; // Can only fetch blockhashes for last 256 blocks so we adapt
        }

        return random;
    }

    // endregion
}
