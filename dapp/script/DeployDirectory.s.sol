// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/AgentDirectory.sol";

/// @notice Deploy + verify AgentDirectory on 0G testnet
/// Usage:
///   source .env
///   forge script script/DeployDirectory.s.sol:DeployDirectory \
///     --rpc-url https://evmrpc-testnet.0g.ai \
///     --broadcast \
///     --with-gas-price 3000000000 \
///     --priority-gas-price 2000000000 \
///     --verify \
///     --verifier-url https://chainscan-galileo.0g.ai/open/api \
///     --chain-id 16602
contract DeployDirectory is Script {
    function run() external {
        uint256 pk = vm.envUint("OG_DEPLOYER");
        vm.startBroadcast(pk);

        AgentDirectory directory = new AgentDirectory();
        console.log("AgentDirectory deployed at:", address(directory));

        vm.stopBroadcast();
    }
}
