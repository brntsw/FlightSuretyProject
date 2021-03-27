const fs = require('fs');

var HDWalletProvider = require("truffle-hdwallet-provider");
const mnemonic = fs.readFileSync(".mnemonic").toString().trim();
const infuraKey = fs.readFileSync(".infura-secret").toString().trim();

module.exports = {
    networks: {
        development: {
            host: "127.0.0.1", // Localhost (default: none)
            port: 8545, // Standard Ethereum port (default: none)
            network_id: "*", // Any network (default: none)
            gas: 900000,
        },
        rinkeby: {
            provider: () => new HDWalletProvider(mnemonic, `https://rinkeby.infura.io/v3/${infuraKey}`),
            network_id: 4,       // rinkeby's id
            gas: 4500000,        // rinkeby has a lower block limit than mainnet
            gasPrice: 10000000000
        }
    },
    compilers: {
        solc: {
            version: "^0.5.15",
        },
    },
};
