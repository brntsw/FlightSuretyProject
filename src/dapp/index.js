import DOM from "./dom";
import Contract from "./contract";
import "./flightsurety.css";

(async () => {
    let result = null;

    let contract = new Contract("localhost", () => {
        // Allow the passenger to buy insurance for a flight.
        DOM.elid("submit-buy").addEventListener("click", () => {
            let flight = DOM.elid("flight-number").value;

            contract.buyInsurance(flight, (error, result) => {
                audit([{ label: "Insurance Bought", error: error, value: flight }]);
            });
        });

        // Submit a request to the oracles to simulate credit being issued to the passenger.
        DOM.elid("submit-oracle").addEventListener("click", () => {
            let flight = DOM.elid("flight-number").value;
            contract.fetchFlightStatus(flight, (error, result) => {
                audit([{ label: "Fetch Flight Status", error: error, value: result.flight + " " + result.timestamp }]);
            });
        });

        // Submit a request to check the contract and passenger ether balances.
        DOM.elid("submit-credit").addEventListener("click", () => {
            contract.getCredit((error, result) => {
                var element = document.getElementById("creditBalance");
                element.value = result;
            });
        });

        // Submit a request to withdraw the passengers funds.
        DOM.elid("submit-withdrawl").addEventListener("click", () => {
            contract.withdraw((error, result) => {
                audit([{ label: "Withdrawn", error: error, value: result.passenger }]);
            });
        });
    });
})();

function audit(results) {
    let displayDiv = DOM.elid("display-wrapper");
    let section = DOM.section();
    results.map((result) => {
        let row = section.appendChild(DOM.div({ className: "row" }));
        row.appendChild(DOM.div({ className: "col-sm-4 field" }, result.label));
        row.appendChild(DOM.div({ className: "col-sm-8 field-value" }, result.error ? String(result.error) : String(result.value)));
        section.appendChild(row);
    });
    displayDiv.append(section);
}
